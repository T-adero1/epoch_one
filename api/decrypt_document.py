from http.server import BaseHTTPRequestHandler
import json
import os
import sys
import base64
import subprocess
import tempfile
import uuid
from typing import Dict, List, Any, Optional

# Add the root directory to path so we can import other modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from api.walrus_sdk_manager import WalrusSDKManager

# Constants
SEAL_PACKAGE_ID = os.environ.get('NEXT_PUBLIC_SEAL_PACKAGE_ID')
ALLOWLIST_PACKAGE_ID = os.environ.get('NEXT_PUBLIC_ALLOWLIST_PACKAGE_ID', SEAL_PACKAGE_ID)
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
            response_data = process_decrypt(data)
            
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
            'message': 'SEAL Document Decryption endpoint',
            'usage': 'Send a POST request with blobId, userAddress, signature, allowlistId, and documentId fields',
            'method': 'POST'
        }
        
        self.wfile.write(json.dumps(response).encode())

def process_decrypt(data: Dict[str, Any]) -> Dict[str, Any]:
    """Process the decryption request data and return response"""
    print("=" * 80)
    print(f"[SEAL] Processing decryption request")
    
    # Check if required fields are present
    if not all(k in data for k in ['blobId', 'userAddress', 'signature', 'allowlistId', 'documentId']):
        raise ValueError("Missing required fields: blobId, userAddress, signature, allowlistId, and documentId are required")

    # Extract data
    blob_id = data['blobId']
    user_address = data['userAddress']
    signature = data['signature']
    allowlist_id = data['allowlistId']
    document_id = data['documentId']
    user_private_key = data.get('userPrivateKey')  # Optional for testing
    
    print(f"[SEAL] Blob ID: {blob_id}")
    print(f"[SEAL] User Address: {user_address}")
    print(f"[SEAL] Allowlist ID: {allowlist_id}")
    print(f"[SEAL] Document ID: {document_id}")
    
    # Check if SEAL decryption is enabled
    if not SEAL_PACKAGE_ID:
        print("[SEAL] ERROR: SEAL package ID not configured")
        return {
            'decrypted': False,
            'message': 'SEAL decryption not configured'
        }
    
    try:
        # Step 1: Download encrypted document from Walrus
        walrus_manager = WalrusSDKManager(context=NETWORK, verbose=True)
        
        # Create a temporary directory for download
        output_dir = os.path.join(tempfile.gettempdir(), 'seal_encrypted')
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, f"encrypted-{uuid.uuid4().hex}.bin")
        
        # Download the document
        downloaded_file_path = walrus_manager.download_document(blob_id, output_path)
        
        # Step 2: Decrypt the document
        decrypted_file_path = decrypt_document(
            downloaded_file_path, 
            user_address, 
            signature, 
            allowlist_id, 
            document_id,
            user_private_key
        )
        
        # Step 3: Read the decrypted file
        with open(decrypted_file_path, 'rb') as file:
            decrypted_content = file.read()
            
        # Step 4: Return the decrypted document as base64
        response_data = {
            'decrypted': True,
            'blobId': blob_id,
            'decryptedDocument': base64.b64encode(decrypted_content).decode('utf-8'),
            'documentSize': len(decrypted_content)
        }
        
        print(f"[SEAL] Document successfully decrypted")
        print(f"[SEAL] Decrypted document size: {len(decrypted_content)} bytes")
        
        return response_data
        
    except Exception as e:
        print(f"[SEAL] ERROR during decryption: {str(e)}")
        return {
            'decrypted': False,
            'message': f'Decryption error: {str(e)}',
            'error': str(e)
        }
    finally:
        # Clean up temporary files
        try:
            if 'downloaded_file_path' in locals() and os.path.exists(downloaded_file_path):
                os.unlink(downloaded_file_path)
            if 'decrypted_file_path' in locals() and os.path.exists(decrypted_file_path):
                os.unlink(decrypted_file_path)
        except Exception as e:
            print(f"[SEAL] Warning: Error cleaning up temporary files: {str(e)}")

