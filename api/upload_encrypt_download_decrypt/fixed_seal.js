/**
 * SEAL SDK operations for document encryption and decryption
 * Enhanced version with improved logging and error handling
 */
const { SealClient, SessionKey, getAllowlistedKeyServers } = require('@mysten/seal');
const { Transaction } = require('@mysten/sui/transactions');
const { fromHEX } = require('@mysten/sui/utils');
const crypto = require('crypto');
const config = require('./fixed_config');
const { getFullnodeUrl, SuiClient } = require('@mysten/sui/client');

// Initialize SEAL client
async function initSealClient(suiClient) {
  console.log('\n Initializing SEAL client...');
  
  try {
    // Get allowlisted key servers - this should return an array
    const keyServers = ['0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75'];
    console.log(`- Key servers:`, keyServers);
    
    const client = new SealClient({
      suiClient,
      serverConfigs: keyServers.map((id) => ({
        objectId: id,
        weight: 1,
      })),
      verifyKeyServers: true
    });
    
    console.log('SEAL client initialized successfully');
    return { client, keyServerIds: keyServers };
  } catch (error) {
    console.error(`Failed to initialize SEAL client: ${error.message}`);
    throw error;
  }
}

// Create a session key
async function createSessionKey(keypair, packageId) {
  console.log('\n Creating session key for user...');
  
  const userAddress = keypair.getPublicKey().toSuiAddress();
  console.log(`- User address: ${userAddress}`);
  console.log(`- Package ID: ${packageId}`);
  console.log(`- TTL: ${config.DEFAULT_TTL_MINUTES} minutes`);
  
  try {
    // Create session key
    console.log('- Initializing session key...');
    const sessionKey = new SessionKey({
      address: userAddress,
      packageId: packageId,
      ttlMin: config.DEFAULT_TTL_MINUTES,
      signer: keypair,
      suiClient: new SuiClient({ url: getFullnodeUrl('testnet') })
    });
    
    // Log raw session key details
    console.log('- Raw session key details:');
    console.log(`  Address: ${sessionKey.getAddress()}`);
    console.log(`  Package ID: ${sessionKey.getPackageId()}`);
    console.log(`  Creation Time: ${new Date(sessionKey.export().creationTimeMs).toISOString()}`);
    console.log(`  TTL (minutes): ${sessionKey.export().ttlMin}`);
    console.log(`  Session Key: ${sessionKey.export().sessionKey}`);
    console.log(`  Is Expired: ${sessionKey.isExpired()}`);
    
    // Get personal message to sign
    const personalMessage = sessionKey.getPersonalMessage();
    console.log('- Personal message generated successfully');
    console.log(`- Personal message length: ${personalMessage.length} bytes`);
    
    // Sign the personal message with the user's keypair
    console.log('- Signing personal message with user keypair...');
    const signature = await keypair.signPersonalMessage(Buffer.from(personalMessage));
    console.log('- Message signed successfully');
    
    // Set the signature on the session key
    console.log('- Setting signature on session key...');
    
    try {
      // First try with full signature object
      await sessionKey.setPersonalMessageSignature(signature);
      console.log(' Session key initialized with signature');
    } catch (error) {
      console.log(` First signature attempt failed: ${error.message}`);
      
      // If full signature object fails, try with signature.signature (common format)
      if (typeof signature === 'object' && signature.signature) {
        try {
          await sessionKey.setPersonalMessageSignature(signature.signature);
          console.log(' Session key initialized with inner signature');
        } catch (innerError) {
          console.error(` Second signature attempt failed: ${innerError.message}`);
          console.error(innerError.stack);
          throw innerError;
        }
      } else {
        console.error(error.stack);
        throw error;
      }
    }
    

    
    console.log(' Session key created successfully - valid for fetching keys');
    return sessionKey;
  } catch (error) {
    console.error(` Failed to create session key: ${error.message}`);
    console.error(error.stack);
    throw error;
  }
}

// Encrypt a document using document ID
async function encryptDocument(sealClient, documentIdHex, data) {
  console.log('\n STEP 4: Encrypting document...');
  console.log(`- Document ID (hex): ${documentIdHex}`);
  console.log(`- Data size: ${data.length} bytes`);
  console.log(`- Package ID: ${config.SEAL_PACKAGE_ID}`);
  console.log('- Using SEAL threshold encryption with key servers');
  
  try {
    // Encrypt the document
    console.log('- Performing encryption with SEAL...');
    const { encryptedObject: encryptedBytes, key: backupKey } = await sealClient.encrypt({
      threshold: 1,
      packageId: config.SEAL_PACKAGE_ID,
      id: documentIdHex,
      data
    });
    
    console.log(`Document encrypted successfully`);
    console.log(`- Original size: ${data.length} bytes`);
    console.log(`- Encrypted size: ${encryptedBytes.length} bytes`);
    console.log(`- Encryption ratio: ${(encryptedBytes.length / data.length).toFixed(2)}x`);
    console.log(`- Backup key available: ${Boolean(backupKey)}`);
    
    return {
      encryptedBytes,
      backupKey,
      documentIdHex
    };
  } catch (error) {
    console.error(` Failed to encrypt document: ${error.message}`);
    console.error(error.stack);
    throw error;
  }
}

