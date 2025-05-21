/**
 * SEAL SDK operations for document encryption and decryption
 * Enhanced version with improved logging and error handling
 */
const { SealClient, SessionKey, getAllowlistedKeyServers } = require('@mysten/seal');
const { Transaction } = require('@mysten/sui/transactions');
const { fromHEX } = require('@mysten/sui/utils');
const crypto = require('crypto');
const config = require('./fixed_config');
const { P } = require('pino');

// Initialize SEAL client
async function initSealClient(suiClient) {
  console.log('\n Initializing SEAL client...');
  console.log(`- Network: ${config.NETWORK}`);
  
  try {
    // Get allowlisted key servers
    console.log('- Fetching allowlisted key servers...');
    const keyServerIds = await getAllowlistedKeyServers(config.NETWORK);
    
    // Step 1: Normalize all IDs to a consistent format (lowercase with 0x prefix)
    const normalizedIds = keyServerIds.map(id => {
      const cleanId = id.toLowerCase();
      return cleanId.startsWith('0x') ? cleanId : `0x${cleanId}`;
    });
    console.log(`- Normalized ${keyServerIds.length} server IDs to consistent format`);
    
    // Step 2: More robust deduplication with ID map
    const idMap = new Map();
    for (const id of normalizedIds) {
      idMap.set(id, true);
    }
    const uniqueKeyServerIds = Array.from(idMap.keys());
    
    if (uniqueKeyServerIds.length !== keyServerIds.length) {
      console.log(` Found ${keyServerIds.length} key servers with duplicates`);
      console.log(` Deduplicated to ${uniqueKeyServerIds.length} unique key servers`);
    } else {
      console.log(` Found ${keyServerIds.length} key servers (all unique)`);
    }
    
    // Log the server IDs
    uniqueKeyServerIds.forEach((id, index) => {
      console.log(`  ${index + 1}. ${id}`);
    });
    
    // Try different strategies for creating the SEAL client
    console.log('- Attempting to create SEAL client with all unique key servers...');
    
    try {
      // Strategy 1: Use all deduplicated server IDs
      const client = new SealClient({
        suiClient,
        serverObjectIds: uniqueKeyServerIds,
        verifyKeyServers: true
      });
      
      console.log(' SEAL client initialized successfully with all servers');
      return {
        client,
        keyServerIds: uniqueKeyServerIds
      };
    } catch (firstError) {
      console.error(` First attempt failed: ${firstError.message}`);
      console.log(` Trying fallback with just one key server...`);
      
      try {
        // Strategy 2: Try with just the first server ID
        if (uniqueKeyServerIds.length > 0) {
          const singleServerId = uniqueKeyServerIds[0];
          console.log(`- Trying with single server: ${singleServerId}`);
          
          const client = new SealClient({
            suiClient,
            serverObjectIds: [singleServerId],
            verifyKeyServers: true
          });
          
          console.log(' SEAL client initialized successfully with single server');
          return {
            client,
            keyServerIds: [singleServerId]
          };
        } else {
          throw new Error('No key servers available');
        }
      } catch (secondError) {
        console.error(` Second attempt failed: ${secondError.message}`);
        console.log(` Trying final fallback with manual server IDs...`);
        
        // Strategy 3: Try with hardcoded known working server IDs
        const hardcodedServerIds = [
          '0xb35a7228d8cf224ad1e828c0217c95a5153bafc2906d6f9c178197dce26fbcf8'
        ];
        console.log(`- Using hardcoded server ID: ${hardcodedServerIds[0]}`);
        
        try {
          const client = new SealClient({
            suiClient,
            serverObjectIds: hardcodedServerIds,
            verifyKeyServers: false  // Don't verify to avoid extra network calls
          });
          
          console.log(' SEAL client initialized successfully with hardcoded server');
          return {
            client,
            keyServerIds: hardcodedServerIds
          };
        } catch (finalError) {
          console.error(' All SEAL client initialization attempts failed');
          console.error(` Final error: ${finalError.message}`);
          throw finalError;
        }
      }
    }
  } catch (error) {
    console.error(` Failed to initialize SEAL client: ${error.message}`);
    console.error(error.stack);
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
      packageId,
      ttlMin: config.DEFAULT_TTL_MINUTES
    });
    
    // Add detailed logging about the session key
    console.log('- SESSION KEY DETAILS:');
    console.log(`  - Original address: ${userAddress}`);
    console.log(`  - Session key address: ${sessionKey.address || 'undefined'}`);
    console.log(`  - Keys:`, Object.keys(sessionKey));
    console.log(`  - Properties:`, Object.getOwnPropertyNames(sessionKey));
    
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
    
    // Store user address manually on session key for backup
    sessionKey._userAddress = userAddress;
    
    // Check if session key properties are accessible after signature setting
    console.log('- SESSION KEY AFTER SIGNATURE:');
    console.log(`  - Address property: ${sessionKey.address || 'undefined'}`);
    console.log(`  - Stored address: ${sessionKey._userAddress}`);
    console.log(`  - Keys:`, Object.keys(sessionKey));
    
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
  
  // Detailed session key debugging
  console.log('- SESSION KEY DEBUG:');
  console.log(`  - Address property: ${sessionKey.address || 'undefined'}`);
  console.log(`  - Package ID: ${sessionKey.packageId || 'undefined'}`);
  console.log(`  - Has signature: ${!!sessionKey.signature}`);
  console.log(`  - Direct keys:`, Object.keys(sessionKey));
  console.log(`  - Type: ${typeof sessionKey}`);
  
  try {
    // Create a transaction for approval
    console.log('- Creating approval transaction...');
    const tx = new Transaction();
    

    console.log(`- Session key: ${sessionKey}`);
    // Convert documentIdHex to vector<u8>
    const documentId = fromHEX(documentIdHex);
    console.log(`- Document ID bytes length: ${documentId.length}`);
    
    // Check if we need to add Clock parameter based on packageId
    if (config.ALLOWLIST_PACKAGE_ID === '0xb5c84864a69cb0b495caf548fa2bf0d23f6b69b131fa987d6f896d069de64429') {
      // New version with Clock parameter
      tx.moveCall({
        target: `${config.ALLOWLIST_PACKAGE_ID}::allowlist::seal_approve`,
        arguments: [
          tx.pure.vector('u8', Array.from(documentId)),
          tx.object(allowlistId),
          tx.object('0x6') // Standard Clock object ID
        ]
      });
    } else {
      // Original version without Clock parameter
      tx.moveCall({
        target: `${config.ALLOWLIST_PACKAGE_ID}::allowlist::seal_approve`,
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
    console.log(`    - Using threshold: 1`);
    
    try {
      await sealClient.fetchKeys({
        ids: [rawId],
        txBytes: txKindBytes,
        sessionKey,
        threshold: 1  // Only require 1 key server response
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
      // Log session key state before decrypt
      console.log('- Session key state for decryption:');
      console.log(`  - Has signature: ${!!sessionKey.signature}`);
      console.log(`  - Address property: ${sessionKey.address || 'undefined'}`);
      
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