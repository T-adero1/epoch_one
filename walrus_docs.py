#!/usr/bin/env python3
"""
Walrus Document Manager - A simple tool for managing documents on Walrus storage.

Prerequisites:
- Sui Client installed and configured
- Walrus Client installed and configured
- Python 3.6+
- Required Python packages: subprocess, argparse, json, pathlib, typing

This script provides functions to:
1. Upload documents to Walrus
2. Download documents from Walrus
3. List documents stored on Walrus
4. Delete documents from Walrus
"""

import subprocess
import argparse
import json
import os
import sys
from pathlib import Path
from typing import Dict, List, Union, Optional, Any


class WalrusDocManager:
    def __init__(self, capacity_id: Optional[str] = None, context: str = "testnet", verbose: bool = False):
        """
        Initialize the Walrus Document Manager.
        
        Args:
            capacity_id: Optional capacity ID to use for storage (if not using default)
                         Will try to use WALRUS_CAPACITY_ID environment variable if not provided
            context: Walrus context to use (testnet or mainnet)
            verbose: Whether to print detailed output
        """
        self.verbose = verbose
        # Try to get capacity_id from environment variable if not provided
        self.capacity_id = capacity_id
        if not self.capacity_id:
            self.capacity_id = os.environ.get('WALRUS_CAPACITY_ID')
            if self.capacity_id:
                print(f"Using WALRUS_CAPACITY_ID from environment: {self.capacity_id[:8]}...")
        
        self.context = context
        self.check_prerequisites()
    
    def check_prerequisites(self) -> None:
        """Check if sui and walrus clients are installed and accessible."""
        try:
            # Check Sui client
            sui_result = subprocess.run(
                ["sui", "client", "balance"], 
                capture_output=True, 
                text=True, 
                check=False
            )
            
            if self.verbose:
                print("Sui client output:")
                print(sui_result.stdout)
            
            if sui_result.returncode != 0:
                print("Error: Sui client is not configured properly.")
                print(sui_result.stderr)
                sys.exit(1)
                
            # Check Walrus client
            walrus_result = subprocess.run(
                ["walrus", "--version"],
                capture_output=True,
                text=True,
                check=False
            )
            
            if self.verbose:
                print("Walrus client output:")
                print(walrus_result.stdout)
            
            if walrus_result.returncode != 0:
                print("Error: Walrus client is not installed or accessible.")
                print(walrus_result.stderr)
                sys.exit(1)
                
            print(f"Prerequisites met! Using {self.context} context")
        except FileNotFoundError as e:
            print(f"Error: Required client not found - {e}")
            sys.exit(1)
    
    def upload_document(self, file_path: Union[str, Path], metadata: Optional[Dict[str, str]] = None, epochs: int = 2, deletable: bool = False) -> str:
        """
        Upload a document to Walrus storage.
        
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
        
        cmd = ["walrus", "store", str(file_path), "--context", self.context, "--epochs", str(epochs)]
        
        # Make the blob deletable if requested
        if deletable:
            cmd.append("--deletable")
        
        # Add metadata if provided
        if metadata:
            metadata_str = json.dumps(metadata)
            cmd.extend(["--metadata", metadata_str])
        
        print(f"Uploading {file_path}...")
        if self.verbose:
            print(f"Command: {' '.join(cmd)}")
        
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        
        # Always print stdout in verbose mode
        if self.verbose:
            print("Command output:")
            print(result.stdout)
        
        if result.returncode != 0:
            print(f"Error uploading document:")
            print(result.stderr)
            sys.exit(1)
            
        # Extract blob ID from output
        output = result.stdout
        # Example output: "Blob ID: EOmgWhTjZb0MetbiT8wCvhxqCU9cPm8cz3dG2Pe-Czw"
        blob_id = None
        for line in output.splitlines():
            if line.startswith("Blob ID:"):
                # Extract the blob ID
                parts = line.split(":")
                if len(parts) >= 2:
                    blob_id = parts[1].strip()
                    break
        
        if not blob_id:
            print(f"Error: Could not extract blob ID from output: {output}")
            sys.exit(1)
        print(f"Document uploaded successfully! Blob ID: {blob_id}")
        if deletable:
            print("Note: This blob is deletable and can be removed before expiry.")
        else:
            print("Note: This blob is permanent and cannot be deleted before expiry.")
        
        print(f"Entire output: {output}")
        return blob_id
    
    def download_document(self, blob_id: str, output_path: Union[str, Path]) -> Path:
        """
        Download a document from Walrus storage.
        
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
        
        # Try to make the file writable/create it before calling walrus
        try:
            # Touch the file to ensure it's writable
            with open(output_path, 'a'):
                pass
        except PermissionError:
            print(f"Error: Cannot write to {output_path} - Permission denied")
            # Try to create file in user's home directory as fallback
            home_dir = Path.home()
            output_path = home_dir / f"{blob_id}.bin"
            print(f"Attempting to save to {output_path} instead")
        
        cmd = ["walrus", "read"]
        
        # Add context if specified
        if self.context:
            cmd.extend(["--context", self.context])
            
        # Add blob ID and output path
        cmd.extend([blob_id, "--out", str(output_path)])
        
        print(f"Downloading blob {blob_id} to {output_path}...")
        if self.verbose:
            print(f"Command: {' '.join(cmd)}")
        
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        
        if self.verbose:
            print("Command output:")
            print(result.stdout)
        
        if result.returncode != 0:
            print(f"Error downloading document:")
            print(result.stderr)
            # Try alternate location as a fallback
            if "Access is denied" in result.stderr:
                print("Permission error detected. Trying to download to your Documents folder...")
                docs_dir = Path.home() / "Documents"
                docs_dir.mkdir(exist_ok=True)
                alt_path = docs_dir / f"{blob_id}.bin"
                
                cmd = ["walrus", "read"]
                if self.context:
                    cmd.extend(["--context", self.context])
                cmd.extend([blob_id, "--out", str(alt_path)])
                
                print(f"Retrying download to {alt_path}...")
                retry_result = subprocess.run(cmd, capture_output=True, text=True, check=False)
                
                if retry_result.returncode == 0:
                    print(f"Document successfully downloaded to {alt_path}")
                    return alt_path
                else:
                    print("Retry failed:")
                    print(retry_result.stderr)
                    sys.exit(1)
            else:
                sys.exit(1)
            
        print(f"Document downloaded successfully to {output_path}")
        return output_path
    
    def list_blobs(self) -> List[Dict[str, Any]]:
        """
        List all blobs owned by the current account using the Walrus JSON API.
        
        Returns:
            List of blob information dictionaries
        """
        walrus_json_cmd = ["walrus", "json"]
        
        json_input = {
            "context": self.context,
            "command": {
                "listBlobs": {}
            }
        }
        
        print(f"Listing blobs owned by the current account...")
        if self.verbose:
            print(f"Command: {' '.join(walrus_json_cmd)}")
            print(f"JSON Input: {json.dumps(json_input)}")
        
        result = subprocess.run(
            walrus_json_cmd,
            input=json.dumps(json_input),
            capture_output=True,
            text=True,
            check=False
        )
        
        if self.verbose:
            print("Command output:")
            print(result.stdout)
        
        if result.returncode != 0:
            print(f"Error listing blobs:")
            print(result.stderr)
            return []
        
        try:
            response = json.loads(result.stdout)
            
            # The response is already in the expected list format
            # Just return it directly since it matches the example structure
            if isinstance(response, list):
                return response
            
            # For backwards compatibility, try to extract from result field
            if "result" in response:
                if "listBlobs" in response["result"]:
                    return response["result"]["listBlobs"]
                return response["result"]
                
            print(f"Unexpected response structure: {response}")
            return []
            
        except json.JSONDecodeError:
            print(f"Error parsing blob list output: {result.stdout}")
            return []
    def delete_document(self, blob_id: str, confirm: bool = True) -> bool:
        """
        Delete a document from Walrus storage.
        
        Args:
            blob_id: The blob ID of the document to delete
            confirm: Whether to skip confirmation prompt (False adds --yes flag)
            
        Returns:
            True if deletion was successful, False otherwise
        """
        cmd = ["walrus", "delete"]
        
        # Add context if specified
        if self.context:
            cmd.extend(["--context", self.context])
            
        # Add blob ID with the correct --blob-id flag
        cmd.extend(["--blob-id", blob_id])
        
        # Skip confirmation if requested
        if not confirm:
            cmd.append("--yes")
        
        print(f"Deleting blob {blob_id}...")
        if self.verbose:
            print(f"Command: {' '.join(cmd)}")
        
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        
        if self.verbose:
            print("Command output:")
            print(result.stdout)
        
        if result.returncode != 0:
            print(f"Error deleting document:")
            print(result.stderr)
            return False
            
        print(f"Document {blob_id} deleted successfully")
        return True
    
    def get_metadata(self, blob_id: str) -> Optional[Dict[str, Any]]:
        """
        Get metadata for a document.
        
        Args:
            blob_id: The blob ID of the document
            
        Returns:
            Dictionary containing metadata, or None if not found
        """
        cmd = ["walrus", "metadata"]
        
        # Add context if specified
        if self.context:
            cmd.extend(["--context", self.context])
            
        # Add blob ID
        cmd.append(blob_id)
        
        print(f"Getting metadata for blob {blob_id}...")
        if self.verbose:
            print(f"Command: {' '.join(cmd)}")
        
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        
        if self.verbose:
            print("Command output:")
            print(result.stdout)
        
        if result.returncode != 0:
            print(f"Error getting metadata:")
            print(result.stderr)
            return None
            
        try:
            metadata = json.loads(result.stdout)
            return metadata
        except json.JSONDecodeError:
            print(f"Error parsing metadata output: {result.stdout}")
            return None


