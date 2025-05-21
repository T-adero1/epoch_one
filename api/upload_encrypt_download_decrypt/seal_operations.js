/**
 * SEAL Protocol Operations
 * 
 * This module provides separate functions for different parts of the SEAL workflow:
 * - encryptAndUpload: Encrypts a document and uploads it to Walrus
 * - downloadAndDecrypt: Downloads and decrypts a document from Walrus
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Import utility modules
const utils = require('./fixed_utils');
const blockchain = require('./fixed_blockchain');
const walrus = require('./fixed_walrus');
const seal = require('./fixed_seal');

// Configure logging based on environment variables
const VERBOSE = process.env.SEAL_VERBOSE === 'true' || false;
const DEBUG = process.env.SEAL_DEBUG === 'true' || false;
const LOG_LEVEL = process.env.SEAL_LOG_LEVEL || 'info';

// Enhanced logging function
function logDetail(message, level = 'info') {
  if (level === 'debug' && !DEBUG) return;
  if (level === 'verbose' && !VERBOSE) return;
  
  const timestamp = new Date().toISOString();
  console.log(`[SEAL-DETAIL] [${timestamp}] [${level.toUpperCase()}] ${message}`);
}

/**
 * Encrypt a document and upload it to Walrus
 * 
 * @param {Object} config - Configuration object
 * @param {string} config.documentPath - Path to the document to encrypt
 * @param {string} config.contractId - Contract ID
 * @param {Array<string>} config.signerAddresses - List of signer wallet addresses
 * @param {string} config.adminPrivateKey - Admin private key
 * @param {string} config.sealPackageId - SEAL package ID
 * @param {string} config.allowlistPackageId - Allowlist package ID (optional)
 * @param {string} config.network - Network to use (default: testnet)
 * @param {boolean} config.preEncrypted - Indicates if the document is pre-encrypted
 * @param {string} config.documentIdHex - Document ID for decryption
 * @param {string} config.documentSalt - Document salt for decryption
 * @returns {Promise<Object>} - Result object with allowlistId, capId, blobId, documentIdHex
 */
