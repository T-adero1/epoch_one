from http.server import BaseHTTPRequestHandler
import json
import hashlib
import os
import sys
import base64
import tempfile
import io
import requests
from urllib.parse import parse_qs

# Add the root directory to path so we can import the WalrusSDKManager
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from api.walrus_sdk_manager import WalrusSDKManager
from api.encrypt_and_upload import process_encrypt_and_upload

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        # Parse request body
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        
        try:
            data = json.loads(post_data)
            response_data = process_upload(data)
            
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
            'message': 'Contract upload endpoint',
            'usage': 'Send a POST request with contractId and contractContent fields',
            'method': 'POST'
        }
        
        self.wfile.write(json.dumps(response).encode())

def fetch_wallet_addresses(contract_id=None, signer_emails=None):
    """Fetch wallet addresses for the signers of a contract"""
    print(f"Fetching wallet addresses for contract {contract_id}")
    
    try:
        if contract_id:
            # Fetch contract details to get signer emails
            app_url = os.environ.get('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')
            contract_url = f"{app_url}/api/contracts/{contract_id}"
            print(f"Fetching contract details from {contract_url}")
            
            contract_response = requests.get(contract_url)
            if not contract_response.ok:
                print(f"Error fetching contract: {contract_response.status_code}")
                return []
            
            contract_data = contract_response.json()
            signer_emails = contract_data.get('metadata', {}).get('signers', [])
            print(f"Found signer emails: {signer_emails}")
        
        if not signer_emails or len(signer_emails) == 0:
            print("No signer emails found")
            return []
            
        # Fetch wallet addresses for each signer
        wallet_addresses = []
        app_url = os.environ.get('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')
        
        for email in signer_emails:
            user_url = f"{app_url}/api/users?email={email}"
            print(f"Fetching user details for {email} from {user_url}")
            
            user_response = requests.get(user_url)
            if not user_response.ok:
                print(f"Error fetching user {email}: {user_response.status_code}")
                continue
            
            user_data = user_response.json()
            wallet_address = user_data.get('walletAddress')
            
            if wallet_address:
                print(f"Found wallet address for {email}: {wallet_address}")
                wallet_addresses.append(wallet_address)
            else:
                print(f"No wallet address found for {email}")
        
        print(f"Returning {len(wallet_addresses)} wallet addresses")
        return wallet_addresses
    except Exception as e:
        print(f"Error fetching wallet addresses: {str(e)}")
        return []

