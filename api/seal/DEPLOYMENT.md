# SEAL Integration Deployment Guide

This guide outlines the steps to deploy and configure the SEAL integration for encrypting documents stored on Walrus.

## Prerequisites

- Sui CLI installed and configured
- A Sui wallet with sufficient gas for deployment
- Node.js and npm

## Step 1: Deploy the SEAL Move Package

1. Navigate to the SEAL package directory:
   ```bash
   cd api/seal
   ```

2. Build the Move package:
   ```bash
   sui move build
   ```

3. Publish the package to the Sui network:
   ```bash
   sui client publish --gas-budget 100000000
   ```

4. Note the package ID from the output. It will look something like:
   ```
   Published Objects:
     - Package ID: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
   ```

5. Update the Move.toml file with the published address:
   ```toml
   [package]
   name = "epoch_one_document_sharing"
   version = "0.1.0"
   published-at = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"

   [addresses]
   epoch_one_document_sharing = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
   ```

## Step 2: Configure Environment Variables

1. Create or update your `.env` file to include the SEAL package ID:
   ```
   NEXT_PUBLIC_SEAL_PACKAGE_ID=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
   SEAL_ENCRYPTION_URL=http://localhost:3000/api/encrypt_document
   ```

2. If running in production, update to your production URL:
   ```
   SEAL_ENCRYPTION_URL=https://your-domain.com/api/encrypt_document
   ```

## Step 3: Install Dependencies

1. Install the required npm packages:
   ```bash
   npm install @mysten/sui @mysten/seal-js --save
   ```

## Step 4: Verify the Integration

1. Test the encryption process by uploading a document:
   ```bash
   curl -X POST -H "Content-Type: application/json" -d '{"contractId":"test123","contractContent":"dGVzdCBjb250ZW50","isBase64":true}' http://localhost:3000/api/upload_contract
   ```

2. Verify that the response includes SEAL encryption metadata:
   ```json
   {
     "contractId": "test123",
     "hash": "...",
     "originalHash": "...",
     "sealEncrypted": true,
     "symmetricKey": "...",
     "keyServerIds": ["..."],
     "signerAddresses": ["..."]
   }
   ```

## Order of Operations

The integration follows this order of operations:

1. Deploy the SEAL Move package first
2. Configure the environment with the package ID
3. When uploading a document:
   - Generate the document content
   - Retrieve signer wallet addresses
   - Encrypt the document using SEAL
   - Upload the encrypted document to Walrus
   - Store the encryption metadata with the contract record

## Troubleshooting

- **Error: "Failed to retrieve key servers"**: Ensure you're connected to the correct Sui network (testnet/mainnet)
- **Error: "No wallet addresses available for encryption"**: Make sure users have connected their wallets and their addresses are stored in the database
- **Decryption requires wallet signature**: This is expected - decryption must be handled in the frontend to access the user's wallet for signing 