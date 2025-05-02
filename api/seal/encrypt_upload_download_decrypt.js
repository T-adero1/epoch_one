/**
 * Complete Workflow Example: Encrypt, Upload to Walrus, Download, and Decrypt
 * 
 * This script demonstrates how to:
 * 1. Encrypt a document using Seal SDK
 * 2. Upload the encrypted document to Walrus
 * 3. Download the encrypted document from Walrus
 * 4. Decrypt the document
 * 
 * Prerequisites:
 * - Valid .env file with NEXT_PUBLIC_SEAL_PACKAGE_ID and USER_PRIVATE_KEY
 * - Python environment with walrus-python SDK installed
 * - A document to encrypt (e.g., Personal letter of motivation.pdf)
 */

const { SealClient, SessionKey, getAllowlistedKeyServers, EncryptedObject } = require('@mysten/seal');
const { SuiClient } = require('@mysten/sui/client');
const { Ed25519Keypair } = require('@mysten/sui/keypairs/ed25519');
const { fromHEX, toHex } = require('@mysten/sui/utils');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');
const { Transaction, TransactionArgument } = require('@mysten/sui/transactions');
const { bcs } = require('@mysten/sui/bcs');

require('dotenv').config();

// Import utility functions

const { suiPrivkeyToKeypair } = require('./sui_key_utils');

// Configuration
const NETWORK = 'testnet';
const RPC_URL = 'https://fullnode.testnet.sui.io:443';
const PACKAGE_ID = process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID || '0xdef574b61e5833589723945cefb9e786d1b8d64209ae3d8eb66d3931d644fed1';
const USER_PRIVATE_KEY = process.env.USER_PRIVATE_KEY;
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY || USER_PRIVATE_KEY;
const PDF_FILE_PATH = "./Personal letter of motivation.pdf";

// Walrus configuration
const WALRUS_CONTEXT = 'testnet';
const PYTHON_SCRIPT = '../walrus_sdk_manager.py';
const EPOCHS_TO_STORE = 2;
const DELETABLE = true;

// Ensure tests directory exists
const TESTS_DIR = path.join(__dirname, 'tests');
if (!fs.existsSync(TESTS_DIR)) {
  console.log('Creating tests directory...');
  fs.mkdirSync(TESTS_DIR);
}

// Simple SUI client validation
async function validateSuiClient(client) {
  console.log('\n🔍 Validating SuiClient...');
  try {
    console.log('Testing getChainIdentifier...');
    const chain = await client.getChainIdentifier();
    console.log('✅ Chain identifier:', chain);
    return true;
  } catch (error) {
    console.error('❌ SuiClient validation failed:', error.message);
    return false;
  }
}

/**
 * Encrypt a document using Seal SDK
 */