def process_upload(data):
    """Process the upload request data and return response"""
    print("Processing upload request", data.get('contractId'))
    
    # Check if required fields are present
    if 'contractId' not in data or 'contractContent' not in data:
        raise ValueError("Missing required fields: contractId and contractContent are required")

    # Extract contract data
    contract_id = data['contractId']
    contract_content = data['contractContent']
    
    # Decode the content if it's base64 encoded
    if data.get('isBase64', False):
        try:
            contract_content = base64.b64decode(contract_content)
        except:
            raise ValueError("Invalid base64 content")
    else:
        # Convert string to bytes if not already
        if isinstance(contract_content, str):
            contract_content = contract_content.encode('utf-8')
    
    # Hash the document
    hash_sha256 = hashlib.sha256(contract_content).hexdigest()
    print(f"Document hash (SHA-256): {hash_sha256}")
    
    # Check if the request is for SEAL encryption
    use_seal = data.get('useSeal', True)
    signer_addresses = data.get('signerAddresses', [])
    
    # If SEAL is enabled but no signer addresses are provided, fetch them from the database
    if use_seal and not signer_addresses:
        print("No signer addresses provided, fetching from database")
        # If metadata.signers is provided in the data, use it to fetch wallet addresses
        signer_emails = data.get('metadata', {}).get('signers', [])
        if signer_emails:
            print(f"Using provided signer emails: {signer_emails}")
            signer_addresses = fetch_wallet_addresses(signer_emails=signer_emails)
        else:
            # Otherwise, try to fetch from existing contract
            print(f"Fetching signers for contract: {contract_id}")
            signer_addresses = fetch_wallet_addresses(contract_id=contract_id)
    
    if use_seal and signer_addresses:
        print(f"Using SEAL encryption for document with {len(signer_addresses)} signer addresses")
        
        # Prepare data for SEAL encryption
        seal_data = {
            'contractId': contract_id,
            'documentContent': base64.b64encode(contract_content).decode('utf-8') if isinstance(contract_content, bytes) else contract_content,
            'isBase64': True if isinstance(contract_content, bytes) else False,
            'signerAddresses': signer_addresses
        }
        
        # Process SEAL encryption and upload
        try:
            seal_response = process_encrypt_and_upload(seal_data)
            
            if seal_response.get('encrypted', False):
                print("SEAL encryption and upload successful")
                
                # Add the hash and contract ID to the response
                seal_response['contractId'] = contract_id
                seal_response['hash'] = hash_sha256
                
                return seal_response
            else:
                print("SEAL encryption failed, falling back to standard upload")
                # Continue with standard upload
        except Exception as e:
            print(f"SEAL encryption error: {str(e)}")
            print("Falling back to standard upload")
            # Continue with standard upload
    else:
        if use_seal:
            print("SEAL encryption enabled but no signer addresses available, using standard upload")
        else:
            print("SEAL encryption not requested, using standard upload")
    
    # Create a temporary file only if the SDK requires a file path
    # Initialize Walrus SDK Manager
    context = data.get('context', 'testnet')
    walrus_manager = WalrusSDKManager(context=context, verbose=True)
    
    # Upload to Walrus
    epochs = data.get('epochs', 2)
    deletable = data.get('deletable', False)
    
    try:
        # Use the Walrus client directly to get the full raw response
        # Get the client instance from the manager
        client = walrus_manager.client
        
        print(f"Uploading document to Walrus using in-memory approach")
        
        # Use a BytesIO object to avoid temporary file creation
        # However, since the SDK expects a file path, we temporarily create a file
        temp_dir = tempfile.gettempdir()
        temp_file_path = os.path.join(temp_dir, f"{contract_id}.pdf")
        
        try:
            # Create temporary file only for the SDK call
            with open(temp_file_path, 'wb') as f:
                f.write(contract_content)
            
            # Upload document
            raw_response = client.put_blob_from_file(
                str(temp_file_path),
                epochs=epochs,
                deletable=deletable
            )
        finally:
            # Always clean up temporary file
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
        
        print("Upload successful")
        
        # Log the response details
        print("Walrus response details:")
        try:
            response_type = "alreadyCertified" if "alreadyCertified" in raw_response else "newlyCreated"
            if response_type == "alreadyCertified":
                blob_id = raw_response["alreadyCertified"].get("blobId")
                print(f"  Blob already certified with ID: {blob_id}")
            else:
                blob_object = raw_response.get("newlyCreated", {}).get("blobObject", {})
                blob_id = blob_object.get("blobId")
                print(f"  New blob created with ID: {blob_id}")
                print(f"  Size: {blob_object.get('size')} bytes")
                print(f"  Created at: {blob_object.get('creationTime')}")
        except Exception as e:
            print(f"  Error parsing response details: {e}")
            print(f"  Raw response: {raw_response}")
        
        # Prepare response with the raw Walrus response and hash
        response_data = {
            'contractId': contract_id,
            'hash': hash_sha256,
            'walrusResponse': raw_response,
            'raw': str(raw_response)
        }
        
        print(f"Returning response with hash {hash_sha256} and blob ID {blob_id if 'blob_id' in locals() else 'unknown'}")
        return response_data
        
    except Exception as e:
        print(f"Error during upload: {str(e)}")
        raise

# Support for direct execution from command line
if __name__ == "__main__":
    if len(sys.argv) >= 2:
        # Command-line execution mode (for development)
        request_file = sys.argv[1]
        
        print(f"Reading request from {request_file}")
        with open(request_file, 'r') as f:
            request_data = json.load(f)
        
        try:
            # Process the upload and get the response
            response_data = process_upload(request_data)
            
            # Print the response as JSON to stdout
            print("RESPONSE_JSON_BEGIN")
            print(json.dumps(response_data))
            print("RESPONSE_JSON_END")
            
            print("Upload completed successfully")
            sys.exit(0)
        except Exception as e:
            error_response = {
                'error': str(e),
                'traceback': str(sys.exc_info())
            }
            
            print(f"Error: {str(e)}")
            
            # Print error response as JSON to stdout
            print("ERROR_JSON_BEGIN")
            print(json.dumps(error_response))
            print("ERROR_JSON_END")
            
            sys.exit(1) 