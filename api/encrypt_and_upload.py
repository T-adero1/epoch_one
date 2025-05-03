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
SEAL_SCRIPT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'upload_encrypt_download_decrypt')

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
        # Step 1: Create an allowlist for this contract
        allowlist_id, cap_id = create_allowlist(contract_id)
        if not allowlist_id or not cap_id:
            raise ValueError("Failed to create allowlist")
        
        # Step 2: Add signers to the allowlist
        add_users_to_allowlist(allowlist_id, cap_id, signer_addresses)
        
        # Step 3: Generate document ID using allowlist ID
        document_id_hex = create_document_id(allowlist_id, contract_id)
        
        # Step 4: Encrypt the document
        encrypted_file_path = encrypt_document(temp_file_path, document_id_hex)
        
        # Step 5: Upload to Walrus
        walrus_manager = WalrusSDKManager(context=NETWORK, verbose=True)
        blob_id = walrus_manager.upload_document(
            encrypted_file_path,
            epochs=2,
            deletable=False
        )
        
        # Step 6: Register blob in allowlist
        publish_blob_to_allowlist(allowlist_id, cap_id, blob_id)
        
        # Prepare response with metadata
        response_data = {
            'contractId': contract_id,
            'encrypted': True,
            'blobId': blob_id,
            'allowlistId': allowlist_id,
            'capId': cap_id,
            'documentId': document_id_hex,
            'signerAddresses': signer_addresses,
            'encryption': {
                'method': 'seal',
                'packageId': SEAL_PACKAGE_ID,
                'allowlistId': allowlist_id,
                'documentId': document_id_hex,
                'signerAddresses': signer_addresses
            }
        }
        
        print(f"[SEAL] Document successfully encrypted and uploaded")
        print(f"[SEAL] Blob ID: {blob_id}")
        
        return response_data
        
    except Exception as e:
        print(f"[SEAL] ERROR during encryption/upload: {str(e)}")
        return {
            'encrypted': False,
            'message': f'Encryption/upload error: {str(e)}',
            'error': str(e)
        }
    finally:
        # Clean up temporary files
        if os.path.exists(temp_file_path):
            os.unlink(temp_file_path)

def create_allowlist(contract_id: str) -> tuple:
    """Create an allowlist for the contract"""
    print(f"[SEAL] Creating allowlist for contract: {contract_id}")
    
    if not ADMIN_PRIVATE_KEY:
        raise ValueError("ADMIN_PRIVATE_KEY environment variable not set")
    
    # Execute the Node.js script to create an allowlist
    group_name = f"Contract-{contract_id[:8]}-{uuid.uuid4().hex[:8]}"
    
    # Create a temporary script to invoke the blockchain operations
    temp_script = f"""
    const blockchain = require('./fixed_blockchain');
    const utils = require('./fixed_utils');
    
    async function createAllowlistForContract() {{
        // Initialize Sui client
        const suiClient = await utils.initSuiClient();
        
        // Create admin keypair
        const adminKeypair = utils.privateKeyToKeypair('{ADMIN_PRIVATE_KEY}');
        
        // Create allowlist
        const {{ allowlistId, capId }} = await blockchain.createAllowlist(
            suiClient, 
            adminKeypair, 
            "{group_name}"
        );
        
        console.log(JSON.stringify({{ allowlistId, capId }}));
    }}
    
    createAllowlistForContract().catch(error => {{
        console.error(error);
        process.exit(1);
    }});
    """
    
    with tempfile.NamedTemporaryFile(delete=False, suffix='.js') as script_file:
        script_path = script_file.name
        script_file.write(temp_script.encode('utf-8'))
    
    try:
        # Execute the temporary script
        command = f"cd {SEAL_SCRIPT_PATH} && node {script_path}"
        result = subprocess.run(command, shell=True, capture_output=True, text=True)
        
        if result.returncode != 0:
            print(f"[SEAL] Error creating allowlist: {result.stderr}")
            raise ValueError(f"Failed to create allowlist: {result.stderr}")
        
        # Extract the allowlist and cap IDs from the output
        output_lines = result.stdout.strip().split('\n')
        for line in output_lines:
            if line.startswith('{') and line.endswith('}'):
                try:
                    data = json.loads(line)
                    allowlist_id = data.get('allowlistId')
                    cap_id = data.get('capId')
                    if allowlist_id and cap_id:
                        print(f"[SEAL] Allowlist created: {allowlist_id}")
                        print(f"[SEAL] Cap ID: {cap_id}")
                        return allowlist_id, cap_id
                except json.JSONDecodeError:
                    continue
        
        raise ValueError("Could not extract allowlist and cap IDs from script output")
    finally:
        # Clean up temporary script
        if os.path.exists(script_path):
            os.unlink(script_path)