def main():
    # Fixed file path
    file_path = r"C:\Users\tobya\OneDrive\Desktop\R21M_Nigeria\Epoch_One\archpoint.pdf"
    
    # Get context via input
    while True:
        context = input("Enter context (testnet/mainnet): ").lower()
        if context in ["testnet", "mainnet"]:
            break
        print("Invalid context. Please enter 'testnet' or 'mainnet'")
    
    # Get capacity ID if needed
    capacity_id = input("Enter capacity ID (leave blank to use env variable): ").strip() or None
    
    # Get verbose preference
    verbose = input("Enable verbose output? (y/n): ").lower() == 'y'
    
    # Initialize manager
    manager = WalrusDocManager(capacity_id=capacity_id, context=context, verbose=verbose)
    
    # Get command via input
    while True:
        print("\nAvailable commands:")
        print("1. upload - Upload the document")
        print("2. download - Download a document")
        print("3. list - List documents")
        print("4. delete - Delete a document")
        print("5. metadata - Get document metadata")
        print("6. exit - Exit program")
        
        command = input("\nEnter command number: ").strip()
        
        if command == "1":
            # Get epochs for storage duration
            epochs = 2  # Default value
            try:
                epochs_input = input("Enter number of epochs to store the document (default: 2): ").strip()
                if epochs_input:
                    epochs = int(epochs_input)
            except ValueError:
                print("Invalid number of epochs. Using default value of 2.")
                epochs = 2
                
            # Ask if the blob should be deletable
            deletable = input("Make the blob deletable? (y/n): ").lower() == 'y'
            
            # Simple metadata entry system
            print("\nMetadata Entry (press Enter after each value, or leave blank to skip)")
            metadata = {}
            
            # Always prompt for common metadata fields
            title = input("Document title: ").strip()
            if title:
                metadata["title"] = title
                
            description = input("Description: ").strip()
            if description:
                metadata["description"] = description
                
            doc_type = input("Document type (e.g., PDF, report, letter): ").strip()
            if doc_type:
                metadata["type"] = doc_type
            
            # Ask if user wants to add more custom fields
            while True:
                custom_key = input("\nAdd another metadata field? (Enter field name or leave blank to finish): ").strip()
                if not custom_key:
                    break
                    
                custom_value = input(f"Enter value for '{custom_key}': ").strip()
                metadata[custom_key] = custom_value
            
            # Show the final metadata object that will be used
            if metadata:
                print("\nFinal metadata that will be uploaded:")
                print(json.dumps(metadata, indent=2))
                if input("Proceed with this metadata? (y/n): ").lower() != 'y':
                    continue
            else:
                print("No metadata will be attached to the document")
                metadata = None
            
            blob_id = manager.upload_document(file_path, metadata, epochs, deletable)
            print(f"Blob ID: {blob_id}")
            
        elif command == "2":
            blob_id = input("Enter blob ID to download: ")
            output_path = input("Enter output path: ")
            output_path = manager.download_document(blob_id, output_path)
            print(f"Document saved to: {output_path}")
            
        elif command == "3":
            blobs = manager.list_blobs()
            
            if blobs:
                print(f"Found {len(blobs)} blobs:")
                for i, blob in enumerate(blobs, 1):
                    print(f"{i}. Blob ID: {blob.get('id')}")
                    if 'size' in blob:
                        print(f"   Size: {blob['size']} bytes")
                    if 'created_at' in blob:
                        print(f"   Created: {blob['created_at']}")
                    print()
            else:
                print("No blobs found for your account")
                
        elif command == "4":
            blob_id = input("Enter blob ID to delete: ")
            confirm = input("Skip confirmation prompt? (y/n): ").lower() != 'y'
            success = manager.delete_document(blob_id, confirm)
            if success:
                print(f"Document {blob_id} deleted successfully")
            else:
                print(f"Failed to delete document {blob_id}")
                
        elif command == "5":
            blob_id = input("Enter blob ID to get metadata: ")
            metadata = manager.get_metadata(blob_id)
            if metadata:
                print("Metadata:")
                print(json.dumps(metadata, indent=2))
            else:
                print(f"No metadata found for blob {blob_id}")
                
        elif command == "6":
            break
        else:
            print("Invalid command number")


if __name__ == "__main__":
    main() 