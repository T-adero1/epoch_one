from http.server import BaseHTTPRequestHandler
import json
import os
import sys
import base64
import hashlib
import subprocess
import tempfile,traceback
from pathlib import Path
import uuid
from typing import Dict, List, Any, Optional
import time
import requests
import datetime
import re

# Add the root directory to path so we can import other modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from api.walrus_sdk_manager import WalrusSDKManager

from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Constants
SEAL_PACKAGE_ID = os.environ.get('NEXT_PUBLIC_SEAL_PACKAGE_ID')
ALLOWLIST_PACKAGE_ID = os.environ.get('NEXT_PUBLIC_ALLOWLIST_PACKAGE_ID', SEAL_PACKAGE_ID)
ADMIN_PRIVATE_KEY = os.environ.get('ADMIN_PRIVATE_KEY')
NETWORK = os.environ.get('NETWORK', 'testnet')
MODULE_NAME = os.environ.get('MODULE_NAME', 'allowlist')

# Path to the Node.js SEAL integration scripts
SEAL_SCRIPT_PATH = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'api', 'upload_encrypt_download_decrypt'))
print(f"[SEAL] Scripts directory path: {SEAL_SCRIPT_PATH}")

# This path is ONLY used for local development now
SEAL_SCRIPT_PATH_LOCAL = os.path.abspath(os.path.join(os.path.dirname(__file__), 'upload_encrypt_download_decrypt'))

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        # Parse request body
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        
        try:
            data = json.loads(post_data)
            response_data = process_encrypt_and_upload(data)
            
            # Send response
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(response_data).encode())
                
        except json.JSONDecodeError:
            self.send_error(400, "Invalid JSON data")
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            error_response = {
                'error': str(e),
                'traceback': str(sys.exc_info())
            }
            self.wfile.write(json.dumps(error_response).encode())
    
    def do_GET(self):
        # Simple endpoint info for GET requests
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        
        response = {
            'message': 'SEAL Encrypt and Upload endpoint',
            'usage': 'Send a POST request with contractId, documentContent, and signerAddresses fields',
            'method': 'POST'
        }
        
        self.wfile.write(json.dumps(response).encode())

def log_message(message, data=None, is_error=False):
    timestamp = datetime.datetime.now().isoformat()
    log_prefix = "[ERROR]" if is_error else "[INFO]"
    full_message = f"[{timestamp}] {log_prefix} {message}"
    if data:
        try:
            # Attempt to serialize data to JSON for structured logging
            print(full_message, json.dumps(data, indent=2, default=str))
        except TypeError:
            # Fallback to string representation if data is not JSON serializable
            print(full_message, data)
    else:
        print(full_message)

