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
        print(f"[SEAL] Running seal_operations.js with config: {config_path}")
        
        # Run the SEAL operation and capture output
        process = subprocess.Popen(
            ['node', os.path.join(SEAL_SCRIPT_PATH, 'seal_operations.js'), config_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        
        # Get return code and output
        stdout, stderr = process.communicate()
        return_code = process.returncode
        print(f"[SEAL] SEAL operation completed with return code: {return_code}")
        
        # Safely decode stdout with utf-8, replacing problematic characters
        stdout_text = stdout.decode('utf-8', errors='replace')
        
        # Check if the operation was successful based on return code
        if return_code == 0:
            # Extract all relevant SEAL information from output
            blob_id = None
            allowlist_id = None
            document_id = None
            cap_id = None
            
            # Look for all IDs in the output
            for line in stdout_text.split('\n'):
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
        else:
            # Operation failed - return an error without trying to parse
            print(f"[SEAL] SEAL operation failed with code: {result.returncode}")
            
            # Create a simple error response without trying to parse stdout/stderr
            error_response = {
                'contractId': contract_id,
                'encrypted': False,
                'raw_success': False,
                'message': f'SEAL encryption failed: Return code {result.returncode}',
            }
            
            # Fall back to standard upload
            print("[SEAL] Falling back to standard upload")
            #return fallback_standard_upload(temp_file_path, contract_id, data)
        
    except Exception as e:
        print(f"[SEAL] Exception running SEAL operation: {str(e)}")
        print("[SEAL] Traceback:")
        print(traceback.format_exc())
        
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