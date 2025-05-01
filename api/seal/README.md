# Document Sharing with SEAL Encryption

This module provides SEAL encryption integration for Epoch One document signing. It enables client-side encryption of documents using Sui's SEAL technology, allowing only authorized signers to decrypt the documents.

## How It Works

1. The document is encrypted using SEAL's client-side encryption
2. Access control is handled by the `document_sharing.move` module
3. The BCS identity format is:
   - `vector<u8> contract_id` - the contract identifier as a byte array
   - `vector<address> signer_addresses` - the list of authorized signer addresses
4. When a signer wants to decrypt a document, SEAL verifies they are in the authorized list

## Setup Instructions

### 1. Deploy the Move Module

First, you'll need to deploy the `document_sharing.move` module to the Sui network:

```bash
cd api/seal
sui move build
sui client publish --gas-budget 100000000
```

After deployment, copy the package ID and update the following:
1. Update `.env` file with the package ID
2. Update `Move.toml` to replace the placeholder `published-at` and `epoch_one_document_sharing` address with the actual package ID

### 2. Configure Environment Variables

Create a `.env` file in your project root with:

```
NEXT_PUBLIC_SEAL_PACKAGE_ID=0x<your_package_id>
SEAL_ENCRYPTION_URL=http://localhost:3000/api/encrypt_document
```

### 3. Install Dependencies

```bash
npm install @mysten/sui.js@0.37.0
```

To fix TypeScript type errors with the `@mysten/sui.js` package, you can:

1. Install TypeScript types:
```bash
npm install --save-dev typescript @types/node @types/node-fetch
```

2. In your `tsconfig.json`, add:
```json
{
  "compilerOptions": {
    "esModuleInterop": true,
    "moduleResolution": "node"
  }
}
```

## Testing

You can test the SEAL integration with:

```bash
npm test
```

This will run `test_seal.js` which tests:
1. Direct document encryption
2. Contract upload with encryption

If you encounter import errors, make sure you have the right versions of all dependencies.

## Usage in Frontend/API

You can integrate SEAL encryption in your frontend code:

```typescript
import { createSealIdentity } from 'api/seal/utils';

// Create SEAL identity for contract with multiple authorized signers
const bcsId = createSealIdentity(
  contractId, 
  [signerAddress1, signerAddress2]
);

// Use with SEAL client
const { encryptedObject, key } = await sealClient.encrypt({
  threshold: 2,
  packageId: Buffer.from(packageId.slice(2), 'hex'),
  id: bcsId,
  data: documentBytes,
});
```

## BCS Format Details

The BCS format used for SEAL identity encoding follows this structure:

```
[vector<u8> contract_id][vector<address> signer_addresses]
```

In serialized form:
1. Contract ID length (u32, little-endian)
2. Contract ID bytes
3. Number of signer addresses (u32, little-endian)
4. Signer address 1 (32 bytes)
5. Signer address 2 (32 bytes)
6. ...and so on

The Move module uses the `bcs::new()` and `peel_*` functions to deserialize this data.

## Important Workflow Considerations

1. **Signer Addresses**: Make sure to always pass signer addresses to the encryption endpoint to ensure proper access control.

2. **Error Handling**: If SEAL encryption fails, the document will still be uploaded unencrypted. Make sure your frontend handles this case appropriately.

3. **TypeScript Compatibility**: The included utilities work with Sui.js v0.37.0, which may require specific import patterns.

4. **Production Implementation**: For production, you'll need to replace the placeholder BCS implementation in `encrypt_document.py` with a real implementation using a Python BCS library.

## Using with zkLogin

This implementation fully supports zkLogin addresses. The `seal_approve` function checks the sender's address against the authorized list, which works identically with both traditional and zkLogin-derived addresses.

Note: zkLogin addresses are stable and based on the user's JWT claims, making them perfect for SEAL access control, even though the actual signing keys change with each login session.

## Files

- `sources/document_sharing.move` - The Move module for access control
- `utils.ts` - TypeScript utility for creating properly encoded SEAL identities
- `test_seal.js` - Test script for the SEAL integration
- `encrypt_document.py` - Python API handler for document encryption 