# Walrus Document Manager

A simple Python tool for managing documents on Walrus storage.

## Prerequisites

- Sui Client installed and configured
- Walrus Client installed and configured
- Python 3.6+

## Features

- Upload documents to Walrus
- Download documents from Walrus
- List documents stored on Walrus
- Delete documents from Walrus
- View document metadata

## Usage

The script provides a command-line interface for interacting with Walrus storage.

### Basic Options

```
python walrus_docs.py --help
```

- `--context`: Specify the Walrus context ("testnet" or "mainnet", default is "testnet")
- `--capacity-id`: Specify the capacity ID to use (required for some operations)

### Upload a Document

```
python walrus_docs.py upload example.md --metadata '{"title": "Example Document", "author": "User", "date": "2025-04-22"}'
```

### Download a Document

```
python walrus_docs.py download 0x123456789abcdef... downloaded_file.md
```

### List Documents in a Capacity

```
python walrus_docs.py list --capacity-id 0x123456789abcdef...
```

### Get Document Metadata

```
python walrus_docs.py metadata 0x123456789abcdef...
```

### Delete a Document

```
python walrus_docs.py delete 0x123456789abcdef...
```

## Example Workflow

1. First, make sure you have sufficient WAL tokens for storage:
   ```
   sui client balance
   ```

2. If needed, get more WAL tokens:
   ```
   walrus get-wal
   ```

3. Upload a document with metadata:
   ```
   python walrus_docs.py upload example.md --metadata '{"title": "Example Doc", "type": "markdown"}'
   ```

4. List all documents in your capacity:
   ```
   python walrus_docs.py list --capacity-id YOUR_CAPACITY_ID
   ```

5. Download a specific document:
   ```
   python walrus_docs.py download BLOB_ID downloaded_doc.md
   ```

## Notes

- Make sure your Sui client is configured with the correct network (testnet or mainnet)
- You need sufficient WAL tokens to pay for storage
- The capacity ID is required for listing blobs and may be required for other operations depending on your Walrus configuration 