async function encryptDocument(filePath, documentGroupId) {
  console.log('\n' + '='.repeat(50));
  console.log('STEP 1: ENCRYPTING DOCUMENT');
  console.log('='.repeat(50));

  try {
    // Read the file
    console.log(`\n📄 Reading file: ${filePath}...`);
    const fileData = fs.readFileSync(filePath);
    console.log(`✅ File loaded, size: ${fileData.length} bytes`);

    // Initialize SUI client
    console.log('\n🔌 Connecting to Sui network...');
    const suiClient = new SuiClient({ url: RPC_URL });
    await validateSuiClient(suiClient);
    
    // Get the allowlisted key servers
    console.log('\n🔑 Fetching allowlisted key servers...');
    const keyServerIds = await getAllowlistedKeyServers(NETWORK);
    console.log(`✅ Found ${keyServerIds.length} key servers`);
    
    // Initialize SEAL client
    console.log('\n🔒 Initializing SEAL client...');
    const client = new SealClient({
      suiClient,
      serverObjectIds: keyServerIds,
      verifyKeyServers: false  // For testing
    });
    
    // Create document ID
    console.log('\n🔐 Preparing for encryption...');
    console.log('- Document Group ID:', documentGroupId);
    
    // Create a random nonce
    const nonce = crypto.randomBytes(5);
    
    // Convert document group ID to bytes and combine with database ID
    const documentGroupBytes = fromHEX(documentGroupId);
    
    // Combine into a single ID
    const fullIdBytes = new Uint8Array([...documentGroupBytes, ...nonce]);
    
    // Convert the ID to a hex string
    const documentIdHex = toHex(fullIdBytes);
    
    console.log('- Full Document ID (hex):', documentIdHex);
    console.log('- Threshold:', 2);
    console.log('- Package ID:', PACKAGE_ID);
    
    // Encrypt the document
    const { encryptedObject: encryptedBytes, key: backupKey } = await client.encrypt({
      threshold: 2,
      packageId: PACKAGE_ID,
      id: documentIdHex,
      data: fileData,
    });
    
    console.log('\n✅ Encryption successful!');
    console.log(`- Encrypted size: ${encryptedBytes?.length || 0} bytes`);
    
    // Save encrypted data to a temporary file
    const encryptedFilePath = path.join(TESTS_DIR, `encrypted_${Date.now()}.bin`);
    fs.writeFileSync(encryptedFilePath, Buffer.from(encryptedBytes));
    
    // Also save metadata for later decryption
    const metadataPath = path.join(TESTS_DIR, `metadata_${Date.now()}.json`);
    fs.writeFileSync(metadataPath, JSON.stringify({
      documentGroupId: documentGroupId,
      packageId: PACKAGE_ID,
      documentIdHex: documentIdHex,
      // Skip storing the encrypted object here as we'll upload it to Walrus
    }, null, 2));
    
    console.log(`\n💾 Encrypted file saved to: ${encryptedFilePath}`);
    console.log(`💾 Metadata saved to: ${metadataPath}`);
    
    console.log('\n🔢 Document ID Details (Creation):');
    console.log('- Document ID (hex):', documentIdHex);
    console.log('- Document ID starts with 0x?', documentIdHex.startsWith('0x'));
    console.log('- Document ID length (chars):', documentIdHex.length);
    console.log('- Original fullIdBytes length:', fullIdBytes.length);
    console.log('- First 8 bytes:', Array.from(fullIdBytes.slice(0, 8)));
    
    return { encryptedFilePath, metadataPath, documentIdHex };
  
  } catch (error) {
    console.error('\n❌ Encryption failed:', error);
    throw error;
  }
}

/**
 * Upload encrypted document to Walrus
 */
function uploadToWalrus(encryptedFilePath) {
  console.log('\n' + '='.repeat(50));
  console.log('STEP 2: UPLOADING TO WALRUS');
  console.log('='.repeat(50));
  
  try {
    console.log(`\n📤 Uploading encrypted file to Walrus...`);
    
    // Use python script to upload to Walrus
    const command = `python ${PYTHON_SCRIPT} --context ${WALRUS_CONTEXT} upload "${encryptedFilePath}" --epochs ${EPOCHS_TO_STORE} ${DELETABLE ? '--deletable' : ''}`;
    console.log(`Executing: ${command}`);
    
    const output = execSync(command).toString();
    console.log(output);
    
    // Extract blob ID from the output
    const blobIdMatch = output.match(/Blob ID: ([a-zA-Z0-9_-]+)/);
    if (!blobIdMatch) {
      throw new Error('Could not extract blob ID from output');
    }
    
    const blobId = blobIdMatch[1];
    console.log(`\n✅ Document uploaded to Walrus! Blob ID: ${blobId}`);
    
    return blobId;
  } catch (error) {
    console.error('\n❌ Upload to Walrus failed:', error);
    throw error;
  }
}

/**
 * Download encrypted document from Walrus
 */
function downloadFromWalrus(blobId) {
  console.log('\n' + '='.repeat(50));
  console.log('STEP 3: DOWNLOADING FROM WALRUS');
  console.log('='.repeat(50));
  
  try {
    console.log(`\n📥 Downloading blob ${blobId} from Walrus...`);
    
    const downloadPath = path.join(TESTS_DIR, `downloaded_${Date.now()}.bin`);
    
    // Use python script to download from Walrus
    const command = `python ${PYTHON_SCRIPT} --context ${WALRUS_CONTEXT} download ${blobId} "${downloadPath}"`;
    console.log(`Executing: ${command}`);
    
    const output = execSync(command).toString();
    console.log(output);
    
    console.log(`\n✅ Document downloaded from Walrus! Saved to: ${downloadPath}`);
    
    return downloadPath;
  } catch (error) {
    console.error('\n❌ Download from Walrus failed:', error);
    throw error;
  }
}