def process_encrypt_and_upload(data: Dict[str, Any]) -> Dict[str, Any]:
    """Process the encryption and upload request data and return response"""
    print("=" * 80)
    print(f"[SEAL] Processing encrypt and upload request for contract: {data.get('contractId')}")
    
    # Check if required fields are present
    if not all(k in data for k in ['contractId', 'documentContent', 'signerAddresses']):
        raise ValueError("Missing required fields: contractId, documentContent, and signerAddresses are required")

    # Extract data
    contract_id = data['contractId']
    document_content = data['documentContent']
    is_base64 = data.get('isBase64', False)
    signer_addresses = data.get('signerAddresses', [])
    
    print(f"[SEAL] Contract ID: {contract_id}")
    print(f"[SEAL] Content is base64: {is_base64}")
    print(f"[SEAL] Content length: {len(document_content) if isinstance(document_content, str) else 'binary data'}")
    print(f"[SEAL] Signer addresses: {', '.join(signer_addresses[:2]) + ('...' if len(signer_addresses) > 2 else '')}")
    
    # Check if SEAL encryption is enabled
    if not SEAL_PACKAGE_ID:
        print("[SEAL] ERROR: SEAL package ID not configured")
        return {
            'encrypted': False,
            'message': 'SEAL encryption not configured'
        }
    
    # Get document content as bytes
    if is_base64:
        try:
            content_bytes = base64.b64decode(document_content)
        except:
            raise ValueError("Invalid base64 content")
    else:
        # If it's a string, convert to bytes
        if isinstance(document_content, str):
            content_bytes = document_content.encode('utf-8')
        else:
            content_bytes = document_content
    
    # Create a temporary file for the document
    with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
        temp_file_path = temp_file.name
        temp_file.write(content_bytes)
    
    try:
        # Create a configuration file for the SEAL operations
        config = {
            "operation": "encrypt",
            "documentPath": temp_file_path,
            "documentContentBase64": base64.b64encode(content_bytes).decode('utf-8'),
            "contractId": contract_id,
            "signerAddresses": signer_addresses,
            "adminPrivateKey": ADMIN_PRIVATE_KEY or "admin_key_placeholder",
            "sealPackageId": SEAL_PACKAGE_ID or "seal_test_package_id",
            "allowlistPackageId": ALLOWLIST_PACKAGE_ID,
            "network": NETWORK
        }
        
        # Write config to a temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.json') as config_file:
            config_path = config_file.name
            config_file.write(json.dumps(config).encode('utf-8'))
        
        print(f"[SEAL] Created config file: {config_path}")
        print(f"[SEAL] Running seal_operations.js with config: {config_path}")
        
        # Determine environment
        # VERCEL_ENV can be 'production', 'preview', or 'development'
        is_production_environment = os.environ.get('VERCEL_ENV') == 'production'
        log_message(f"Environment detected: {'Production (Vercel)' if is_production_environment else 'Local/Development'}")
        log_message(f"SEAL_SCRIPT_PATH resolved to: {SEAL_SCRIPT_PATH}") # Ensure SEAL_SCRIPT_PATH is correctly defined and logged

        stdout_data = None
        stderr_data = None
        # process_returncode = None # If you were checking this

        if is_production_environment:
            log_message("[SEAL] Running in PRODUCTION mode. Using HTTP call to Node.js SEAL function.")
            
            # Production path: Call another Vercel function (Node.js) via HTTP
            # You'll need to create this new Node.js function (e.g., api/perform_seal_node_operations.js)
            
            # 1. Read content of config_path (if it's a file path and needs to be sent)
            #    This depends on what 'config_path' is and what the Node.js script expects.
            #    If config_path is a path to a temp file you created with JSON data:
            config_content_for_node = {}
            try:
                with open(config_path, 'r') as f:
                    config_content_for_node = json.load(f)
                log_message(f"[SEAL] Successfully read config data from {config_path} for Node.js function call.")
            except Exception as e:
                log_message(f"[SEAL] Failed to read or parse config_path {config_path}: {e}", is_error=True)
                raise Exception(f"Failed to prepare config data for Node.js SEAL function: {e}") from e

            # 2. Construct payload
            payload = {
                "configData": config_content_for_node,
                # Add any other parameters your seal_operations.js script might need
                # that were previously passed via command line or environment
            }
            
            # 3. Make an HTTP POST request
            # IMPORTANT: Create this new Node.js API route (e.g., /api/perform-seal-operations)
            app_base_url = os.environ.get('NEXT_PUBLIC_APP_URL', 'http://localhost:3000').rstrip('/')
            node_seal_function_url = f"{app_base_url}/api/perform-seal-operations"
            log_message(f"[SEAL] Corrected Node.js SEAL function URL: {node_seal_function_url}")
            
            try:
                # Using requests library (ensure 'requests' is in your requirements.txt)
                response = requests.post(node_seal_function_url, json=payload, timeout=55) # Timeout slightly less than function max duration
                response.raise_for_status() # Raises an HTTPError for bad responses (4XX or 5XX)
                
                # Assuming the Node.js function returns JSON in its response body
                stdout_data = response.content # Keep as bytes, as subprocess.communicate() returns bytes
                stderr_data = b"" # Assume errors are handled by raise_for_status or in the response body
                # process_returncode = 0 # Indicate success
                log_message(f"[SEAL] HTTP call to Node.js SEAL function successful. Response length: {len(stdout_data)} bytes.")
                
            except requests.exceptions.Timeout:
                log_message(f"[SEAL] HTTP request to Node.js SEAL function timed out.", is_error=True)
                raise TimeoutError(f"Call to internal Node.js SEAL function timed out: {node_seal_function_url}") from None
            except requests.exceptions.RequestException as e:
                log_message(f"[SEAL] HTTP request to Node.js SEAL function failed: {e}", is_error=True)
                if e.response is not None:
                    log_message(f"[SEAL] Node.js function error response: {e.response.status_code} - {e.response.text[:500]}", is_error=True) # Log response body if available
                raise Exception(f"Call to internal Node.js SEAL function failed: {e}") from e

        else: # Local development path
            log_message("[SEAL] Running in LOCAL mode. Using Node.js subprocess.")
            node_script_full_path = os.path.join(SEAL_SCRIPT_PATH, 'seal_operations.js')

            if not os.path.exists(node_script_full_path):
                log_message("[SEAL] ERROR: Node.js script not found", is_error=True)
                raise FileNotFoundError(f"Node.js script for SEAL operations not found: {node_script_full_path}")
            if not os.path.exists(config_path):
                log_message("[SEAL] ERROR: Config file not found", is_error=True) 
                raise FileNotFoundError(f"Config file for Node.js script not found: {config_path}")

            command = ['node', node_script_full_path, config_path]
            log_message("[SEAL] Executing Node.js script")

            # Set up enhanced environment for Node.js subprocess
            enhanced_env = os.environ.copy()
            enhanced_env.update({
                'SEAL_VERBOSE': 'true', 
                'SEAL_DEBUG': 'true',
                'SEAL_LOG_LEVEL': 'debug'
            })

            log_message("[SEAL] Executing Node.js script with enhanced logging")

            # Use the enhanced environment in the subprocess call
            process = subprocess.Popen(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=SEAL_SCRIPT_PATH,
                env=enhanced_env  # Pass the enhanced environment here
            )

            try:
                stdout_data, stderr_data = process.communicate(timeout=55)

                # Try to extract JSON result which will contain logs
                try:
                    # Look for a valid JSON object in the output
                    json_match = re.search(r'\{[\s\S]*\}', stdout_data.decode('utf-8', 'ignore'))
                    if json_match:
                        result = json.loads(json_match.group(0))
                        if result.get('logs'):
                            detailed_logs = result['logs']
                            print("\n=== DETAILED SEAL OPERATION LOGS ===")
                            print(detailed_logs)
                            print("=== END DETAILED LOGS ===\n")
                except Exception as e:
                    print(f"[SEAL] Error parsing JSON result: {e}")

            except subprocess.TimeoutExpired:
                log_message("[SEAL] Node.js script timed out during local execution.", is_error=True)
                if process:
                    process.kill()
                    # Try to get any output
                    _stdout, _stderr = process.communicate()
                    if _stdout: log_message(f"[SEAL] Timeout stdout: {_stdout.decode('utf-8','ignore')}")
                    if _stderr: log_message(f"[SEAL] Timeout stderr: {_stderr.decode('utf-8','ignore')}", is_error=True)
                raise TimeoutError("SEAL Node.js script execution timed out locally.")
            except FileNotFoundError as e:
                # This would typically be if 'node' itself is not found in local PATH
                log_message(f"[SEAL] FileNotFoundError during local subprocess.Popen (e.g., 'node' not found): {e}", is_error=True)
                raise e
            except Exception as e:
                log_message(f"[SEAL] An unexpected error occurred while running local Node.js script: {e}", is_error=True)
                log_message(traceback.format_exc(), is_error=True)
                raise e

        # Common handling for result (whether from subprocess or HTTP call)
        if stdout_data is None: # Should not happen if logic is correct, but as a safeguard
            log_message("[SEAL] CRITICAL: stdout_data is None after conditional execution.", is_error=True)
            raise Exception("SEAL operation did not produce any output.")

        if stderr_data: # Or if process_returncode != 0 and you use that
            # This primarily applies to local dev if node script writes to stderr and continues
            # For production HTTP, errors are usually exceptions or in stdout_data (if not JSON)
            log_message(f"[SEAL] Operation may have had issues. Stderr: {stderr_data.decode('utf-8', 'ignore')}", is_error=True)
            # Decide if this constitutes a failure. If the node script outputs to stderr for warnings but still gives valid JSON on stdout,
            # you might not want to raise an exception here.

        # Don't try to parse JSON, just use the raw output directly
        output_lines = stdout_data.decode('utf-8', 'ignore').split('\n')
        
        # Extract all relevant SEAL information from output
        blob_id = None
        allowlist_id = None
        document_id = None
        cap_id = None
        
        # Look for all IDs in the output lines
        for line in output_lines:
            if 'Blob ID:' in line:
                blob_id = line.split('Blob ID:')[1].strip()
            elif 'Allowlist ID:' in line:
                allowlist_id = line.split('Allowlist ID:')[1].strip()
            elif 'Document ID:' in line or 'Document ID (hex):' in line:
                document_id = line.split(':')[1].strip()
            elif 'Capability ID:' in line or 'Cap ID:' in line:
                cap_id = line.split(':')[1].strip()
        
        # Create response with all found values
        response_data = {
            'contractId': contract_id,
            'encrypted': True,
            'blobId': blob_id,
            'allowlistId': allowlist_id,
            'documentId': document_id,
            'capId': cap_id,
            'raw_success': True,
            'message': 'SEAL encryption succeeded'
        }
        
        print(f"[SEAL] Document successfully encrypted and uploaded")
        if blob_id:
            print(f"[SEAL] Blob ID: {blob_id}")
        if allowlist_id:
            print(f"[SEAL] Allowlist ID: {allowlist_id}")
        if document_id:
            print(f"[SEAL] Document ID: {document_id}")
        if cap_id:
            print(f"[SEAL] Capability ID: {cap_id}")
        
        return response_data
    except Exception as e:
        print(f"[SEAL] Exception running SEAL operation: {str(e)}")
        print("[SEAL] Traceback:")
        print(traceback.format_exc())
        
        # Try standard upload as fallback
        print("[SEAL] Falling back to standard upload")
        raise Exception(f"SEAL Encryption Failed: {str(e)}") from e
        
    finally:
        # Clean up temporary files
        if os.path.exists(temp_file_path):
            os.unlink(temp_file_path)
        if 'config_path' in locals() and os.path.exists(config_path):
            os.unlink(config_path)

def fallback_standard_upload(file_path: str, contract_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Fallback to standard upload if SEAL encryption fails"""
    print(f"[SEAL] Performing standard (non-encrypted) upload for contract: {contract_id}")
    
    try:
        # Calculate hash
        with open(file_path, 'rb') as f:
            content = f.read()
            hash_sha256 = hashlib.sha256(content).digest().hex()
        
        # Initialize Walrus SDK Manager
        context = data.get('context', 'testnet')
        walrus_manager = WalrusSDKManager(context=context, verbose=True)
        
        # Upload to Walrus
        epochs = data.get('epochs', 2)
        deletable = data.get('deletable', False)
        
        blob_id = walrus_manager.upload_document(
            file_path,
            epochs=epochs,
            deletable=deletable
        )
        
        print(f"[SEAL] Standard upload successful, blob ID: {blob_id}")
        
        # Prepare response with metadata
        response_data = {
            'contractId': contract_id,
            'encrypted': False,
            'blobId': blob_id,
            'hash': hash_sha256,
            'message': 'Standard upload (no encryption)'
        }
        
        return response_data
        
    except Exception as e:
        print(f"[SEAL] Error during standard upload: {str(e)}")
        raise ValueError(f"Standard upload failed: {str(e)}") 