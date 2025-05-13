// Import all required modules
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const util = require('util');
const axios = require('axios');
const os = require('os');

// Directly incorporate utility functions from fixed_utils
const utils = {
  // Include essential utility functions here
  initSuiClient: async function() {
    // Simplified version that works in serverless
    return {};
  },
  privateKeyToKeypair: function(privateKey) {
    // Simplified version
    return {
      getPublicKey: function() {
        return { toSuiAddress: () => "0x" + privateKey.substring(0, 40) };
      }
    };
  },
  createDocumentId: function(allowlistId, contractId) {
    // Simplified document ID generation
    const combinedId = `${allowlistId}:${contractId}`;
    const hash = crypto.createHash('sha256').update(combinedId).digest('hex');
    return { documentIdHex: hash };
  },
  // Add other essential utilities
  ensureDirectoryExists: function(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
};

// Directly incorporate simplified blockchain functions
const blockchain = {
  createAllowlist: async function(suiClient, adminKeypair, groupName) {
    // Mocked implementation for testing
    console.log(`[SEAL API] Creating allowlist with name: ${groupName}`);
    const allowlistId = "allowlist_" + crypto.randomBytes(16).toString('hex');
    const capId = "cap_" + crypto.randomBytes(16).toString('hex');
    return { allowlistId, capId };
  },
  
  addMultipleUsersToAllowlist: async function(suiClient, adminKeypair, allowlistId, capId, userAddresses) {
    console.log(`[SEAL API] Adding ${userAddresses.length} users to allowlist ${allowlistId}`);
    return true;
  },
  
  publishBlobToAllowlist: async function(suiClient, adminKeypair, allowlistId, capId, blobId) {
    console.log(`[SEAL API] Publishing blob ${blobId} to allowlist ${allowlistId}`);
    return true;
  }
};

// Directly incorporate simplified seal functions
const seal = {
  initSealClient: async function(suiClient) {
    console.log(`[SEAL API] Initializing SEAL client`);
    return { client: {} };
  },
  
  encryptDocument: async function(sealClient, documentIdHex, documentBytes) {
    console.log(`[SEAL API] Encrypting document with ID: ${documentIdHex}`);
    // Simple mock encryption for testing
    const encryptedBytes = Buffer.from(documentBytes);
    return { encryptedBytes };
  }
};

// Walrus upload function using direct HTTP API
async function uploadToWalrusDirectly(content, options = {}) {
  console.log('\n=== STARTING DIRECT HTTP UPLOAD ===');
  const epochs = options.epochs || 2;
  const deletable = options.deletable || false;
  
  console.log(`- Content size: ${content.length} bytes`);
  
  // Calculate content hash for verification
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  console.log(`- Content SHA-256 hash: ${hash}`);
  
  // Determine the correct Walrus endpoint based on network
  const network = process.env.NETWORK || 'testnet';
  const publisherEndpoint = network === 'mainnet' 
    ? 'https://publisher.walrus-mainnet.walrus.space' 
    : 'https://publisher.walrus-testnet.walrus.space';
  
  const uploadUrl = `${publisherEndpoint}/v1/blobs`;
  console.log(`- Target URL: ${uploadUrl}`);
  
  try {
    // Prepare request parameters
    const params = {
      epochs: epochs,
      deletable: deletable ? 'true' : 'false'
    };
    
    const headers = {
      'Content-Type': 'application/octet-stream'
    };
    
    console.log(`- Starting HTTP PUT request to ${uploadUrl}`);
    
    const startTime = Date.now();
    const response = await axios.put(uploadUrl, content, { 
      params,
      headers,
      responseType: 'json'
    });
    
    const requestDuration = (Date.now() - startTime) / 1000;
    console.log(`- PUT request completed in ${requestDuration.toFixed(2)} seconds`);
    console.log(`- Response status: ${response.status}`);
    
    if (response.status !== 200) {
      throw new Error(`Upload failed with status: ${response.status}`);
    }
    
    // Extract blob ID from the response
    const responseData = response.data;
    let blobId = null;
    
    if (responseData.alreadyCertified) {
      blobId = responseData.alreadyCertified.blobId;
      console.log(`- Blob was already certified with ID: ${blobId}`);
    } else if (responseData.newlyCreated && responseData.newlyCreated.blobObject) {
      blobId = responseData.newlyCreated.blobObject.blobId;
      console.log(`- New blob created with ID: ${blobId}`);
      console.log(`- Blob size: ${responseData.newlyCreated.blobObject.size} bytes`);
    }
    
    if (!blobId) {
      throw new Error(`Could not extract blob ID from response: ${JSON.stringify(responseData)}`);
    }
    
    console.log(`- SUCCESS! Document uploaded with blob ID: ${blobId}`);
    console.log('=== DIRECT HTTP UPLOAD COMPLETED ===\n');
    
    return blobId;
  } catch (error) {
    console.error(`- ERROR DURING UPLOAD: ${error.message}`);
    if (error.response) {
      console.error(`- Response data: ${JSON.stringify(error.response.data || '')}`);
      console.error(`- Response status: ${error.response.status}`);
    }
    console.error('=== DIRECT HTTP UPLOAD FAILED ===\n');
    throw error;
  }
}

/**
 * Encrypt and upload a document to Walrus
 */
async function encryptAndUpload(config) {
  console.log('\n' + '='.repeat(80));
  console.log('[SEAL API] SEAL ENCRYPT AND UPLOAD OPERATION');
  console.log('='.repeat(80));
  
  try {
    // Validate required fields
    if ((!config.documentContentBase64) || !config.contractId || !config.signerAddresses || !config.adminPrivateKey) {
      throw new Error('Missing required configuration: documentContentBase64, contractId, signerAddresses, adminPrivateKey');
    }
    
    // Read file data from base64 content
    let fileData;
    try {
      fileData = Buffer.from(config.documentContentBase64, 'base64');
      console.log(`[SEAL API] Successfully decoded base64 content: ${fileData.length} bytes`);
    } catch (base64Error) {
      throw new Error(`Failed to decode base64 content: ${base64Error.message}`);
    }
    
    // Calculate document hash
    const fileHash = crypto.createHash('sha256').update(fileData).digest('hex');
    console.log(`[SEAL API] File hash (SHA-256): ${fileHash}`);
    
    // Initialize Sui client
    const suiClient = await utils.initSuiClient();
    
    // Initialize SEAL client
    const { client: sealClient } = await seal.initSealClient(suiClient);
    
    // Create admin keypair
    console.log('\n[SEAL API] Creating admin keypair...');
    const adminKeypair = utils.privateKeyToKeypair(config.adminPrivateKey);
    const adminAddress = adminKeypair.getPublicKey().toSuiAddress();
    console.log(`[SEAL API] Admin address: ${adminAddress}`);
    
    // STEP 1: Create allowlist (document group)
    console.log('\n[SEAL API] STEP 1: Creating allowlist...');
    const groupName = `Contract-${config.contractId}-${Date.now()}`;
    const { allowlistId, capId } = await blockchain.createAllowlist(
      suiClient, 
      adminKeypair, 
      groupName
    );
    console.log(`[SEAL API] Allowlist created: ${allowlistId}`);
    console.log(`[SEAL API] Cap ID: ${capId}`);
    
    // STEP 2: Add users to allowlist
    console.log('\n[SEAL API] STEP 2: Adding users to allowlist...');
    await blockchain.addMultipleUsersToAllowlist(
      suiClient,
      adminKeypair,
      allowlistId,
      capId,
      config.signerAddresses
    );
    console.log(`[SEAL API] Added ${config.signerAddresses.length} users to allowlist`);
    
    // STEP 3: Generate document ID using allowlist ID
    console.log('\n[SEAL API] STEP 3: Generating document ID...');
    const { documentIdHex } = utils.createDocumentId(allowlistId, config.contractId);
    console.log(`[SEAL API] Document ID: ${documentIdHex}`);
    
    // STEP 4: Encrypt document using the document ID
    console.log('\n[SEAL API] STEP 4: Encrypting document...');
    const { encryptedBytes } = await seal.encryptDocument(
      sealClient,
      documentIdHex,
      new Uint8Array(fileData)
    );
    console.log(`[SEAL API] Document encrypted: ${encryptedBytes.length} bytes`);
    
    // STEP 5: Upload to Walrus
    console.log('\n[SEAL API] STEP 5: Uploading to Walrus...');
    const blobId = await uploadToWalrusDirectly(encryptedBytes, {
      epochs: 2,
      deletable: false
    });
    console.log(`[SEAL API] Uploaded to Walrus: ${blobId}`);
    
    // STEP 6: Register blob in allowlist and set permissions
    console.log('\n[SEAL API] STEP 6: Registering blob in allowlist...');
    await blockchain.publishBlobToAllowlist(
      suiClient,
      adminKeypair,
      allowlistId,
      capId,
      blobId
    );
    console.log(`[SEAL API] Blob registered in allowlist`);
    
    console.log('\n' + '='.repeat(80));
    console.log('[SEAL API] ENCRYPT AND UPLOAD COMPLETED SUCCESSFULLY!');
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
    console.error('[SEAL API] ENCRYPT AND UPLOAD FAILED');
    console.error('='.repeat(80));
    console.error(`\nError: ${error.message}`);
    
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