async function encryptAndUpload(config) {
  console.log('\n' + '='.repeat(80));
  console.log('SEAL ENCRYPT AND UPLOAD OPERATION');
  console.log('='.repeat(80));
  
  logDetail('Starting SEAL encryption with detailed logging', 'debug');
  logDetail(`Contract ID: ${config.contractId}`, 'debug');
  logDetail(`Signers: ${config.signerAddresses.join(', ')}`, 'debug');
  
  // Set required environment variables from config
  process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID = config.sealPackageId;
  process.env.NEXT_PUBLIC_ALLOWLIST_PACKAGE_ID = config.allowlistPackageId || config.sealPackageId;
  process.env.ADMIN_PRIVATE_KEY = config.adminPrivateKey;
  process.env.NETWORK = config.network || 'testnet';
  
  console.log('\n Configuration:');
  console.log(`- Network: ${process.env.NETWORK}`);
  console.log(`- Seal Package ID: ${process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID}`);
  console.log(`- Allowlist Package ID: ${process.env.NEXT_PUBLIC_ALLOWLIST_PACKAGE_ID}`);
  
  // NEW: Check if document is pre-encrypted
  const isPreEncrypted = config.preEncrypted === true;
  if (isPreEncrypted) {
    console.log(`- Document is PRE-ENCRYPTED by client`);
    console.log(`- Document ID: ${config.documentIdHex}`);
    console.log(`- Document Salt: ${config.documentSalt}`);
  } else {
    // Regular logging
    if (config.documentContentBase64) {
      console.log(`- Document Content: Provided as base64 (${config.documentContentBase64.length} chars)`);
    } else {
      console.log(`- Document Path: ${config.documentPath}`);
    }
  }
  
  console.log(`- Contract ID: ${config.contractId}`);
  console.log(`- Signer Addresses: ${config.signerAddresses.length} addresses`);
  
  // Log environment details
  if (DEBUG) {
    logDetail(`Debug logging enabled`, 'debug');
    logDetail(`Process environment: ${JSON.stringify({
      NODE_ENV: process.env.NODE_ENV,
      DEBUG: process.env.DEBUG,
      SEAL_DEBUG: process.env.SEAL_DEBUG,
      SEAL_VERBOSE: process.env.SEAL_VERBOSE
    })}`, 'debug');
    logDetail(`Configuration details: ${JSON.stringify({
      contractId: config.contractId,
      documentContentLength: config.documentContentBase64?.length,
      signerAddresses: config.signerAddresses,
      options: config.options
    })}`, 'debug');
  }
  
  try {
    // Validate required fields
    if ((!config.documentPath && !config.documentContentBase64) || !config.contractId || !config.signerAddresses || !config.adminPrivateKey) {
      throw new Error('Missing required configuration: Either documentPath or documentContentBase64 required, plus contractId, signerAddresses, adminPrivateKey');
    }
    
    // Read file data - either from path or base64 content
    let fileData;
    
    if (config.documentContentBase64) {
      console.log(`- Using provided base64 document content directly`);
      try {
        fileData = Buffer.from(config.documentContentBase64, 'base64');
        console.log(`- Successfully decoded base64 content: ${fileData.length} bytes`);
      } catch (base64Error) {
        throw new Error(`Failed to decode base64 content: ${base64Error.message}`);
      }
    } else if (config.documentPath) {
      // Original file path logic
      if (!fs.existsSync(config.documentPath)) {
        throw new Error(`Document not found: ${config.documentPath}`);
      }
      
      // Read the file
      fileData = fs.readFileSync(config.documentPath);
      console.log(`- File read from path: ${config.documentPath}`);
    } else {
      throw new Error("No document content provided - need either documentContentBase64 or documentPath");
    }
    
    console.log(`- File size: ${fileData.length} bytes (${(fileData.length / 1024 / 1024).toFixed(2)} MB)`);
    
    // Calculate document hash
    const fileHash = crypto.createHash('sha256').update(fileData).digest('hex');
    console.log(`- File hash (SHA-256): ${fileHash}`);
    
    // Initialize Sui client
    const suiClient = await utils.initSuiClient();
    
    // Initialize SEAL client
    const { client: sealClient } = await seal.initSealClient(suiClient);
    
    // Create admin keypair
    console.log('\n Creating admin keypair...');
    const adminKeypair = utils.privateKeyToKeypair(config.adminPrivateKey);
    const adminAddress = adminKeypair.getPublicKey().toSuiAddress();
    console.log(`- Admin address: ${adminAddress}`);
    
    // STEP 1: Create allowlist (document group)
    console.log('\n STEP 1: Creating allowlist...');
    const groupName = `Contract-${config.contractId}-${Date.now()}`;
    const { allowlistId, capId } = await blockchain.createAllowlist(
      suiClient, 
      adminKeypair, 
      groupName
    );
    console.log(`- Allowlist created: ${allowlistId}`);
    console.log(`- Cap ID: ${capId}`);
    
    // STEP 2: Add users to allowlist
    console.log('\n STEP 2: Adding users to allowlist...');
    await blockchain.addMultipleUsersToAllowlist(
      suiClient,
      adminKeypair,
      allowlistId,
      capId,
      config.signerAddresses
    );
    console.log(`- Added ${config.signerAddresses.length} users to allowlist`);
    
    // STEP 3: Generate document ID using allowlist ID
    let documentIdHex;
    if (isPreEncrypted && config.documentIdHex) {
      // If pre-encrypted, use the provided document ID
      documentIdHex = config.documentIdHex;
      console.log(`\n STEP 3: Using client-provided document ID: ${documentIdHex}`);
    } else {
      // Otherwise, generate a new document ID
      console.log('\n STEP 3: Generating document ID...');
      const result = utils.createDocumentId(allowlistId, config.contractId);
      documentIdHex = result.documentIdHex;
      console.log(`- Document ID: ${documentIdHex}`);
    }
    
    // STEP 4: Encrypt document using the document ID (SKIP if pre-encrypted)
    let encryptedBytes;
    if (isPreEncrypted) {
      console.log('\n STEP 4: SKIPPING encryption - document is already encrypted by client');
      encryptedBytes = new Uint8Array(fileData); // Just use the provided encrypted data
    } else {
      console.log('\n STEP 4: Encrypting document...');
      const { encryptedBytes: newEncryptedBytes } = await seal.encryptDocument(
        sealClient,
        documentIdHex,
        new Uint8Array(fileData)
      );
      encryptedBytes = newEncryptedBytes;
      console.log(`- Document encrypted: ${encryptedBytes.length} bytes`);
    }
    
    // STEP 5: Upload to Walrus
    console.log('\n STEP 5: Uploading to Walrus...');
    const { blobId } = await walrus.uploadToWalrus(encryptedBytes);
    console.log(`- Uploaded to Walrus: ${blobId}`);
    
    // STEP 6: Register blob in allowlist and set permissions
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
      signerAddresses: config.signerAddresses,
      // Include additional info for pre-encrypted docs
      preEncrypted: isPreEncrypted
    };
  } catch (error) {
    console.error('\n' + '='.repeat(80));
    console.error(' ENCRYPT AND UPLOAD FAILED');
    console.error('='.repeat(80));
    console.error(`\nError: ${error.message}`);
    
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

/**
 * Download and decrypt a document from Walrus
 * 
 * @param {Object} config - Configuration object
 * @param {string} config.blobId - Blob ID to download
 * @param {string} config.allowlistId - Allowlist ID for the document
 * @param {string} config.documentIdHex - Document ID for decryption
 * @param {string} config.userPrivateKey - User private key for decryption
 * @param {string} config.outputPath - Path to save the decrypted document
 * @param {string} config.sealPackageId - SEAL package ID
 * @param {string} config.allowlistPackageId - Allowlist package ID (optional)
 * @param {string} config.network - Network to use (default: testnet)
 * @returns {Promise<Object>} - Result object with decryptedFilePath
 */
async function downloadAndDecrypt(config) {
  console.log('\n' + '='.repeat(80));
  console.log('SEAL DOWNLOAD AND DECRYPT OPERATION');
  console.log('='.repeat(80));
  
  // Set required environment variables from config
  process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID = config.sealPackageId;
  process.env.NEXT_PUBLIC_ALLOWLIST_PACKAGE_ID = config.allowlistPackageId || config.sealPackageId;
  process.env.USER_PRIVATE_KEY = config.userPrivateKey;
  process.env.NETWORK = config.network || 'testnet';
  
  console.log('\n Configuration:');
  console.log(`- Network: ${process.env.NETWORK}`);
  console.log(`- Seal Package ID: ${process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID}`);
  console.log(`- Allowlist Package ID: ${process.env.NEXT_PUBLIC_ALLOWLIST_PACKAGE_ID}`);
  console.log(`- Blob ID: ${config.blobId}`);
  console.log(`- Allowlist ID: ${config.allowlistId}`);
  console.log(`- Document ID: ${config.documentIdHex}`);
  console.log(`- Output Path: ${config.outputPath}`);
  
  try {
    // Validate required fields
    if (!config.blobId || !config.allowlistId || !config.documentIdHex || !config.userPrivateKey) {
      throw new Error('Missing required configuration: blobId, allowlistId, documentIdHex, userPrivateKey');
    }
    
    // Initialize Sui client
    const suiClient = await utils.initSuiClient();
    
    // Initialize SEAL client
    const { client: sealClient } = await seal.initSealClient(suiClient);
    
    // Create user keypair
    console.log('\n Creating user keypair...');
    const userKeypair = utils.privateKeyToKeypair(config.userPrivateKey);
    const userAddress = userKeypair.getPublicKey().toSuiAddress();
    console.log(`- User address: ${userAddress}`);
    
    // STEP 1: Download from Walrus
    console.log('\n STEP 1: Downloading from Walrus...');
    const downloadedData = await walrus.downloadFromWalrus(config.blobId);
    console.log(`- Downloaded ${downloadedData.length} bytes from Walrus`);
    
    // STEP 2: Create session key
    console.log('\n STEP 2: Creating session key...');
    const sessionKey = await seal.createSessionKey(userKeypair, config.allowlistPackageId);
    console.log(`- Session key created`);
    
    // STEP 3: Approve and fetch keys
    console.log('\n STEP 3: Approving and fetching keys...');
    const { txKindBytes } = await seal.approveAndFetchKeys(
      suiClient,
      sealClient,
      sessionKey,
      config.allowlistId,
      config.documentIdHex
    );
    console.log(`- Keys fetched successfully`);
    
    // STEP 4: Decrypt document
    console.log('\n STEP 4: Decrypting document...');
    const decryptedData = await seal.decryptDocument(
      sealClient,
      sessionKey, 
      downloadedData,
      txKindBytes
    );
    console.log(`- Document decrypted: ${decryptedData.length} bytes`);
    
    // STEP 5: Save decrypted document
    console.log('\n STEP 5: Saving decrypted document...');
    const outputPath = config.outputPath || path.join(process.cwd(), `decrypted-${Date.now()}.pdf`);
    fs.writeFileSync(outputPath, Buffer.from(decryptedData));
    console.log(`- Decrypted document saved to: ${outputPath}`);
    
    // Calculate decrypted document hash
    const decryptedHash = crypto.createHash('sha256').update(decryptedData).digest('hex');
    console.log(`- Decrypted file hash: ${decryptedHash}`);
    
    console.log('\n' + '='.repeat(80));
    console.log('DOWNLOAD AND DECRYPT COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(80));
    
    return {
      success: true,
      decryptedFilePath: outputPath,
      decryptedHash,
      decryptedSize: decryptedData.length
    };
  } catch (error) {
    console.error('\n' + '='.repeat(80));
    console.error(' DOWNLOAD AND DECRYPT FAILED');
    console.error('='.repeat(80));
    console.error(`\nError: ${error.message}`);
    
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

/**
 * Run encrypt/upload or download/decrypt operation based on config
 */
function runOperation(configPath) {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    // Add clear input logging markers
    console.log('==== SEAL_OPERATION_INPUT_BEGIN ====');
    console.log(JSON.stringify(config, (key, value) => {
      // Don't log private keys or full document content (just length)
      if (key === 'adminPrivateKey' || key === 'userPrivateKey') {
        return '[REDACTED]';
      }
      if (key === 'documentContentBase64' && typeof value === 'string') {
        return `[BASE64_CONTENT_LENGTH:${value.length}]`;
      }
      return value;
    }, 2));
    console.log('==== SEAL_OPERATION_INPUT_END ====');
    
    let result;
    if (config.operation === 'encrypt') {
      result = encryptAndUpload(config);
    } else if (config.operation === 'decrypt') {
      result = downloadAndDecrypt(config);
    } else {
      throw new Error(`Invalid operation: ${config.operation}. Must be 'encrypt' or 'decrypt'`);
    }
    
    // Add promise handling to log output
    return Promise.resolve(result).then(resultValue => {
      // Add clear output logging markers
      console.log('==== SEAL_OPERATION_OUTPUT_BEGIN ====');
      console.log(JSON.stringify(resultValue, null, 2));
      console.log('==== SEAL_OPERATION_OUTPUT_END ====');
      return resultValue;
    });
  } catch (error) {
    console.error(`Error reading or parsing config: ${error.message}`);
    const errorResult = {
      success: false,
      error: error.message
    };
    console.log('==== SEAL_OPERATION_OUTPUT_BEGIN ====');
    console.log(JSON.stringify(errorResult, null, 2));
    console.log('==== SEAL_OPERATION_OUTPUT_END ====');
    return errorResult;
  }
}

module.exports = {
  encryptAndUpload,
  downloadAndDecrypt,
  runOperation
};

// If this script is run directly
if (require.main === module) {
  const configPath = process.argv[2];
  
  if (!configPath) {
    console.error('Please provide a path to the configuration file');
    process.exit(1);
  }
  
  runOperation(configPath)
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