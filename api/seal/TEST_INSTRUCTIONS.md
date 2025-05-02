# Document Group Seal Testing

This folder contains tools to test the Document Group pattern for Seal encryption/decryption.

## Setup

1. Create a `.env` file with the following variables:
   ```
   # Your published package ID
   NEXT_PUBLIC_SEAL_PACKAGE_ID=0xa39c1223eaf93fc5cc085e6c8113170959036319b0e24d706e821c1f82840ecf
   
   # For testing document group creation (admin)
   ADMIN_PRIVATE_KEY=your_admin_wallet_private_key_without_0x
   
   # For testing decryption (user)
   USER_PRIVATE_KEY=authorized_user_private_key_without_0x
   ```

2. Make sure you have the necessary dependencies:
   ```
   npm install
   ```

## Test Scripts

### 1. Basic Encryption Test

This script tests the basic encryption functionality without creating a document group on-chain. It uses a mock document group ID.

```
node test_document_group.js
```

### 2. Complete Workflow Test

This script tests the complete workflow:
- Creating a document group on-chain
- Adding authorized users
- Encrypting the PDF document
- Saving the encrypted data for later decryption

```
node test_document_group_complete.js
```

### 3. Decryption Test

This script demonstrates how to decrypt a document using a session key. It requires an encrypted file output from one of the encryption tests.

```
node decrypt_document.js ./encrypted_pdf_1234567890.json
```

## Wallet Addresses

The test scripts use the following wallet addresses:
- Wallet 1: 0x82222415bfb7e66b1fa652c2dac774d18cd24dfce1cc000f16f20465c4078416
- Wallet 2: 0x94e6bd6b2bea5fa7dcf30508909e8cd123b5dae515a8fabce91d1a269b646207

You need to add these wallets to your document group's authorized users list for decryption to work.

## Document Group Implementation

The document group implementation:
1. Uses a shared object (`DocumentGroup`) to store authorized users
2. Uses an admin capability (`AdminCap`) to control who can modify the document group
3. Derives document IDs from the document group ID + database document ID
4. Checks both the document ID prefix and user authorization in `seal_approve`

## Important Notes

- The `USER_PRIVATE_KEY` should be the private key of one of the authorized wallets.
- For production use, you would use a proper wallet connector instead of private keys.
- Session keys are required for the decryption workflow to reduce the number of signatures required.
- In a real application, you would store the encrypted documents in a database or storage system. 