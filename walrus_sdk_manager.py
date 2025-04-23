#!/usr/bin/env python3
"""
Walrus SDK Document Manager - A streamlined tool for managing documents on Walrus storage.

Prerequisites:
- walrus-python SDK (`pip install walrus-python`)
- Python 3.6+
- Required Python packages: argparse, json, pathlib, typing

This script provides functions to:
1. Upload documents to Walrus
2. Download documents from Walrus
3. Get metadata for documents
4. Delete documents (if supported by the API)

Designed to be used in serverless environments or any application requiring
efficient interaction with Walrus storage.

python walrus_sdk_manager.py --context testnet upload "archpoint.pdf" --deletable
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Dict, List, Union, Optional, Any, BinaryIO
import base64

try:
    from walrus import WalrusClient, WalrusAPIError
except ImportError:
    print("Error: walrus-python SDK is not installed.")
    print("Please install it using: pip install walrus-python")
    sys.exit(1)


class WalrusSDKManager:
    def __init__(self, context: str = "testnet", verbose: bool = False):
        """
        Initialize the Walrus SDK Document Manager.
        
        Args:
            context: Walrus context to use (testnet or mainnet)
            verbose: Whether to print detailed output
        """
        self.verbose = verbose
        self.context = context
        
        # Set appropriate endpoints based on context
        if context == "testnet":
            self.publisher_url = "https://publisher.walrus-testnet.walrus.space"
            self.aggregator_url = "https://aggregator.walrus-testnet.walrus.space"
        elif context == "mainnet":
            self.publisher_url = "https://publisher.walrus-mainnet.walrus.space"
            self.aggregator_url = "https://aggregator.walrus-mainnet.walrus.space"
        else:
            print(f"Error: Unknown context '{context}'. Please use 'testnet' or 'mainnet'.")
            sys.exit(1)
        
        # Initialize the Walrus client
        try:
            self.client = WalrusClient(
                publisher_base_url=self.publisher_url,
                aggregator_base_url=self.aggregator_url
            )
            print(f"Walrus SDK initialized for {context}")
        except Exception as e:
            print(f"Error initializing Walrus client: {e}")
            sys.exit(1)
    
    def upload_document(self, file_path: Union[str, Path], metadata: Optional[Dict[str, str]] = None, 
                       epochs: int = 2, deletable: bool = False) -> str:
        """
        Upload a document to Walrus storage using SDK.
        
        Args:
            file_path: Path to the file to upload
            metadata: Optional metadata to attach to the blob
            epochs: Number of epochs the blob should be stored for (default: 2)
            deletable: Whether the blob should be deletable before expiry (default: False)
            
        Returns:
            The blob ID of the uploaded document
        """
        file_path = Path(file_path)
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
        
        print(f"Uploading {file_path}...")
        try:
            response = self.client.put_blob_from_file(
                str(file_path),
                epochs=epochs,
                deletable=deletable,
                # Metadata is not directly supported by the SDK's put_blob methods,
                # but we're keeping the parameter for API consistency
            )
            
            if self.verbose:
                print("API Response:")
                print(response)
            
            # Extract blob ID from the nested response structure
            blob_id = None
            if 'alreadyCertified' in response:
                blob_id = response['alreadyCertified'].get('blobId')
            elif 'newlyCreated' in response and 'blobObject' in response['newlyCreated']:
                blob_id = response['newlyCreated']['blobObject'].get('blobId')
            
            if not blob_id:
                print(f"Error: Could not extract blob ID from response: {response}")
                sys.exit(1)
                
            print(f"Document uploaded successfully! Blob ID: {blob_id}")
            if deletable:
                print("Note: This blob is deletable and can be removed before expiry.")
            else:
                print("Note: This blob is permanent and cannot be deleted before expiry.")
            
            return blob_id
        
        except WalrusAPIError as e:
            print(f"API Error uploading document: {e}")
            sys.exit(1)
        except Exception as e:
            print(f"Error uploading document: {e}")
            sys.exit(1)
    
    def download_document(self, blob_id: str, output_path: Union[str, Path]) -> Path:
        """
        Download a document from Walrus storage using SDK.
        
        Args:
            blob_id: The blob ID of the document to download
            output_path: Path where to save the downloaded document
            
        Returns:
            Path to the downloaded file
        """
        output_path = Path(output_path)
        
        # If output_path is a directory, create a filename using the blob_id
        if output_path.is_dir() or not output_path.suffix:
            # Create directory if it doesn't exist
            if not output_path.exists():
                output_path.mkdir(parents=True, exist_ok=True)
            # Use blob_id as filename if path is a directory
            output_path = output_path / f"{blob_id}.bin"
        else:
            # Create parent directory if it doesn't exist
            output_path.parent.mkdir(parents=True, exist_ok=True)
        
        print(f"Downloading blob {blob_id} to {output_path}...")
        
        try:
            # Download blob and save to file in one step
            self.client.get_blob_as_file(blob_id, str(output_path))
            print(f"Document downloaded successfully to {output_path}")
            return output_path
        
        except WalrusAPIError as e:
            print(f"API Error downloading document: {e}")
            
            # Try alternate location as a fallback if permission error occurs
            try:
                alt_path = Path.home() / "Documents" / f"{blob_id}.bin"
                Path.home().joinpath("Documents").mkdir(exist_ok=True)
                
                print(f"Attempting to save to {alt_path} instead...")
                self.client.get_blob_as_file(blob_id, str(alt_path))
                print(f"Document successfully downloaded to {alt_path}")
                return alt_path
            except Exception as alt_e:
                print(f"Alternative download failed: {alt_e}")
                sys.exit(1)
                
        except Exception as e:
            print(f"Error downloading document: {e}")
            sys.exit(1)
    
    def get_blob_stream(self, blob_id: str) -> BinaryIO:
        """
        Get a document as a stream from Walrus storage.
        
        Args:
            blob_id: The blob ID of the document to get
            
        Returns:
            Binary stream of the blob content
        """
        try:
            return self.client.get_blob_as_stream(blob_id)
        except WalrusAPIError as e:
            print(f"API Error getting blob stream: {e}")
            sys.exit(1)
        except Exception as e:
            print(f"Error getting blob stream: {e}")
            sys.exit(1)
    
    def get_metadata(self, blob_id: str) -> Optional[Dict[str, Any]]:
        """
        Get metadata for a document using SDK.
        
        Args:
            blob_id: The blob ID of the document
            
        Returns:
            Dictionary containing metadata, or None if not found
        """
        print(f"Getting metadata for blob {blob_id}...")
        
        try:
            metadata = self.client.get_blob_metadata(blob_id)
            
            if self.verbose:
                print("API Response:")
                print(metadata)
            
            return metadata
        
        except WalrusAPIError as e:
            print(f"API Error getting metadata: {e}")
            return None
        except Exception as e:
            print(f"Error getting metadata: {e}")
            return None
    
    def delete_blob(self, blob_id: str, **kwargs: Any) -> bool:
        """
        Delete a blob from Walrus storage using SDK.
        
        Args:
            blob_id: The blob ID of the document to delete
            
        Returns:
            True if deletion was successful, False otherwise
        """
        print(f"Deleting blob {blob_id}...")
        try:
            # The Walrus SDK likely has a delete_blob method
            response = self.client.delete_blob(blob_id)
            
            if self.verbose:
                print("API Response:")
                print(response)
                
            print(f"Document {blob_id} deleted successfully")
            return True
            
        except Exception as e:
            print(f"Error deleting document: {e}")
            return False


def main():
    # Parse command line arguments
    parser = argparse.ArgumentParser(description="Walrus SDK Document Manager")
    parser.add_argument("--context", choices=["testnet", "mainnet"], default="testnet",
                        help="Walrus context to use (default: testnet)")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose output")
    
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")
    
    # Upload command
    upload_parser = subparsers.add_parser("upload", help="Upload a document to Walrus")
    upload_parser.add_argument("file_path", help="Path to the file to upload")
    upload_parser.add_argument("--epochs", type=int, default=2, 
                               help="Number of epochs to store the document (default: 2)")
    upload_parser.add_argument("--deletable", action="store_true", 
                               help="Make the blob deletable before expiry")
    
    # Download command
    download_parser = subparsers.add_parser("download", help="Download a document from Walrus")
    download_parser.add_argument("blob_id", help="The blob ID of the document to download")
    download_parser.add_argument("output_path", help="Path where to save the downloaded document")
    
    # Metadata command
    metadata_parser = subparsers.add_parser("metadata", help="Get metadata for a document")
    metadata_parser.add_argument("blob_id", help="The blob ID of the document")
    
    # Delete command
    delete_parser = subparsers.add_parser("delete", help="Delete a document from Walrus")
    delete_parser.add_argument("blob_id", help="The blob ID of the document to delete")
    
    args = parser.parse_args()
    
    # If no command was specified, show help
    if not args.command:
        parser.print_help()
        sys.exit(1)
    
    # Initialize the manager
    manager = WalrusSDKManager(context=args.context, verbose=args.verbose)
    
    # Execute the specified command
    if args.command == "upload":
        blob_id = manager.upload_document(
            args.file_path, 
            epochs=args.epochs, 
            deletable=args.deletable
        )
        print(f"Blob ID: {blob_id}")
        
    elif args.command == "download":
        output_path = manager.download_document(args.blob_id, args.output_path)
        print(f"Document saved to: {output_path}")
        
    elif args.command == "metadata":
        metadata = manager.get_metadata(args.blob_id)
        if metadata:
            print("Metadata:")
            print(json.dumps(metadata, indent=2))
        else:
            print(f"No metadata found for blob {args.blob_id}")
    


if __name__ == "__main__":
    main() 