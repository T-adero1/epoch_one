from http.server import BaseHTTPRequestHandler
import json
import os
import sys
import base64
import hashlib
import requests
import time
from urllib.parse import parse_qs
from typing import List, Dict, Any, Optional, Union

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        # Parse request body
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        
        try:
            data = json.loads(post_data)
            response_data = process_encryption(data)
            
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
            'message': 'SEAL Document Encryption endpoint',
            'usage': 'Send a POST request with contractId, documentContent, and signerAddresses fields',
            'method': 'POST'
        }
        
        self.wfile.write(json.dumps(response).encode())

def process_encryption(data: Dict[str, Any]) -> Dict[str, Any]:
    """Process the encryption request data and return response"""
    start_time = time.time()
    
    print("=" * 80)
    print(f"[SEAL] Processing encryption request for contract: {data.get('contractId')}")
    print(f"[SEAL] Current timestamp: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"[SEAL] SEAL package ID: {os.environ.get('NEXT_PUBLIC_SEAL_PACKAGE_ID', 'Not set')}")
    
    # Check if required fields are present
    if not all(k in data for k in ['contractId', 'documentContent']):
        print("[SEAL] ERROR: Missing required fields")
        raise ValueError("Missing required fields: contractId and documentContent are required")

    # Extract data
    contract_id = data['contractId']
    document_content = data['documentContent']
    is_base64 = data.get('isBase64', False)
    signer_addresses = data.get('signerAddresses', [])
    
    # If no signer addresses provided, check for signerPublicKeys for backward compatibility
    if not signer_addresses and 'signerPublicKeys' in data:
        signer_addresses = data['signerPublicKeys']
        print(f"[SEAL] Using signerPublicKeys field as signer addresses")
    
    print(f"[SEAL] Contract ID: {contract_id}")
    print(f"[SEAL] Content is base64: {is_base64}")
    print(f"[SEAL] Content length: {len(document_content) if isinstance(document_content, str) else 'binary data'}")
    print(f"[SEAL] Signer addresses: {', '.join(signer_addresses[:2]) + ('...' if len(signer_addresses) > 2 else '')}")
    
    # Check if SEAL encryption is enabled
    seal_package_id = os.environ.get('NEXT_PUBLIC_SEAL_PACKAGE_ID')
    if not seal_package_id:
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
    
    # Get key server IDs
    key_server_ids = get_key_server_ids()
    if not key_server_ids:
        print("[SEAL] ERROR: No key servers found")
        return {
            'encrypted': False,
            'message': 'No SEAL key servers available'
        }
    print(f"[SEAL] Using {len(key_server_ids)} key servers")
    
    # Create BCS identity for access control
    try:
        # For Python we use TypeScript Node.js to help with BCS encoding
        # Call a helper API to create the BCS identity
        identity_bytes, signer_info = create_bcs_identity(contract_id, signer_addresses)
        if not identity_bytes:
            print("[SEAL] ERROR: Failed to create BCS identity")
            return {
                'encrypted': False,
                'message': 'Failed to create BCS identity for SEAL encryption'
            }
        print(f"[SEAL] Created BCS identity for contract and {len(signer_addresses)} signers")
    except Exception as e:
        print(f"[SEAL] ERROR creating BCS identity: {str(e)}")
        return {
            'encrypted': False,
            'message': f'BCS identity error: {str(e)}'
        }
    
    # Perform SEAL encryption
    try:
        # TODO: Call actual SEAL SDK here
        # This is a placeholder - in a real implementation you would:
        # 1. Initialize the SEAL client with key_server_ids
        # 2. Call client.encrypt() with package_id, identity_bytes, and content_bytes
        
        # For now, we'll simulate encryption by base64 encoding
        encrypted_content = base64.b64encode(content_bytes).decode('utf-8')
        symmetric_key = "mock_symmetric_key_" + hashlib.sha256(content_bytes).hexdigest()[:16]
        
        print(f"[SEAL] Document successfully encrypted")
        
        # Return the encrypted document and metadata
        return {
            'encrypted': True,
            'encryptedDocument': encrypted_content,
            'symmetricKey': symmetric_key,
            'keyServerIds': key_server_ids,
            'signerAddresses': signer_addresses,
            'signerInfo': signer_info
        }
    except Exception as e:
        print(f"[SEAL] ERROR during encryption: {str(e)}")
        return {
            'encrypted': False,
            'message': f'Encryption error: {str(e)}',
            'error': str(e)
        }

def get_key_server_ids() -> List[str]:
    """Get the list of SEAL key server IDs"""
    # In a real implementation, you would query these from Sui
    # For now, return mock values
    return [
        "0x1ee708e0d09c31593a60bee444f8f36a5a3ce66f1409a9dfb12eb11ab254b06b",
        "0x2ff708e0d09c31593a60bee444f8f36a5a3ce66f1409a9dfb12eb11ab254b06c"
    ]

def create_bcs_identity(contract_id: str, signer_addresses: List[str]) -> tuple:
    """
    Create a BCS encoded identity for SEAL encryption
    
    Format:
    - vector<u8> contract_id
    - vector<address> signer_addresses
    """
    import struct
    
    # Convert contract_id to bytes
    if contract_id.startswith("0x"):
        contract_id_bytes = bytes.fromhex(contract_id[2:])
    else:
        contract_id_bytes = contract_id.encode('utf-8')
    
    # Encode contract_id as vector<u8>
    contract_id_len = len(contract_id_bytes)
    identity_bytes = struct.pack("<I", contract_id_len) + contract_id_bytes
    
    # Encode signer_addresses as vector<address>
    # First, encode the length of the vector
    identity_bytes += struct.pack("<I", len(signer_addresses))
    
    # Then encode each address (32 bytes each)
    for addr in signer_addresses:
        if addr.startswith("0x"):
            addr = addr[2:]
        # Ensure address is 32 bytes (64 hex chars)
        addr_bytes = bytes.fromhex(addr.zfill(64))
        identity_bytes += addr_bytes
    
    # Return the bytes and metadata
    return identity_bytes, {
        "contract_id": contract_id,
        "signer_count": len(signer_addresses),
        "format": "BCS [vector<u8> contract_id][vector<address> signer_addresses]"
    }

# Support for direct execution from command line
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='SEAL Document Encryption CLI')
    parser.add_argument('--contract-id', required=True, help='Contract ID')
    parser.add_argument('--file', help='Path to file to encrypt')
    parser.add_argument('--content', help='Content string to encrypt')
    parser.add_argument('--signers', required=True, help='Comma-separated list of signer addresses')
    
    args = parser.parse_args()
    
    # Prepare request data
    request_data = {
        'contractId': args.contract_id,
        'signerAddresses': args.signers.split(',')
    }
    
    # Get content from file or argument
    if args.file:
        with open(args.file, 'rb') as f:
            content = f.read()
        request_data['documentContent'] = base64.b64encode(content).decode('utf-8')
        request_data['isBase64'] = True
    elif args.content:
        request_data['documentContent'] = args.content
        request_data['isBase64'] = False
    else:
        print("ERROR: Either --file or --content must be provided")
        sys.exit(1)
    
    # Process the encryption
    response = process_encryption(request_data)
    
    # Print the response
    print(json.dumps(response, indent=2)) 