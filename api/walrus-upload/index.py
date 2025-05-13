from http.server import BaseHTTPRequestHandler
import json
import os
import sys
import base64

# Import the existing WalrusSDKManager
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from api.walrus_sdk_manager import WalrusSDKManager

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            # Parse request
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            request_data = json.loads(post_data)
            
            # Extract parameters
            file_content_base64 = request_data.get('fileContentBase64')
            epochs = request_data.get('epochs', 2)
            deletable = request_data.get('deletable', False)
            context = request_data.get('context', 'testnet')
            
            if not file_content_base64:
                self.send_error(400, "Missing required parameter: fileContentBase64")
                return
            
            # Decode base64 content
            file_content = base64.b64decode(file_content_base64)
            
            # Use the existing WalrusSDKManager
            manager = WalrusSDKManager(context=context, verbose=True)
            blob_id = manager.upload_document_direct(
                content=file_content,
                epochs=epochs,
                deletable=deletable
            )
            
            # Return success response
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            self.wfile.write(json.dumps({
                'success': True,
                'blobId': blob_id
            }).encode())
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            self.wfile.write(json.dumps({
                'success': False,
                'error': str(e)
            }).encode())