def add_users_to_allowlist(allowlist_id: str, cap_id: str, user_addresses: List[str]):
    """Add users to the allowlist"""
    print(f"[SEAL] Adding {len(user_addresses)} users to allowlist")
    
    if not ADMIN_PRIVATE_KEY:
        raise ValueError("ADMIN_PRIVATE_KEY environment variable not set")
    
    # Execute the Node.js script to add users to the allowlist
    user_addresses_json = json.dumps(user_addresses)
    
    # Create a temporary script to invoke the blockchain operations
    temp_script = f"""
    const blockchain = require('./fixed_blockchain');
    const utils = require('./fixed_utils');
    
    async function addUsersToAllowlist() {{
        // Initialize Sui client
        const suiClient = await utils.initSuiClient();
        
        // Create admin keypair
        const adminKeypair = utils.privateKeyToKeypair('{ADMIN_PRIVATE_KEY}');
        
        // Add users to allowlist
        const userAddresses = {user_addresses_json};
        await blockchain.addMultipleUsersToAllowlist(
            suiClient,
            adminKeypair,
            "{allowlist_id}",
            "{cap_id}",
            userAddresses
        );
        
        console.log(JSON.stringify({{ success: true, usersAdded: userAddresses.length }}));
    }}
    
    addUsersToAllowlist().catch(error => {{
        console.error(error);
        process.exit(1);
    }});
    """
    
    with tempfile.NamedTemporaryFile(delete=False, suffix='.js') as script_file:
        script_path = script_file.name
        script_file.write(temp_script.encode('utf-8'))
    
    try:
        # Execute the temporary script
        command = f"cd {SEAL_SCRIPT_PATH} && node {script_path}"
        result = subprocess.run(command, shell=True, capture_output=True, text=True)
        
        if result.returncode != 0:
            print(f"[SEAL] Error adding users to allowlist: {result.stderr}")
            raise ValueError(f"Failed to add users to allowlist: {result.stderr}")
        
        print(f"[SEAL] Users added to allowlist successfully")
    finally:
        # Clean up temporary script
        if os.path.exists(script_path):
            os.unlink(script_path)

def create_document_id(allowlist_id: str, contract_id: str) -> str:
    """Create a document ID using the allowlist ID and contract ID"""
    print(f"[SEAL] Creating document ID for allowlist: {allowlist_id}")
    
    # Execute the Node.js script to create a document ID
    temp_script = f"""
    const utils = require('./fixed_utils');
    
    function createDocumentId() {{
        const {{ documentIdHex }} = utils.createDocumentId("{allowlist_id}", "{contract_id}");
        console.log(JSON.stringify({{ documentIdHex }}));
    }}
    
    createDocumentId();
    """
    
    with tempfile.NamedTemporaryFile(delete=False, suffix='.js') as script_file:
        script_path = script_file.name
        script_file.write(temp_script.encode('utf-8'))
    
    try:
        # Execute the temporary script
        command = f"cd {SEAL_SCRIPT_PATH} && node {script_path}"
        result = subprocess.run(command, shell=True, capture_output=True, text=True)
        
        if result.returncode != 0:
            print(f"[SEAL] Error creating document ID: {result.stderr}")
            raise ValueError(f"Failed to create document ID: {result.stderr}")
        
        # Extract the document ID from the output
        output_lines = result.stdout.strip().split('\n')
        for line in output_lines:
            if line.startswith('{') and line.endswith('}'):
                try:
                    data = json.loads(line)
                    document_id_hex = data.get('documentIdHex')
                    if document_id_hex:
                        print(f"[SEAL] Document ID created: {document_id_hex}")
                        return document_id_hex
                except json.JSONDecodeError:
                    continue
        
        raise ValueError("Could not extract document ID from script output")
    finally:
        # Clean up temporary script
        if os.path.exists(script_path):
            os.unlink(script_path)

