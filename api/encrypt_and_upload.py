from http.server import BaseHTTPRequestHandler
import json
import os
import sys
import base64
import hashlib
import subprocess
import tempfile
from pathlib import Path
import uuid
from typing import Dict, List, Any, Optional

# Add the root directory to path so we can import other modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from api.walrus_sdk_manager import WalrusSDKManager

# Constants
SEAL_PACKAGE_ID = os.environ.get('NEXT_PUBLIC_SEAL_PACKAGE_ID')
ALLOWLIST_PACKAGE_ID = os.environ.get('NEXT_PUBLIC_ALLOWLIST_PACKAGE_ID', SEAL_PACKAGE_ID)
ADMIN_PRIVATE_KEY = os.environ.get('ADMIN_PRIVATE_KEY')
NETWORK = os.environ.get('NETWORK', 'testnet')
MODULE_NAME = os.environ.get('MODULE_NAME', 'allowlist')

# Path to the Node.js SEAL integration scripts
SEAL_SCRIPT_PATH = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'api', 'upload_encrypt_download_decrypt'))
print(f"[SEAL] Scripts directory path: {SEAL_SCRIPT_PATH}")

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
        print(f"[SEAL] Running seal_operations.js with config")
        
        # Run the seal_operations.js script
        cmd = f"cd {SEAL_SCRIPT_PATH} && node seal_operations.js {config_path}"
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        
        # Check if the operation was successful
        if result.returncode != 0:
            print(f"[SEAL] Error in SEAL operation: {result.stderr}")
            raise ValueError(f"SEAL operation failed: {result.stderr}")
        
        # Parse the operation result from stdout
        try:
            # Look for a JSON object in the output
            output_lines = result.stdout.strip().split('\n')
            result_json = None
            
            for line in output_lines:
                if line.startswith('{') and line.endswith('}'):
                    try:
                        result_json = json.loads(line)
                        if isinstance(result_json, dict) and 'success' in result_json:
                            break
                    except json.JSONDecodeError:
                        continue
            
            if not result_json:
                raise ValueError("Could not parse operation result from output")
            
            if not result_json.get('success', False):
                error_message = result_json.get('error', 'Unknown error')
                raise ValueError(f"SEAL operation failed: {error_message}")
            
            # Format the response
            response_data = {
                'contractId': contract_id,
                'encrypted': True,
                'blobId': result_json.get('blobId'),
                'allowlistId': result_json.get('allowlistId'),
                'capId': result_json.get('capId'),
                'documentId': result_json.get('documentIdHex'),
                'signerAddresses': signer_addresses,
                'encryption': {
                    'method': 'seal',
                    'packageId': SEAL_PACKAGE_ID,
                    'allowlistId': result_json.get('allowlistId'),
                    'documentId': result_json.get('documentIdHex'),
                    'signerAddresses': signer_addresses
                }
            }
            
            print(f"[SEAL] Document successfully encrypted and uploaded")
            print(f"[SEAL] Blob ID: {result_json.get('blobId')}")
            
            return response_data
            
        except Exception as parse_error:
            print(f"[SEAL] Error parsing operation result: {str(parse_error)}")
            print(f"[SEAL] Operation stdout: {result.stdout}")
            print(f"[SEAL] Operation stderr: {result.stderr}")
            
            raise ValueError(f"Failed to parse SEAL operation result: {str(parse_error)}")
        
    except Exception as e:
        print(f"[SEAL] ERROR during encryption/upload: {str(e)}")
        
        # Try standard upload as fallback
        print("[SEAL] Falling back to standard upload")
        return fallback_standard_upload(temp_file_path, contract_id, data)
        
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