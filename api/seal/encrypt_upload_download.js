/**
 * Simplified Workflow Example: Encrypt, Upload to Walrus, Download
 * 
 * This script demonstrates how to:
 * 1. Encrypt a document using Seal SDK
 * 2. Upload the encrypted document to Walrus
 * 3. Download the encrypted document from Walrus
 * 
 * Prerequisites:
 * - Valid .env file with NEXT_PUBLIC_SEAL_PACKAGE_ID
 * - Python environment with walrus-python SDK installed
 * - A document to encrypt (e.g., Personal letter of motivation.pdf)
 */

const { SealClient, getAllowlistedKeyServers } = require('@mysten/seal');
const { SuiClient } = require('@mysten/sui/client');
const { fromHEX, toHex } = require('@mysten/sui/utils');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');
require('dotenv').config();

// Configuration
const NETWORK = 'testnet';
const RPC_URL = 'https://fullnode.testnet.sui.io:443';
const PACKAGE_ID = process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID || '0xdef574b61e5833589723945cefb9e786d1b8d64209ae3d8eb66d3931d644fed1';
const PDF_FILE_PATH = "./Personal letter of motivation.pdf";

// Walrus configuration
const WALRUS_CONTEXT = 'testnet';
const PYTHON_SCRIPT = '../walrus_sdk_manager.py';  // Path to the Python script
const EPOCHS_TO_STORE = 2;
const DELETABLE = true;

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
async function encryptDocument(filePath) {
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
    const mockDocumentGroupId = '0x1111111111111111111111111111111111111111111111111111111111111111';
    const databaseDocumentId = 'doc-' + Date.now().toString(36);
    
    console.log('- Document Group ID (mock):', mockDocumentGroupId);
    console.log('- Database Document ID:', databaseDocumentId);
    
    // Create a random nonce
    const nonce = crypto.randomBytes(5);
    
    // Convert document group ID to bytes and combine with database ID
    const documentGroupBytes = fromHEX(mockDocumentGroupId);
    const dbIdBytes = Buffer.from(databaseDocumentId);
    
    // Combine into a single ID
    const fullIdBytes = new Uint8Array([...documentGroupBytes, ...dbIdBytes, ...nonce]);
    
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
    const encryptedFilePath = `./encrypted_${Date.now()}.bin`;
    fs.writeFileSync(encryptedFilePath, Buffer.from(encryptedBytes));
    
    // Also save metadata for later decryption
    const metadataPath = `${encryptedFilePath}.json`;
    fs.writeFileSync(metadataPath, JSON.stringify({
      documentGroupId: mockDocumentGroupId,
      databaseDocumentId: databaseDocumentId,
      packageId: PACKAGE_ID,
      documentIdHex: documentIdHex,
      // Skip storing the encrypted object here as we'll upload it to Walrus
    }, null, 2));
    
    console.log(`\n💾 Encrypted file saved to: ${encryptedFilePath}`);
    console.log(`💾 Metadata saved to: ${metadataPath}`);
    
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
    
    const downloadPath = `./downloaded_${Date.now()}.bin`;
    
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
 * Run the simplified workflow (encrypt, upload, download)
 */
async function runWorkflow() {
  console.log('\n' + '='.repeat(50));
  console.log('WORKFLOW: ENCRYPT → UPLOAD → DOWNLOAD');
  console.log('='.repeat(50));
  
  try {
    // STEP 1: Encrypt the document
    const { encryptedFilePath, metadataPath } = await encryptDocument(PDF_FILE_PATH);
    
    // STEP 2: Upload to Walrus
    const blobId = uploadToWalrus(encryptedFilePath);
    
    // STEP 3: Download from Walrus
    const downloadedFilePath = downloadFromWalrus(blobId);
    
    console.log('\n' + '='.repeat(50));
    console.log('WORKFLOW COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(50));
    console.log(`\nOriginal file: ${PDF_FILE_PATH}`);
    console.log(`Encrypted file: ${encryptedFilePath}`);
    console.log(`Metadata file: ${metadataPath}`);
    console.log(`Walrus blob ID: ${blobId}`);
    console.log(`Downloaded file: ${downloadedFilePath}`);
    
    console.log('\n📝 To decrypt this file later:');
    console.log(`1. Ensure you have a .env file with USER_PRIVATE_KEY set to the private key of an authorized wallet`);
    console.log(`2. Run: node decrypt_document.js ${metadataPath} ${downloadedFilePath}`);
    
  } catch (error) {
    console.error('\n' + '='.repeat(50));
    console.log('❌ WORKFLOW FAILED');
    console.log('='.repeat(50));
    console.error(`\nError: ${error.message}`);
  }
}

// Execute the workflow
runWorkflow().catch(error => {
  console.error('\n💥 Unhandled error:', error);
}); 