// Create approval transaction and fetch keys
async function approveAndFetchKeys(suiClient, sealClient, sessionKey, allowlistId, documentIdHex) {
  console.log('\n Generating approval transaction for decryption...');
  console.log(`- Allowlist ID: ${allowlistId}`);
  console.log(`- Document ID: ${documentIdHex}`);

  
  try {
    // Create a transaction for approval
    console.log('- Creating approval transaction...');
    const tx = new Transaction();
    

    console.log(`- Session key: ${sessionKey}`);
    // Convert documentIdHex to vector<u8>
    const documentId = fromHEX(documentIdHex);
    console.log(`- Document ID bytes length: ${documentId.length}`);
    
    
    if (config.SEAL_PACKAGE_ID === '0xb5c84864a69cb0b495caf548fa2bf0d23f6b69b131fa987d6f896d069de64429') {
      // New version with Clock parameter
      tx.moveCall({
        target: `${config.SEAL_PACKAGE_ID}::allowlist::seal_approve`,
        arguments: [
          tx.pure.vector('u8', Array.from(documentId)),
          tx.object(allowlistId),
          tx.object('0x6') 
        ]
      });
    } else {
      // Original version without Clock parameter
      tx.moveCall({
        target: `${config.SEAL_PACKAGE_ID}::allowlist::seal_approve`,
        arguments: [
          tx.pure.vector('u8', Array.from(documentId)),
          tx.object(allowlistId)
        ]
      });
    }
    
    // Build ONLY the transaction kind (important for SEAL!)
    console.log('- Building transaction kind bytes (CRITICAL: onlyTransactionKind=true)...');
    const txKindBytes = await tx.build({ 
      client: suiClient, 
      onlyTransactionKind: true  // This is critical for SEAL to work correctly
    });
    console.log(`- Transaction kind bytes length: ${txKindBytes.length} bytes`);
    
    // Format the document ID for key fetching
    const rawId = documentIdHex.startsWith('0x') ? documentIdHex.substring(2) : documentIdHex;
    
    // Fetch keys from key servers
    console.log('- Fetching keys from key servers...');
    
    // Add logging for fetch keys parameters
    console.log('  - Fetch keys parameters:');
    console.log(`    - ID: ${rawId}`);
    console.log(`    - txBytes length: ${txKindBytes.length}`);

    
    try {
      await sealClient.fetchKeys({
        ids: [rawId],
        txBytes: txKindBytes,
        sessionKey,
        threshold: 1  
      });
      
      console.log(' Keys fetched successfully from key servers');
      console.log('- These keys will be used to decrypt the document');
      
      
      return {
        txKindBytes,
        rawId
      };
    } catch (fetchError) {
      console.error(` Key fetch error: ${fetchError.message}`);
      console.error(` Error stack: ${fetchError.stack}`);
      throw fetchError;
    }
  } catch (error) {
    console.error(` Failed to approve and fetch keys: ${error.message}`);
    console.error(error.stack);
    throw error;
  }
}

// Decrypt a document
async function decryptDocument(sealClient, sessionKey, encryptedBytes, txKindBytes) {
  console.log('\n Decrypting document...');
  console.log(`- Encrypted data size: ${encryptedBytes.length} bytes`);
  console.log(`- Transaction kind bytes length: ${txKindBytes.length} bytes`);
  
  // Get user address from session key or stored property
  const userAddress = sessionKey.address || sessionKey._userAddress;
  console.log(`- User address: ${userAddress || 'undefined'}`);
  
  try {
    // Decrypt the document
    console.log('- Performing decryption with SEAL...');
    
    try {

      
      const decryptedData = await sealClient.decrypt({
        data: encryptedBytes,
        sessionKey,
        txBytes: txKindBytes
      });
      
      console.log(' Document decrypted successfully');
      console.log(`- Decrypted size: ${decryptedData.length} bytes`);
      
      // Calculate hash for verification
      const hash = crypto.createHash('sha256').update(decryptedData).digest('hex');
      console.log(`- Document hash (SHA-256): ${hash.substring(0, 16)}...`);
      
      return decryptedData;
    } catch (decryptError) {
      console.error(` Failed to decrypt document: ${decryptError.message}`);
      console.error(` Full error details: ${decryptError.stack}`);
      throw decryptError;
    }
  } catch (error) {
    console.error(` Failed to decrypt document: ${error.message}`);
    console.error(error.stack);
    throw error;
  }
}

module.exports = {
  initSealClient,
  createSessionKey,
  encryptDocument,
  approveAndFetchKeys,
  decryptDocument
};