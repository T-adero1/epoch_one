// Import all required modules
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

// Import the ACTUAL modules from your existing code
// These are direct imports from your files
const utils = require('./upload_encrypt_download_decrypt/fixed_utils');
const blockchain = require('./upload_encrypt_download_decrypt/fixed_blockchain');
const walrus = require('./upload_encrypt_download_decrypt/fixed_walrus');
const seal = require('./upload_encrypt_download_decrypt/fixed_seal');
const config = require('./upload_encrypt_download_decrypt/fixed_config');

/**
 * Encrypt and upload a document to Walrus using the EXACT same flow as in seal_operations.js
 */
async function encryptAndUpload(config) {
  console.log('\n' + '='.repeat(80));
  console.log('SEAL ENCRYPT AND UPLOAD OPERATION');
  console.log('='.repeat(80));
  
  try {
    // Validate required fields
    if ((!config.documentContentBase64) || !config.contractId || !config.signerAddresses || !config.adminPrivateKey) {
      throw new Error('Missing required configuration: documentContentBase64, contractId, signerAddresses, adminPrivateKey');
    }
    
    // Set required environment variables from config
    process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID = config.sealPackageId;
    process.env.NEXT_PUBLIC_ALLOWLIST_PACKAGE_ID = config.allowlistPackageId || config.sealPackageId;
    process.env.ADMIN_PRIVATE_KEY = config.adminPrivateKey;
    process.env.NETWORK = config.network || 'testnet';
    
    console.log('\n Configuration:');
    console.log(`- Network: ${process.env.NETWORK}`);
    console.log(`- Seal Package ID: ${process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID}`);
    console.log(`- Allowlist Package ID: ${process.env.NEXT_PUBLIC_ALLOWLIST_PACKAGE_ID}`);
    
    // Read file data from base64 content
    let fileData;
    try {
      fileData = Buffer.from(config.documentContentBase64, 'base64');
      console.log(`- Successfully decoded base64 content: ${fileData.length} bytes`);
    } catch (base64Error) {
      throw new Error(`Failed to decode base64 content: ${base64Error.message}`);
    }
    
    // Calculate document hash
    const fileHash = crypto.createHash('sha256').update(fileData).digest('hex');
    console.log(`- File hash (SHA-256): ${fileHash}`);
    
    // Initialize Sui client - use the EXACT same function from your utils
    const suiClient = await utils.initSuiClient();
    
    // Initialize SEAL client - use the EXACT same function from your seal module
    const { client: sealClient } = await seal.initSealClient(suiClient);
    
    // Create admin keypair - use the EXACT same function from your utils
    console.log('\n Creating admin keypair...');
    const adminKeypair = utils.privateKeyToKeypair(config.adminPrivateKey);
    const adminAddress = adminKeypair.getPublicKey().toSuiAddress();
    console.log(`- Admin address: ${adminAddress}`);
    
    // STEP 1: Create allowlist (document group) - use the EXACT same function from your blockchain module
    console.log('\n STEP 1: Creating allowlist...');
    const groupName = `Contract-${config.contractId}-${Date.now()}`;
    const { allowlistId, capId } = await blockchain.createAllowlist(
      suiClient, 
      adminKeypair, 
      groupName
    );
    console.log(`- Allowlist created: ${allowlistId}`);
    console.log(`- Cap ID: ${capId}`);
    
    // STEP 2: Add users to allowlist - use the EXACT same function from your blockchain module
    console.log('\n STEP 2: Adding users to allowlist...');
    await blockchain.addMultipleUsersToAllowlist(
      suiClient,
      adminKeypair,
      allowlistId,
      capId,
      config.signerAddresses
    );
    console.log(`- Added ${config.signerAddresses.length} users to allowlist`);
    
    // STEP 3: Generate document ID using allowlist ID - use the EXACT same function from your utils
    console.log('\n STEP 3: Generating document ID...');
    const { documentIdHex } = utils.createDocumentId(allowlistId, config.contractId);
    console.log(`- Document ID: ${documentIdHex}`);
    
    // STEP 4: Encrypt document using the document ID - use the EXACT same function from your seal module
    console.log('\n STEP 4: Encrypting document...');
    const { encryptedBytes } = await seal.encryptDocument(
      sealClient,
      documentIdHex,
      new Uint8Array(fileData)
    );
    console.log(`- Document encrypted: ${encryptedBytes.length} bytes`);
    
    // STEP 5: Upload to Walrus - use the EXACT same function from your walrus module
    console.log('\n STEP 5: Uploading to Walrus...');
    const { blobId } = await walrus.uploadToWalrus(encryptedBytes);
    console.log(`- Uploaded to Walrus: ${blobId}`);
    
    // STEP 6: Register blob in allowlist and set permissions - use the EXACT same function from your blockchain module
    console.log('\n STEP 6: Registering blob in allowlist...');
    await blockchain.publishBlobToAllowlist(
      suiClient,
      adminKeypair,
      allowlistId,
      capId,
      blobId
    );
    console.log(`- Blob registered in allowlist`);
    
    console.log('\n' + '='.repeat(80));
    console.log('ENCRYPT AND UPLOAD COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(80));
    
    return {
      success: true,
      contractId: config.contractId,
      allowlistId,
      capId,
      blobId,
      documentIdHex,
      fileHash,
      signerAddresses: config.signerAddresses
    };
  } catch (error) {
    console.error('\n' + '='.repeat(80));
    console.error(' ENCRYPT AND UPLOAD FAILED');
    console.error('='.repeat(80));
    console.error(`\nError: ${error.message}`);
    console.error(`\nStack: ${error.stack}`);
    
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

// Vercel serverless function handler
module.exports = async (req, res) => {
  console.log('[SEAL API] Request received:', req.method);
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const config = req.body;
    console.log('[SEAL API] Processing request for contract:', config.contractId);
    
    const result = await encryptAndUpload(config);
    
    if (result.success) {
      return res.status(200).json(result);
    } else {
      return res.status(500).json(result);
    }
  } catch (error) {
    console.error('[SEAL API] Unhandled error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
}; 