def encrypt_document(file_path: str, document_id_hex: str) -> str:
    """Encrypt a document using SEAL Protocol"""
    print(f"[SEAL] Encrypting document with ID: {document_id_hex}")
    
    # Create a temporary output path for the encrypted file
    output_dir = os.path.join(tempfile.gettempdir(), 'seal_encrypted')
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, f"encrypted-{uuid.uuid4().hex}.bin")
    
    # Execute the Node.js script to encrypt the document
    temp_script = f"""
    const fs = require('fs');
    const utils = require('./fixed_utils');
    const seal = require('./fixed_seal');
    
    async function encryptDocument() {{
        try {{
            // Initialize Sui client
            const suiClient = await utils.initSuiClient();
            
            // Initialize SEAL client
            const {{ client: sealClient }} = await seal.initSealClient(suiClient);
            
            // Read the file
            const fileData = fs.readFileSync("{file_path}");
            
            // Encrypt document using the document ID
            console.log('Encrypting document using SEAL Protocol...');
            const {{ encryptedBytes }} = await seal.encryptDocument(
                sealClient,
                "{document_id_hex}",
                new Uint8Array(fileData)
            );
            
            // Save encrypted data
            fs.writeFileSync("{output_path}", Buffer.from(encryptedBytes));
            
            console.log(JSON.stringify({{ 
                success: true, 
                encryptedPath: "{output_path}",
                encryptedSize: encryptedBytes.length,
                originalSize: fileData.length
            }}));
        }} catch (error) {{
            console.error(error);
            process.exit(1);
        }}
    }}
    
    encryptDocument();
    """
    
    with tempfile.NamedTemporaryFile(delete=False, suffix='.js') as script_file:
        script_path = script_file.name
        script_file.write(temp_script.encode('utf-8'))
    
    try:
        # Execute the temporary script
        command = f"cd {SEAL_SCRIPT_PATH} && node {script_path}"
        result = subprocess.run(command, shell=True, capture_output=True, text=True)
        
        if result.returncode != 0:
            print(f"[SEAL] Error encrypting document: {result.stderr}")
            raise ValueError(f"Failed to encrypt document: {result.stderr}")
        
        print(f"[SEAL] Document encrypted successfully to: {output_path}")
        return output_path
    finally:
        # Clean up temporary script
        if os.path.exists(script_path):
            os.unlink(script_path)

def publish_blob_to_allowlist(allowlist_id: str, cap_id: str, blob_id: str):
    """Publish the blob to the allowlist"""
    print(f"[SEAL] Publishing blob {blob_id} to allowlist {allowlist_id}")
    
    if not ADMIN_PRIVATE_KEY:
        raise ValueError("ADMIN_PRIVATE_KEY environment variable not set")
    
    # Execute the Node.js script to publish the blob
    temp_script = f"""
    const blockchain = require('./fixed_blockchain');
    const utils = require('./fixed_utils');
    
    async function publishBlobToAllowlist() {{
        // Initialize Sui client
        const suiClient = await utils.initSuiClient();
        
        // Create admin keypair
        const adminKeypair = utils.privateKeyToKeypair('{ADMIN_PRIVATE_KEY}');
        
        // Publish blob to allowlist
        await blockchain.publishBlobToAllowlist(
            suiClient,
            adminKeypair,
            "{allowlist_id}",
            "{cap_id}",
            "{blob_id}"
        );
        
        console.log(JSON.stringify({{ success: true, blobId: "{blob_id}" }}));
    }}
    
    publishBlobToAllowlist().catch(error => {{
        console.error(error);
        process.exit(1);
    }});
    """
    
    with tempfile.NamedTemporaryFile(delete=False, suffix='.js') as script_file:
        script_path = script_file.name
        script_file.write(temp_script.encode('utf-8'))
    
    try:
        # Execute the temporary script
        command = f"cd {SEAL_SCRIPT_PATH} && node {script_path}"
        result = subprocess.run(command, shell=True, capture_output=True, text=True)
        
        if result.returncode != 0:
            print(f"[SEAL] Error publishing blob: {result.stderr}")
            raise ValueError(f"Failed to publish blob: {result.stderr}")
        
        print(f"[SEAL] Blob published to allowlist successfully")
    finally:
        # Clean up temporary script
        if os.path.exists(script_path):
            os.unlink(script_path) 