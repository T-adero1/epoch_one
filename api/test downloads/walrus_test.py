#!/usr/bin/env python3
"""
Test script to download a blob from Walrus using the SDK manager.
"""

import sys
from pathlib import Path

# Add parent directory to Python path to import walrus_sdk_manager
sys.path.append(str(Path(__file__).parent.parent))
from walrus_sdk_manager import WalrusSDKManager

def test_download_blob():
    """Test downloading a blob from Walrus."""
    
    # The blob ID to download
    blob_id = "HiYxFLF5viM6rtYxj8MK48jSVa5QkAxpc6YpeDJyt1U"
    
    # Initialize the Walrus SDK Manager (using testnet by default)
    print("Initializing Walrus SDK Manager...")
    manager = WalrusSDKManager(context="testnet", verbose=True)
    
    # Set output path for the downloaded file (relative to current file location)
    output_dir = Path(__file__).parent / "downloads"
    output_dir.mkdir(exist_ok=True)
    output_path = output_dir / f"{blob_id}.bin"
    
    print(f"\nDownloading blob: {blob_id}")
    print(f"Output path: {output_path}")
    
    try:
        # Download the document
        downloaded_path = manager.download_document(blob_id, output_path)
        print(f"\n✅ Successfully downloaded blob to: {downloaded_path}")
        
        # Check file size
        file_size = downloaded_path.stat().st_size
        print(f"📁 File size: {file_size} bytes")
        
        return downloaded_path
        
    except Exception as e:
        print(f"\n❌ Error downloading blob: {e}")
        return None

if __name__ == "__main__":
    test_download_blob()
