const { SuiClient } = require('@mysten/sui/client');
const { Transaction } = require('@mysten/sui/transactions');
const { SealClient, SessionKey, getAllowlistedKeyServers } = require('@mysten/seal');
const { fromHEX, toHex } = require('@mysten/sui/utils');
const { bcs } = require('@mysten/sui/bcs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

// Configuration
const NETWORK = 'testnet';
const RPC_URL = 'https://fullnode.testnet.sui.io:443';
const PACKAGE_ID = process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID || '0xdef574b61e5833589723945cefb9e786d1b8d64209ae3d8eb66d3931d644fed1';

// Initialize SUI client
const suiClient = new SuiClient({ url: RPC_URL });

// Initialize SEAL client with key servers
async function initSealClient() {
  const keyServerIds = await getAllowlistedKeyServers(NETWORK);
  return new SealClient({
    suiClient,
    serverObjectIds: keyServerIds,
    verifyKeyServers: false  // For testing
  });
}

// Connect wallet using web interface - relies on wallet address from frontend
async function connectWallet(address) {
  if (!address) {
    throw new Error('No wallet address provided. Please connect your wallet in the UI first.');
  }
  
  console.log(`🔗 Using connected wallet: ${address}`);
  
  return {
    address: address,
    isConnected: true
  };
}

// Check if wallet is available in the browser
function isWalletAvailable() {
  return typeof window !== 'undefined' && window.ethereum && window.ethereum.isSui;
}

// Request wallet connection
async function requestWalletConnection() {
  if (!isWalletAvailable()) {
    throw new Error('No Sui wallet detected in the browser');
  }

  try {
    const accounts = await window.ethereum.request({ method: 'sui_connect' });
    if (accounts && accounts.length > 0) {
      return {
        address: accounts[0],
        isConnected: true
      };
    } else {
      throw new Error('No accounts returned from wallet');
    }
  } catch (error) {
    console.error('Error connecting to wallet:', error);
    throw error;
  }
}

// Request wallet to sign and execute transaction
async function requestWalletSignature(txBytes, options = {}) {
  if (!isWalletAvailable()) {
    throw new Error('No Sui wallet detected in the browser');
  }

  try {
    const result = await window.ethereum.request({
      method: 'sui_signAndExecuteTransactionBlock',
      params: [
        {
          transactionBlock: txBytes,
          options: {
            showEffects: true,
            showEvents: true,
            showObjectChanges: true,
            ...options
          }
        }
      ]
    });
    
    return result;
  } catch (error) {
    console.error('Error requesting wallet signature:', error);
    throw error;
  }
}

// Create document group using wallet connection
async function createDocumentGroup(address, groupName, dbId) {
  if (!address) {
    throw new Error('No wallet address provided. Please connect your wallet first.');
  }
  
  console.log('\n👤 Creating document group for user:', address);
  
  // Generate document group details
  console.log('📝 Document group details:');
  console.log('- Group name:', groupName);
  console.log('- DB ID:', dbId);
  
  try {
    // Create a transaction
    const tx = new Transaction();
    
    // Set the sender
    tx.setSender(address);
    
    // Call the create_document_group function
    console.log('📄 Creating document group with:');
    console.log(`- Name: ${groupName}`);
    console.log(`- DB ID: ${dbId}`);
    
    // Add the document group creation call - using correct format
    const adminCap = tx.moveCall({
      target: `${PACKAGE_ID}::document_sharing::create_document_group`,
      arguments: [
        tx.pure(groupName, "string"),
        tx.pure(dbId, "string")
      ]
    });
    
    // Transfer the admin capability to the sender
    tx.transferObjects(
      [adminCap], 
      tx.pure(address, "address")
    );
    
    // Build the transaction
    console.log('🚀 Building transaction...');
    const txBytes = await tx.build({ client: suiClient });
    
    // Return the transaction bytes for the frontend to sign
    return {
      txBytes: txBytes,
      transaction: tx
    };
  } catch (error) {
    console.error('❌ Error creating document group:', error);
    throw error;
  }
}

// Process transaction result after frontend wallet signing
async function processTransactionResult(result) {
  if (!result) {
    throw new Error('No transaction result provided');
  }
  
  console.log('✅ Transaction executed successfully!');
  console.log('- Transaction digest:', result.digest);
  
  // Extract document group ID from the transaction result
  let documentGroupId = null;
  let adminCapId = null;
  
  if (result.objectChanges) {
    // Find the document group object
    const documentGroupObject = result.objectChanges.find(change => 
      change.objectType && change.objectType.includes('document_sharing::DocumentGroup')
    );
    
    if (documentGroupObject) {
      documentGroupId = documentGroupObject.objectId;
    }
    
    // Find the admin cap object
    const adminCapObject = result.objectChanges.find(change => 
      change.objectType && change.objectType.includes('document_sharing::AdminCap')
    );
    
    if (adminCapObject) {
      adminCapId = adminCapObject.objectId;
    }
  }
  
  if (!documentGroupId) {
    throw new Error('Could not extract document group ID from transaction result');
  }
  
  console.log('📊 Document Group ID:', documentGroupId);
  if (adminCapId) {
    console.log('🔑 Admin Cap ID:', adminCapId);
  }
  
  return {
    documentGroupId,
    adminCapId
  };
}

// Encrypt document - frontend integration
async function encryptDocument(address, file, documentGroupId, packageId = PACKAGE_ID) {
  console.log('\n🔒 Encrypting document for', address);
  
  try {
    // Convert file to ArrayBuffer (if coming from frontend)
    let fileData;
    if (typeof file === 'string') {
      // If it's a path
      fileData = fs.readFileSync(file);
    } else if (file instanceof File) {
      // If it's a File object from frontend
      fileData = await file.arrayBuffer();
    } else if (file instanceof ArrayBuffer || file instanceof Uint8Array) {
      // If it's already an ArrayBuffer or Uint8Array
      fileData = file;
    } else {
      throw new Error('Invalid file format');
    }
    
    // Initialize SEAL client
    const client = await initSealClient();
    
    // Create document ID with a nonce to make it unique
    const nonce = crypto.randomBytes(5);
    const documentGroupBytes = fromHEX(documentGroupId);
    const fullIdBytes = new Uint8Array([...documentGroupBytes, ...nonce]);
    const documentIdHex = toHex(fullIdBytes);
    
    console.log('- Document Group ID:', documentGroupId);
    console.log('- Full Document ID (hex):', documentIdHex);
    
    // Encrypt the document
    const { encryptedObject: encryptedBytes, key: backupKey } = await client.encrypt({
      threshold: 2,
      packageId,
      id: documentIdHex,
      data: new Uint8Array(fileData),
    });
    
    console.log('\n✅ Encryption successful!');
    console.log(`- Encrypted size: ${encryptedBytes?.length || 0} bytes`);
    
    return {
      encryptedBytes,
      documentIdHex,
      backupKey
    };
  } catch (error) {
    console.error('\n❌ Encryption failed:', error);
    throw error;
  }
}

// Create a transaction for document decryption approval
async function createDecryptionTransaction(address, documentIdHex, documentGroupId, packageId = PACKAGE_ID) {
  if (!address || !documentIdHex || !documentGroupId) {
    throw new Error('Missing required parameters for decryption');
  }
  
  console.log('\n🔓 Creating decryption transaction for', address);
  
  try {
    // Convert the document ID
    const documentId = fromHEX(documentIdHex);
    
    // Create approval transaction
    const tx = new Transaction();
    tx.setSender(address);
    
    // Add the approval move call
    tx.moveCall({
      target: `${packageId}::document_sharing::seal_approve`,
      arguments: [
        tx.pure(documentId, "string"),
        tx.object(documentGroupId)
      ]
    });
    
    // Build the transaction
    const txBytes = await tx.build({ client: suiClient });
    
    return {
      txBytes,
      transaction: tx
    };
  } catch (error) {
    console.error('\n❌ Failed to create decryption transaction:', error);
    throw error;
  }
}

// Create a session key for document decryption
async function createSessionKey(address, packageId) {
  try {
    console.log('\n🔑 Creating session key for', address);
    
    // Create session key
    const sessionKey = new SessionKey({
      address: address,
      packageId,
      ttlMin: 10  // Session valid for 10 minutes
    });
    
    // Get personal message to sign
    const personalMessage = sessionKey.getPersonalMessage();
    
    return {
      sessionKey,
      personalMessage
    };
  } catch (error) {
    console.error('\n❌ Session key creation failed:', error);
    throw error;
  }
}

// Set signature on session key after wallet signing
async function setSessionSignature(sessionKey, signature) {
  try {
    await sessionKey.setPersonalMessageSignature(signature);
    console.log('✅ Session key signature set successfully');
    return true;
  } catch (error) {
    console.error('\n❌ Failed to set session signature:', error);
    throw error;
  }
}

// Decrypt document with wallet signature and transaction
async function decryptDocument(encryptedBytes, sessionKey, txBytes) {
  try {
    // Initialize SEAL client
    const client = await initSealClient();
    
    console.log('\n🔓 Decrypting document...');
    
    // Fetch keys from key servers
    await client.fetchKeys({
      ids: [sessionKey.id],
      txBytes,
      sessionKey,
      threshold: 2
    });
    
    // Decrypt the document 
    const decryptedData = await client.decrypt({
      data: encryptedBytes,
      sessionKey,
      txBytes,
    });
    
    console.log('✅ Decryption successful!');
    console.log(`- Decrypted size: ${decryptedData.length} bytes`);
    
    return decryptedData;
  } catch (error) {
    console.error('\n❌ Decryption failed:', error);
    throw error;
  }
}

// Export functions for frontend use
module.exports = {
  connectWallet,
  isWalletAvailable,
  requestWalletConnection,
  requestWalletSignature,
  createDocumentGroup,
  processTransactionResult,
  encryptDocument,
  createDecryptionTransaction,
  createSessionKey,
  setSessionSignature,
  decryptDocument
};
