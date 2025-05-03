# SEAL Document Encryption Backend (Optimized)

This optimized backend provides a complete workflow for document encryption, storage, and access using Sui blockchain, SEAL SDK, and Walrus blob storage.

## Features

- **Batch Operations**: Add multiple users and register documents in fewer transactions
- **Full Logging**: Enhanced logging for better troubleshooting
- **Streamlined Workflow**: Clear step-by-step process
- **Multiple Users**: Add multiple authorized users at once
- **Improved Error Handling**: Better error messages and stack traces

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Create a `.env` file with your configuration:
   ```
   # Network and package configuration
   SEAL_PACKAGE_ID=0xdef574b61e5833589723945cefb9e786d1b8d64209ae3d8eb66d3931d644fed1
   ALLOWLIST_PACKAGE_ID=0x0  # Update after publishing your contract
   
   # Private keys
   ADMIN_PRIVATE_KEY=suiprivkey...  # Your admin private key
   USER_PRIVATE_KEY=suiprivkey...   # Your user private key
   ```

3. Update package IDs after contract deployment.

## Required Workflow Order

The backend enforces the correct order of operations:

1. **Deploy package** (done once, not part of this script)
2. **Create allowlist** (get allowlist ID)
3. **Add users to allowlist** (multiple users in one transaction)
4. **Generate document ID** (using allowlist ID as prefix)
5. **Encrypt document** (using the document ID)
6. **Upload to Walrus** (get blob_id)
7. **Register blob and set permissions** (in one transaction)

## Usage

### Basic Usage

Run the complete workflow with a file:

```bash
node index.js path/to/your/file.pdf
```

### Disable Batch Operations

Run with legacy single-user approach:

```bash
node index.js path/to/your/file.pdf --no-batch
```

### Use as a Library

```javascript
const { runCompleteWorkflow } = require('./index');

// Run with additional users
runCompleteWorkflow('path/to/file.pdf', {
  additionalUsers: ['0x123...', '0x456...'],
  useBatch: true
})
.then(result => {
  if (result.success) {
    console.log('Success!', result);
  } else {
    console.error('Failed:', result.error);
  }
});
```

## Output Files

The script creates the following files in the `temp` directory:

- `test-document-*.txt` - Generated test document (if no input file)
- `encrypted-*.bin` - Encrypted document
- `downloaded-*.bin` - Document downloaded from Walrus
- `decrypted-*.*` - Decrypted document (preserves original extension)

## Important Notes

- The allowlist ID is **critical** for security and must be created before encryption
- The document ID must include the allowlist ID as a prefix
- Transaction kind must use `onlyTransactionKind: true` for SEAL key servers
- Batch operations reduce the number of transactions required 