/**
 * Complete SEAL Workflow: Encrypt → Upload → Download → Decrypt
 * 
 * This script demonstrates the complete workflow for document encryption, storage, and access
 * using Sui blockchain, SEAL SDK, and Walrus blob storage.
 *
 * Enhanced version with optimized transactions and improved logging.
 * Using a specific PDF file: archpoint.pdf
 * 
 * Workflow:
 * 1. Deploy package (once, not part of this script)
 * 2. Create allowlist (get allowlist ID)
 * 3. Add users to allowlist (optional at this stage)
 * 4. Generate document ID using allowlist ID as prefix
 * 5. Encrypt document using this document ID
 * 6. Upload to Walrus (get blob_id)
 * 7. Register blob and set permissions
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Import configuration
const config = require('./fixed_config');

// Import utility modules
const utils = require('./fixed_utils');
const blockchain = require('./fixed_blockchain');
const walrus = require('./fixed_walrus');
const seal = require('./fixed_seal');

// Hard-coded PDF file path
const PDF_FILE_PATH = '/Users/r21m/Documents/GitHub/epoch_one/test.pdf';

// Create test directory if it doesn't exist
utils.ensureDirectoryExists(config.TEMP_DIR);

/**
 * Run the complete workflow
 */
async function runCompleteWorkflow(options = {}) {
  console.log('\n' + '='.repeat(80));
  console.log('COMPLETE SEAL WORKFLOW: ENCRYPT → UPLOAD → DOWNLOAD → DECRYPT');
  console.log('='.repeat(80));
  console.log('\n📋 Configuration:');
  console.log(`- Network: ${config.NETWORK}`);
  console.log(`- Seal Package ID: ${config.SEAL_PACKAGE_ID}`);
  console.log(`- Allowlist Package ID: ${config.ALLOWLIST_PACKAGE_ID}`);
  console.log(`- Using batch operations: ${options.useBatch !== false ? 'YES' : 'NO'}`);
  console.log(`- Using PDF file: ${PDF_FILE_PATH}`);
  
  try {
    // Validate required environment variables
    if (!config.ADMIN_PRIVATE_KEY) {
      throw new Error('ADMIN_PRIVATE_KEY environment variable not set. Check your .env file.');
    }
    
    if (!config.USER_PRIVATE_KEY) {
      throw new Error('USER_PRIVATE_KEY environment variable not set. Check your .env file.');
    }
    
    // Check if PDF file exists
    if (!fs.existsSync(PDF_FILE_PATH)) {
      throw new Error(`PDF file not found: ${PDF_FILE_PATH}`);
    }
    
    console.log(`\n📄 Using PDF file: ${PDF_FILE_PATH}`);
    const fileStats = fs.statSync(PDF_FILE_PATH);
    console.log(`- File size: ${fileStats.size} bytes (${(fileStats.size / 1024 / 1024).toFixed(2)} MB)`);
    
    // Read the file
    const fileData = utils.readFromFile(PDF_FILE_PATH);
    
    // Initialize Sui client
    const suiClient = await utils.initSuiClient();
    
    // Initialize SEAL client
    const { client: sealClient } = await seal.initSealClient(suiClient);
    
    // Create admin keypair
    console.log('\n🔑 Creating admin keypair...');
    const adminKeypair = utils.privateKeyToKeypair(config.ADMIN_PRIVATE_KEY);
    const adminAddress = adminKeypair.getPublicKey().toSuiAddress();
    console.log(`- Admin address: ${adminAddress}`);
    
    // Create user keypair
    console.log('\n🔑 Creating user keypair...');
    const userKeypair = utils.privateKeyToKeypair(config.USER_PRIVATE_KEY);
    const userAddress = userKeypair.getPublicKey().toSuiAddress();
    console.log(`- User address: ${userAddress}`);
    
    // STEP 1: Create allowlist (document group)
    const groupName = `ArchPoint-${Date.now()}`;
    const { allowlistId, capId } = await blockchain.createAllowlist(
      suiClient, 
      adminKeypair, 
      groupName
    );
    
    // STEP 2: Add user(s) to allowlist
    // Using batch add if multiple users and batch operations are enabled
    const useBatch = options.useBatch !== false;
    const userAddresses = options.additionalUsers ? 
      [userAddress, ...options.additionalUsers] : 
      [userAddress];
    
    if (userAddresses.length > 1 && useBatch) {
      // Batch add multiple users
      await blockchain.addMultipleUsersToAllowlist(
        suiClient,
        adminKeypair,
        allowlistId,
        capId,
        userAddresses
      );
    } else {
      // Add users one by one
      for (const address of userAddresses) {
        await blockchain.addUserToAllowlist(
          suiClient,
          adminKeypair,
          allowlistId,
          capId,
          address
        );
      }
    }
    
    // STEP 3: Generate document ID using allowlist ID
    const { documentIdHex } = utils.createDocumentId(allowlistId);
    
    // STEP 4: Encrypt document using the document ID
    console.log('\n🔒 STEP 4: Encrypting PDF document...');
    const { encryptedBytes } = await seal.encryptDocument(
      sealClient,
      documentIdHex,
      new Uint8Array(fileData)
    );
    
    // Save encrypted data temporarily
    const encryptedFilePath = path.join(config.TEMP_DIR, `encrypted-archpoint-${Date.now()}.bin`);
    utils.saveToFile(Buffer.from(encryptedBytes), encryptedFilePath);
    
    // STEP 5: Upload to Walrus
    const { blobId } = await walrus.uploadToWalrus(encryptedBytes);
    
    // STEP 6: Download from Walrus to verify
    const downloadedFilePath = path.join(config.TEMP_DIR, `downloaded-archpoint-${Date.now()}.bin`);
    const downloadedData = await walrus.downloadFromWalrus(blobId, downloadedFilePath);
    
    // STEP 7: Register blob in allowlist and set permissions
    if (useBatch) {
      try {
        // Register blob and set permissions in one transaction
        await blockchain.registerBlobAndSetPermissions(
          suiClient,
          adminKeypair,
          allowlistId,
          capId,
          blobId,
          userAddresses
        );
      } catch (error) {
        console.log("❌ Batch registration failed, falling back to separate transactions");
        // First ensure users are in allowlist
        await blockchain.addMultipleUsersToAllowlist(
          suiClient,
          adminKeypair,
          allowlistId,
          capId,
          userAddresses
        );
        
        // Then publish the blob
        await blockchain.publishBlobToAllowlist(
          suiClient,
          adminKeypair,
          allowlistId,
          capId,
          blobId
        );
      }
    } else {
      // Register blob in a separate transaction (legacy approach)
      await blockchain.publishBlobToAllowlist(
        suiClient,
        adminKeypair,
        allowlistId,
        capId,
        blobId
      );
    }
    // Create session key for user to decrypt
    console.log('\n🔑 Creating session key for user to decrypt...');
    const sessionKey = await seal.createSessionKey(userKeypair, config.ALLOWLIST_PACKAGE_ID);
    
    // Approve and fetch keys
    const { txKindBytes } = await seal.approveAndFetchKeys(
      suiClient,
      sealClient,
      sessionKey,
      allowlistId,
      documentIdHex
    );
    
    // Decrypt the document
    const decryptedData = await seal.decryptDocument(
      sealClient,
      sessionKey, 
      downloadedData,
      txKindBytes
    );
    
    // Save decrypted file
    const decryptedFilePath = path.join(config.TEMP_DIR, `decrypted-archpoint-${Date.now()}.pdf`);
    utils.saveToFile(Buffer.from(decryptedData), decryptedFilePath);
    
    // Verify decryption was successful
    console.log('\n✅ Verifying decryption...');
    const originalHash = crypto.createHash('sha256').update(fileData).digest('hex');
    const decryptedHash = crypto.createHash('sha256').update(decryptedData).digest('hex');
    const isMatch = originalHash === decryptedHash;
    
    console.log(`- Original file hash: ${originalHash}`);
    console.log(`- Decrypted file hash: ${decryptedHash}`);
    console.log(`- Files ${isMatch ? 'match ✅' : 'DO NOT match ❌'}`);
    
    if (!isMatch) {
      throw new Error('Decryption verification failed - hashes do not match!');
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('WORKFLOW COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(80));
    
    console.log('\n📑 Summary:');
    console.log(`- Original PDF file: ${PDF_FILE_PATH}`);
    console.log(`- Encrypted file: ${encryptedFilePath}`);
    console.log(`- Walrus blob ID: ${blobId}`);
    console.log(`- Downloaded file: ${downloadedFilePath}`);
    console.log(`- Decrypted file: ${decryptedFilePath}`);
    console.log(`- Allowlist ID: ${allowlistId}`);
    console.log(`- Admin Cap ID: ${capId}`);
    console.log(`- Document ID: ${documentIdHex}`);
    console.log(`- Authorized users: ${userAddresses.join(', ')}`);
    
    return {
      success: true,
      allowlistId,
      capId,
      blobId,
      documentIdHex,
      decryptedFilePath,
      encryptedFilePath,
      userAddresses
    };
  } catch (error) {
    console.error('\n' + '='.repeat(80));
    console.error('❌ WORKFLOW FAILED');
    console.error('='.repeat(80));
    console.error(`\nError: ${error.message}`);
    console.error('\nStack trace:');
    console.error(error.stack);
    
    return {
      success: false,
      error
    };
  }
}

// Library export
module.exports = {
  runCompleteWorkflow
};

// If this script is run directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const useBatch = args.includes('--no-batch') ? false : true;
  
  console.log(`🚀 Starting SEAL workflow with PDF file: ${PDF_FILE_PATH}`);
  console.log(`- Batch operations: ${useBatch ? 'enabled' : 'disabled'}`);
  
  runCompleteWorkflow({ useBatch })
    .then(result => {
      if (result.success) {
        process.exit(0);
      } else {
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Unhandled exception:', error);
      process.exit(1);
    });
}