/**
 * Decrypt the document
 */
async function decryptDocument(downloadedFilePath, metadataPath, keypair) {
  console.log('\n' + '='.repeat(50));
  console.log('STEP 4: DECRYPTING DOCUMENT');
  console.log('='.repeat(50));
  
  if (!USER_PRIVATE_KEY) {
    console.error('❌ Error: No user private key provided in .env file. Set USER_PRIVATE_KEY=<your_private_key>');
    return;
  }
  
  try {
    // Read the metadata
    console.log('\n📄 Reading metadata...');
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    
    // Read the downloaded encrypted data
    console.log('📄 Reading encrypted data...');
    const encryptedBytes = fs.readFileSync(downloadedFilePath);
    
    

    const { 
      documentGroupId, 
      packageId, 
      documentIdHex
    } = metadata;
    
    console.log('- Document Group ID:', documentGroupId);
    console.log('- Document ID (hex):', documentIdHex);
    
    // Right after you process the document ID:
    console.log('\n🔍 Processing document ID...');
    console.log('- Original documentIdHex:', documentIdHex);

    // Make sure the hex string has the correct format (has 0x prefix)
    const prefixedDocIdHex = documentIdHex.startsWith('0x') ? documentIdHex : `0x${documentIdHex}`;
    console.log('- Prefixed documentIdHex:', prefixedDocIdHex);

    // Create the byte array using the corrected hex string
    const documentId = fromHEX(prefixedDocIdHex);
    console.log('- documentId created with length:', documentId.length);

    // Debug log
    console.log('\n🔍 Debug documentId information:');
    console.log('- documentIdHex type:', typeof documentIdHex);
    console.log('- documentIdHex value:', documentIdHex);
    console.log('- prefixedDocIdHex:', prefixedDocIdHex);
    console.log('- documentId type:', typeof documentId);
    console.log('- documentId instanceof Uint8Array:', documentId instanceof Uint8Array);
    console.log('- documentId length:', documentId.length);
    
    // Create keypair from private key
    console.log('- Creating keypair from private key...');
    
    const userAddress = keypair.getPublicKey().toSuiAddress();
    console.log('- User Address:', userAddress);
    
    // Initialize SUI client
    console.log('\n🔌 Connecting to Sui network...');
    const suiClient = new SuiClient({ url: RPC_URL });
    await validateSuiClient(suiClient);
    
    // Get the allowlisted key servers
    console.log('\n🔑 Fetching allowlisted key servers...');
    const keyServerIds = await getAllowlistedKeyServers(NETWORK);
    console.log(`✅ Found ${keyServerIds.length} key servers`);
    
    // Initialize SEAL client
    console.log('\n🔒 Initializing SEAL client...');
    const client = new SealClient({
      suiClient,
      serverObjectIds: keyServerIds,
      verifyKeyServers: false  // For testing
    });
    console.log('SEAL Client:', {
      serverObjectIds: keyServerIds,
      verifyKeyServers: false
    });
    
    // Create a session key
    console.log('\n🔑 Creating session key...');
    const sessionKey = new SessionKey({
      address: userAddress,
      packageId,
      ttlMin: 10  // Session valid for 10 minutes
    });
    console.log('Session Key Details:', {
      address: userAddress,
      packageId: packageId,
      ttlMin: 10
    });
    
    // Get personal message to sign
    const personalMessage = sessionKey.getPersonalMessage();
    console.log('Personal Message Details:', {
      message: personalMessage,
      length: personalMessage.length,
      type: typeof personalMessage,
      isBuffer: Buffer.isBuffer(personalMessage),
      isUint8Array: personalMessage instanceof Uint8Array
    });
    
    // Sign the personal message
    console.log('- Signing personal message...');
    const signature = await keypair.signPersonalMessage(Buffer.from(personalMessage));
    console.log('Signature Details:', {
      signature: signature,
      type: typeof signature,
      isBuffer: Buffer.isBuffer(signature),
      isUint8Array: signature instanceof Uint8Array,
      length: signature.length
    });
    
    // Set the signature on the session key
    console.log('- Setting signature on session key...');
    console.log('Initial signature details:');
    console.log('- Value:', signature);
    console.log('- Type:', typeof signature);
    console.log('- instanceof Buffer:', signature instanceof Buffer);
    console.log('- instanceof Uint8Array:', signature instanceof Uint8Array);
    console.log('- Length:', signature.length);
    console.log('- toString():', signature.toString());
    console.log('- toJSON():', JSON.stringify(signature));

    if (typeof signature === 'object') {
      console.log('\nSignature object details:');
      console.log('- Keys:', Object.keys(signature));
      console.log('- Values:', Object.values(signature));
      console.log('- signature property:', signature.signature);
      if (signature.signature) {
        console.log('- signature.signature type:', typeof signature.signature);
        console.log('- signature.signature instanceof Buffer:', signature.signature instanceof Buffer);
        console.log('- signature.signature length:', signature.signature.length);
        console.log('- signature.signature toString():', signature.signature.toString());
      }
    }

    try {
      console.log('\nSession Key Details:');
      console.log('- Session Key:', sessionKey);
      console.log('- Type:', typeof sessionKey);
      console.log('- Properties:', Object.keys(sessionKey));
      console.log('- Methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(sessionKey)));

      await sessionKey.setPersonalMessageSignature(signature);
      console.log('\n✅ First attempt succeeded');
      console.log('- Used value:', signature);
    } catch (error) {
      console.error('\n❌ First attempt failed:', error.message);
      console.log('- Failed with value:', signature);
      
      if (typeof signature === 'object' && signature.signature) {
        console.log('\nTrying inner signature property...');
        console.log('- Inner signature value:', signature.signature);
        console.log('- Inner signature type:', typeof signature.signature);
        console.log('- Inner signature instanceof Buffer:', signature.signature instanceof Buffer);
        console.log('- Inner signature length:', signature.signature.length);
        
        try {
          await sessionKey.setPersonalMessageSignature(signature.signature);
          console.log('\n✅ Second attempt succeeded');
          console.log('- Used value:', signature.signature);
        } catch (innerError) {
          console.error('\n❌ Second attempt failed:', innerError.message);
          console.log('- Failed with value:', signature.signature);
          throw innerError;
        }
      } else {
        throw error;
      }
    }
    // Create the approval transaction
    console.log('\n📝 Creating approval transaction...');

    // Create a Transaction
    console.log('Creating new Transaction...');
    const tx = new Transaction();
    console.log('Transaction created:', tx);

    // Set the sender before building
    console.log('Setting transaction sender:', userAddress);
    tx.setSender(userAddress);

    // Add an explicit gas budget
    const gasBudget = 10000000; // 10 MIST
    console.log('Setting gas budget:', gasBudget);
    tx.setGasBudget(gasBudget);

    // Add the approval move call
    console.log('Adding move call with:');
    console.log('- Package ID:', packageId);
    console.log('- Document ID:', documentId);
    console.log('- Document Group ID:', documentGroupId);
    
    

    tx.moveCall({
      target: `${packageId}::document_sharing::seal_approve`,
      arguments: [
        tx.pure.vector('u8', Array.from(documentId)),
        tx.object(documentGroupId)
      ]
    });
  

    // Build and sign the transaction
    console.log('🔏 Building and signing transaction...');

    // Build the transaction bytes
    console.log('Building transaction bytes...');
    const txKindBytes = await tx.build({ 
      client: suiClient, 
      onlyTransactionKind: true  // IMPORTANT: Only build transaction kind
    });
    console.log('Transaction kind bytes built, length:', txKindBytes.length);
    
    // Modify your fetchKeys call to match the example's approach
    console.log('\n🔐 Fetching key shares from key servers...');
    try {
      // Sign the transaction first
      const { signature: txSignature } = await keypair.signTransaction(txKindBytes);
      console.log('Transaction signature:', txSignature);
      
      // Execute the transaction
      console.log('🚀 Executing transaction...');
      console.log('Transaction bytes:', txKindBytes);
      console.log('Executing transaction with:', {
        transactionBlock: txKindBytes,
        signature: txSignature,
        options: {
          showEffects: true,
          showContent: true
        }
      });
      
      const result = await suiClient.executeTransactionBlock({
        transactionBlock: txKindBytes,
        signature: txSignature,
        options: {
          showEffects: true,
          showContent: true
        }
      });
      
      console.log('Transaction result:', result);
      console.log('✅ Approval transaction executed successfully!');
      console.log('Transaction digest:', result.digest);
      
      // Wait for transaction to be confirmed
      console.log('⏳ Waiting for transaction to be confirmed...');
      const confirmedTx = await suiClient.waitForTransaction({
        digest: result.digest,
        options: {
          showEvents: true,
          showEffects: true,
          showObjectChanges: true,
        }
      });
      console.log('✅ Transaction confirmed');
      console.log('- Events:', confirmedTx.events);
      console.log('- Effects:', confirmedTx.effects);
      console.log('- Object changes:', confirmedTx.objectChanges);
      
      // Format the ID as the library expects
      const rawId = documentIdHex.startsWith('0x') ? documentIdHex.substring(2) : documentIdHex;
      
      // This format matches what the SEAL examples use
      console.log('Fetching keys with params:', {
        ids: [rawId],
        txBytesLength: txKindBytes.length,
        sessionKey,
        threshold: 2
      });
      await client.fetchKeys({
        ids: [rawId],
        txBytes: txKindBytes,  // Use txKindBytes instead of unsignedTxBytes
        sessionKey,
        threshold: 2
      });
      console.log('✅ Successfully fetched key shares');
    } catch (error) {
      console.error('❌ Error fetching key shares:', error);
      throw error;
    }
    
    // Decrypt the document
    console.log('\n🔓 Decrypting document...');
    console.log('Decrypting with params:', {
      dataLength: encryptedBytes.length,
      sessionKey,
      txBytesLength: txKindBytes.length
    });
    const decryptedData = await client.decrypt({
      data: new Uint8Array(encryptedBytes),
      sessionKey,
      txBytes: txKindBytes,  // Use txKindBytes here too
    });
    console.log('Decryption result length:', decryptedData.length);
    
    console.log('✅ Decryption successful!');
    console.log(`- Decrypted size: ${decryptedData.length} bytes`);
    
    // Save the decrypted file
    const originalExtension = path.extname(PDF_FILE_PATH);
    const outputFile = path.join(TESTS_DIR, `decrypted_${Date.now()}${originalExtension}`);
    fs.writeFileSync(outputFile, Buffer.from(decryptedData));
    console.log(`\n💾 Decrypted file saved to: ${outputFile}`);
    
    // After execution
    if (result.effects?.status?.status === 'failure') {
      console.error('❌ Transaction failed:', result.effects.status.error);
      throw new Error(`Transaction failed: ${result.effects.status.error}`);
    }
    
    console.log('\n🔢 Document ID Details (Approval/Decryption):');
    console.log('- Original documentIdHex:', documentIdHex);
    console.log('- Prefixed documentIdHex:', prefixedDocIdHex);
    console.log('- documentId (bytes) length:', documentId.length);
    console.log('- First 8 bytes:', Array.from(documentId.slice(0, 8)));
    console.log('- Using tx.pure.vector("u8", Array.from(documentId)) for Move call');
    
    return outputFile;
  } catch (error) {
    console.error('\n❌ Decryption process failed:', error);
    throw error;
  }
}

async function createDocumentGroup(client, keypair) {
  console.log('\n👤 Creating document group for user:', keypair.getPublicKey().toSuiAddress());
  
  // Generate a document group name and database ID
  const groupName = `DocGroup-${Date.now()}`;
  const dbId = `group-${Math.random().toString(36).substring(2, 10)}`;
  
  console.log('📝 Building transaction...');
  console.log('- Group name:', groupName);
  console.log('- DB ID:', dbId);
  
  try {
    // OPTION 1: Use the entry function instead (recommended)
    const tx = new Transaction();
    tx.setSender(keypair.getPublicKey().toSuiAddress());
    
    // Use the entry function which handles the transfer internally
    console.log('Building move call with params:', {
      target: `${PACKAGE_ID}::document_sharing::create_document_group_entry`,
      arguments: {
        groupName,
        dbId
      }
    });
    
    tx.moveCall({
      target: `${PACKAGE_ID}::document_sharing::create_document_group_entry`, 
      arguments: [
        tx.pure.string(groupName),
        tx.pure.string(dbId)
      ]
    });
    console.log('Move call built successfully');
    
    // Execute the transaction
    console.log('🚀 Building and signing transaction...');
    const txBytes = await tx.build({ client });
    const { signature } = await keypair.signTransaction(txBytes);
    
    // Execute the transaction block
    console.log('🚀 Executing transaction...');
    const result = await client.executeTransactionBlock({
      transactionBlock: txBytes,
      signature,
      options: {
        showEffects: true,
        showObjectChanges: true,
        showEvents: true
      }
    });
    
    console.log('✅ Transaction executed successfully!');
    console.log('- Transaction digest:', result.digest);
    
    // Extract the document group ID from the transaction result
    console.log('🔍 Extracting document group ID from transaction result...');
    
    // Log object changes for debugging
    if (result.objectChanges) {
      console.log('- Object changes:');
      result.objectChanges.forEach((change, i) => {
        console.log(`  [${i}] Type: ${change.type}, ObjectType: ${change.objectType}, ID: ${change.objectId}`);
      });
    }
    
    // First try to find the created document group directly
    const documentGroupObject = result.objectChanges?.find(change => 
      change.objectType && 
      change.objectType.includes('document_sharing::DocumentGroup')
    );
    // Initialize variables to store both IDs
    let documentGroupId;
    let adminCapId;

    if (documentGroupObject) {
      console.log('- Found document group directly:', documentGroupObject.objectId);
      documentGroupId = documentGroupObject.objectId;
    }

    // Look for created shared objects if document group not found yet
    if (!documentGroupId && result.effects && result.effects.created) {
      for (const created of result.effects.created) {
        if (created.owner && created.owner.Shared) {
          console.log('- Found shared object in effects:', created.reference.objectId);
          documentGroupId = created.reference.objectId;
          break;
        }
      }
    }

    // Find the AdminCap object that was transferred to the sender
    const adminCapObject = result.objectChanges?.find(change =>
      change.objectType &&
      change.objectType.includes('document_sharing::AdminCap')
    );

    if (adminCapObject) {
      console.log('- Found admin cap:', adminCapObject.objectId);
      adminCapId = adminCapObject.objectId;
    }

    if (!documentGroupId || !adminCapId) {
      throw new Error('Could not extract required object IDs from transaction result');
    }

    return {
      documentGroupId,
      adminCapId,
      transactionDigest: result.digest
    };
    
    throw new Error('Could not extract document group ID from transaction result');
  } catch (error) {
    console.error('❌ Error creating document group:', error);
    throw error;
  }
}

async function publishDocumentToGroup(suiClient, documentGroupId, adminCapId, documentIdHex, keypair) {
  console.log('\n' + '='.repeat(50));
  console.log('STEP 1B: PUBLISHING DOCUMENT TO GROUP');
  console.log('='.repeat(50));
  
  try {
    console.log(`\n📝 Publishing document to group...`);
    console.log('- Document Group ID:', documentGroupId);
    console.log('- Admin Cap ID:', adminCapId);
    console.log('- Document ID:', documentIdHex);
    
    // Create a transaction using Transaction
    console.log('Creating new Transaction...');
    const tx = new Transaction();
    console.log('Transaction created:', tx);
    
    // Set the sender before building the transaction
    const sender = keypair.getPublicKey().toSuiAddress();
    console.log('Setting transaction sender:', sender);
    tx.setSender(sender);
    
    // Call the publish_document_entry function
    console.log('Building move call with params:', {
      target: `${PACKAGE_ID}::document_sharing::publish_document_entry`,
      arguments: {
        documentGroupId,
        adminCapId,
        documentIdHex
      }
    });
    tx.moveCall({
      target: `${PACKAGE_ID}::document_sharing::publish_document_entry`, 
      arguments: [
        tx.object(documentGroupId),
        tx.object(adminCapId),
        tx.pure.string(documentIdHex)
      ]
    });
    
    // Execute the transaction
    console.log('🔏 Building and signing transaction...');
    
    // Build the transaction bytes
    console.log('Building transaction bytes...');
    const txBytes = await tx.build({ client: suiClient });
    console.log('Transaction bytes built:', txBytes);
    console.log('Transaction bytes type:', typeof txBytes);
    console.log('Transaction bytes length:', txBytes.length);
    
    // Sign the transaction bytes
    console.log('Signing transaction bytes...');
    const { signature } = await keypair.signTransaction(txBytes);
    console.log('Transaction signature:', signature);
    
    // Execute the transaction block
    console.log('🚀 Executing transaction...');
    console.log('Executing with params:', {
      transactionBlock: txBytes,
      signature,
      options: {
        showEffects: true,
        showObjectChanges: true
      }
    });
    const result = await suiClient.executeTransactionBlock({
      transactionBlock: txBytes,
      signature,
      options: {
        showEffects: true,
        showObjectChanges: true
      }
    });
    
    console.log('✅ Document published to group successfully!');
    console.log('- Transaction digest:', result.digest);
    
    console.log('\n🔢 Document ID Details (Publishing):');
    console.log('- Document ID (hex):', documentIdHex);
    console.log('- Document ID starts with 0x?', documentIdHex.startsWith('0x'));
    console.log('- Document ID length (chars):', documentIdHex.length);
    console.log('- Using tx.pure.string() for Move call');
    
    return result;
  } catch (error) {
    console.error('\n❌ Error publishing document to group:', error);
    throw error;
  }
}

/**
 * Run the complete workflow
 */
async function runCompleteWorkflow() {
  console.log('\n' + '='.repeat(50));
  console.log('COMPLETE WORKFLOW: ENCRYPT → UPLOAD → DOWNLOAD → DECRYPT');
  console.log('='.repeat(50));
  
  try {
    // Create admin keypair (for group creation and management)
    console.log('\n🔑 Creating admin keypair from private key...');
    const adminKeypair = suiPrivkeyToKeypair(ADMIN_PRIVATE_KEY);
    console.log('- Admin address:', adminKeypair.getPublicKey().toSuiAddress());
    
    // Create user keypair (for document access)
    console.log('\n🔑 Creating user keypair from private key...');
    const userKeypair = suiPrivkeyToKeypair(USER_PRIVATE_KEY);
    console.log('- User address:', userKeypair.getPublicKey().toSuiAddress());
    
    console.log('\n🔌 Initializing Sui client...');
    const suiClient = new SuiClient({ url: RPC_URL });
    await validateSuiClient(suiClient);
    
    // ADMIN OPERATION: Create document group using admin keypair
    console.log('\n📑 Creating document group on chain (ADMIN operation)...');
    const { documentGroupId, adminCapId, transactionDigest } = await createDocumentGroup(suiClient, adminKeypair);
    console.log('- Document Group ID:', documentGroupId);
    console.log('- Admin Cap ID:', adminCapId);
    
    // Wait for transaction to be confirmed
    console.log('⏳ Waiting for transaction to be confirmed...');
    await suiClient.waitForTransaction({
      digest: transactionDigest,
      options: {
        showEvents: true,
        showEffects: true,
        showObjectChanges: true,
      }
    });
    console.log('✅ Transaction confirmed');
    
    // ADMIN OPERATION: Add user to document group
    console.log('\n👥 Adding user to document group (ADMIN operation)...');
    await addUserToGroup(suiClient, documentGroupId, adminCapId, userKeypair.getPublicKey().toSuiAddress(), adminKeypair);
    
    // USER OPERATION: Encrypt document (doesn't require gas)
    console.log('\n🔒 Encrypting document (USER operation)...');
    const { encryptedFilePath, metadataPath, documentIdHex } = await encryptDocument(PDF_FILE_PATH, documentGroupId);
    
    // ADMIN OPERATION: Publish document to group
    console.log('\n📋 Publishing document to group (ADMIN operation)...');
    await publishDocumentToGroup(suiClient, documentGroupId, adminCapId, documentIdHex, adminKeypair);
    
    // Operations that don't require blockchain transactions
    const blobId = uploadToWalrus(encryptedFilePath);
    const downloadedFilePath = downloadFromWalrus(blobId);
    
    // USER OPERATION: Decrypt document
    console.log('\n🔓 Decrypting document (USER operation)...');
    const decryptedFilePath = await decryptDocument(downloadedFilePath, metadataPath, userKeypair);
    
    console.log('\n' + '='.repeat(50));
    console.log('WORKFLOW COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(50));
    console.log(`\n📄 Original file: ${PDF_FILE_PATH}`);
    console.log(`🔒 Encrypted file: ${encryptedFilePath}`);
    console.log(`🆔 Walrus blob ID: ${blobId}`);
    console.log(`📥 Downloaded file: ${downloadedFilePath}`);
    console.log(`🔓 Decrypted file: ${decryptedFilePath}`);
    
  } catch (error) {
    console.error('\n' + '='.repeat(50));
    console.log('❌ WORKFLOW FAILED');
    console.log('='.repeat(50));
    console.error(`\nError: ${error.message}`);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
  }
}

// Add this new function to add a user to the document group
async function addUserToGroup(suiClient, documentGroupId, adminCapId, userAddress, adminKeypair) {
  try {
    console.log(`\n📝 Adding user to document group...`);
    console.log('- Document Group ID:', documentGroupId);
    console.log('- Admin Cap ID:', adminCapId);
    console.log('- User Address:', userAddress);
    
    console.log('Creating new Transaction...');
    const tx = new Transaction();
    console.log('Transaction created:', tx);

    const senderAddress = adminKeypair.getPublicKey().toSuiAddress();
    console.log('Setting transaction sender:', senderAddress);
    tx.setSender(senderAddress);
    
    console.log('Building move call with params:', {
      target: `${PACKAGE_ID}::document_sharing::add_user_entry`,
      arguments: {
        documentGroupId,
        adminCapId,
        userAddress
      }
    });
    const moveCall = tx.moveCall({
      target: `${PACKAGE_ID}::document_sharing::add_user_entry`,
      arguments: [
        tx.object(documentGroupId),
        tx.object(adminCapId),
        tx.pure.address(userAddress)
      ]
    });
    console.log('Move call built:', moveCall);
    
    console.log('Building transaction bytes...');
    const txBytes = await tx.build({ client: suiClient });
    console.log('Transaction bytes built:', txBytes);
    console.log('Transaction bytes type:', typeof txBytes);
    console.log('Transaction bytes length:', txBytes.length);
    
    console.log('Signing transaction...');
    const { signature } = await adminKeypair.signTransaction(txBytes);
    console.log('Transaction signature:', signature);
    
    console.log('Executing transaction with:', {
      transactionBlock: txBytes,
      signature,
      options: {
        showEffects: true,
        showObjectChanges: true
      }
    });
    const result = await suiClient.executeTransactionBlock({
      transactionBlock: txBytes,
      signature,
      options: {
        showEffects: true,
        showObjectChanges: true
      }
    });
    console.log('✅ User added to document group successfully!');
    console.log('- Transaction digest:', result.digest);
    
    return result;
  } catch (error) {
    console.error('\n❌ Error adding user to document group:', error);
    throw error;
  }
}

// Execute the workflow
runCompleteWorkflow().catch(error => {
  console.error('\n💥 Unhandled error:', error);
}); 