def decrypt_document(
    encrypted_file_path: str, 
    user_address: str, 
    signature: str, 
    allowlist_id: str, 
    document_id: str,
    user_private_key: Optional[str] = None
) -> str:
    """Decrypt a document using SEAL Protocol"""
    print(f"[SEAL] Decrypting document with ID: {document_id}")
    
    # Create a temporary output path for the decrypted file
    output_dir = os.path.join(tempfile.gettempdir(), 'seal_decrypted')
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, f"decrypted-{uuid.uuid4().hex}.pdf")
    
    # Create a temporary signature file if provided
    if signature:
        signature_file = os.path.join(output_dir, f"signature-{uuid.uuid4().hex}.json")
        with open(signature_file, 'w') as f:
            json.dump({"signature": signature}, f)
    else:
        signature_file = None
    
    # Execute the Node.js script to decrypt the document
    auth_part = f"""
        // Create session key using provided signature
        const sessionKey = new SessionKey({{
            address: "{user_address}",
            packageId: fromHEX(config.ALLOWLIST_PACKAGE_ID),
            ttlMin: config.DEFAULT_TTL_MINUTES
        }});
        
        // Set the signature
        const signatureData = require("{signature_file}");
        await sessionKey.setPersonalMessageSignature(signatureData.signature);
    """ if signature_file else f"""
        // Create user keypair from private key (for testing only)
        const userKeypair = utils.privateKeyToKeypair('{user_private_key}');
        const sessionKey = await seal.createSessionKey(userKeypair, config.ALLOWLIST_PACKAGE_ID);
    """
    
    temp_script = f"""
    const fs = require('fs');
    const utils = require('./fixed_utils');
    const seal = require('./fixed_seal');
    const {{ SessionKey }} = require('@mysten/seal');
    const {{ fromHEX }} = require('@mysten/sui/utils');
    const {{ Transaction }} = require('@mysten/sui/transactions');
    const config = require('./fixed_config');
    
    async function decryptDocument() {{
        try {{
            // Initialize Sui client
            const suiClient = await utils.initSuiClient();
            
            // Initialize SEAL client
            const {{ client: sealClient }} = await seal.initSealClient(suiClient);
            
            // Read the encrypted file
            const encryptedData = fs.readFileSync("{encrypted_file_path}");
            console.log(`Read encrypted file: {encrypted_file_path}, size: ${{encryptedData.length}} bytes`);
            
            {auth_part}
            
            // Create a transaction for approval
            const tx = new Transaction();
            tx.setSender("{user_address}");
            
            // Add the seal_approve move call
            tx.moveCall({{
                target: `${{config.ALLOWLIST_PACKAGE_ID}}::{MODULE_NAME}::seal_approve`,
                arguments: [
                    tx.pure.vector('u8', Array.from(fromHEX("{document_id}"))),
                    tx.object("{allowlist_id}")
                ]
            }});
            
            // Build the transaction (ONLY the transaction kind)
            const txKindBytes = await tx.build({{ 
                client: suiClient, 
                onlyTransactionKind: true
            }});
            
            // Approve and fetch keys
            await seal.approveAndFetchKeys(
                suiClient,
                sealClient,
                sessionKey,
                "{allowlist_id}",
                "{document_id}"
            );
            
            // Decrypt the document
            const decryptedData = await seal.decryptDocument(
                sealClient,
                sessionKey, 
                new Uint8Array(encryptedData),
                txKindBytes
            );
            
            // Save decrypted file
            fs.writeFileSync("{output_path}", Buffer.from(decryptedData));
            
            console.log(JSON.stringify({{ 
                success: true, 
                decryptedPath: "{output_path}",
                decryptedSize: decryptedData.length
            }}));
        }} catch (error) {{
            console.error(error);
            process.exit(1);
        }}
    }}
    
    decryptDocument().catch(error => {{
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
            print(f"[SEAL] Error decrypting document:")
            print(f"[SEAL] STDOUT: {result.stdout}")
            print(f"[SEAL] STDERR: {result.stderr}")
            raise ValueError(f"Failed to decrypt document: {result.stderr}")
        
        print(f"[SEAL] Document decrypted successfully to: {output_path}")
        
        # Clean up signature file if created
        if signature_file and os.path.exists(signature_file):
            os.unlink(signature_file)
            
        return output_path
    finally:
        # Clean up temporary script
        if os.path.exists(script_path):
            os.unlink(script_path) 