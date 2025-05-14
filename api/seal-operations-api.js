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
    
    // STEP 3: Generate document ID using allowlist ID - CRITICAL: Use EXACTLY the same function and format as fixed_utils.js
    console.log('\n STEP 3: Generating document ID...');
    // Use the EXACT same createDocumentId implementation to ensure format consistency
    const { documentIdHex, salt } = utils.createDocumentId(allowlistId, config.contractId);
    console.log(`- Document ID (exact format for decryption): ${documentIdHex}`);
    console.log(`- Salt hex: ${salt}`);
    
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
    
    // STEP 7: Update the contract metadata in the database
    console.log('\n STEP 7: Updating contract metadata in database...');
    const databaseUpdated = await updateContractMetadata(config.contractId, {
      blobId,
      allowlistId,
      documentIdHex,
      capId,
      signerAddresses: config.signerAddresses,
      salt // Include salt for reference
    });
    console.log(`- Database updated: ${databaseUpdated}`);
    
    console.log('\n' + '='.repeat(80));
    console.log('ENCRYPT AND UPLOAD COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(80));
    
    return {
      success: true,
      contractId: config.contractId,
      allowlistId,
      capId,
      blobId,
      documentIdHex, // Return the exact document ID format needed for decryption
      salt, // Include salt in response
      fileHash,
      signerAddresses: config.signerAddresses,
      databaseUpdated
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

/**
 * Update the contract metadata in the database
 */
async function updateContractMetadata(contractId, data) {
  console.log(`\n STEP 7: Updating contract metadata in database...`);
  
  try {
    // Get the app URL from environment
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    const apiUrl = `${appUrl}/api/contracts/${contractId}`;
    
    console.log(`- Updating contract metadata via API: ${apiUrl}`);
    
    // First get existing metadata
    let existingMetadata = {};
    try {
      console.log(`- Getting existing contract metadata...`);
      const getResponse = await axios.get(apiUrl);
      
      if (getResponse.status === 200) {
        const existingContract = getResponse.data;
        existingMetadata = existingContract.metadata || {};
        console.log(`- Successfully retrieved existing metadata`);
      }
    } catch (error) {
      console.error(`- Error fetching existing metadata: ${error.message}`);
    }
    
    // Create metadata update - ENSURE exact same format as in local environment
    const metadataUpdate = {
      metadata: {
        ...existingMetadata,
        walrus: {
          storage: {
            blobId: data.blobId,
            uploadedAt: new Date().toISOString(),
            uploadType: 'seal'
          },
          encryption: {
            method: 'seal',
            allowlistId: data.allowlistId,
            documentId: data.documentIdHex, // Critical: Keep EXACT same format
            capId: data.capId,
            salt: data.salt // Store salt for reference
          },
          authorizedWallets: data.signerAddresses || [],
          lastUpdated: new Date().toISOString()
        }
      },
      // Also set database-level fields for direct queries
      walrusBlobId: data.blobId,
      allowlistId: data.allowlistId,
      documentId: data.documentIdHex, // Critical: Keep EXACT same format
      salt: data.salt // Store salt for reference
    };
    
    console.log(`- Sending metadata-only update`);
    const metadataResponse = await axios.patch(
      apiUrl,
      metadataUpdate,
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
    // Check if metadata update was successful
    if (metadataResponse.status === 200) {
      console.log(`- Successfully updated metadata. Now updating specific columns...`);
      
      // Update individual fields
      const fieldUpdates = [];
      
      // Update walrusBlobId separately
      if (data.blobId) {
        try {
          const blobUpdate = { walrusBlobId: data.blobId };
          const blobResponse = await axios.patch(apiUrl, blobUpdate);
          fieldUpdates.push(`walrusBlobId: ${blobResponse.status}`);
        } catch (error) {
          console.error(`- Error updating walrusBlobId field: ${error.message}`);
        }
      }
      
      // Update allowlistId separately
      if (data.allowlistId) {
        try {
          const allowlistUpdate = { allowlistId: data.allowlistId };
          const allowlistResponse = await axios.patch(apiUrl, allowlistUpdate);
          fieldUpdates.push(`allowlistId: ${allowlistResponse.status}`);
        } catch (error) {
          console.error(`- Error updating allowlistId field: ${error.message}`);
        }
      }
      
      // Update documentId separately - CRITICAL: Keep EXACT same format
      if (data.documentIdHex) {
        try {
          const docUpdate = { documentId: data.documentIdHex };
          const docResponse = await axios.patch(apiUrl, docUpdate);
          fieldUpdates.push(`documentId: ${docResponse.status}`);
        } catch (error) {
          console.error(`- Error updating documentId field: ${error.message}`);
        }
      }
      
      // Update salt separately
      if (data.salt) {
        try {
          const saltUpdate = { salt: data.salt };
          const saltResponse = await axios.patch(apiUrl, saltUpdate);
          fieldUpdates.push(`salt: ${saltResponse.status}`);
        } catch (error) {
          console.error(`- Error updating salt field: ${error.message}`);
        }
      }
      
      // Update authorizedUsers separately
      if (data.signerAddresses && data.signerAddresses.length > 0) {
        try {
          const authUpdate = { authorizedUsers: data.signerAddresses };
          const authResponse = await axios.patch(apiUrl, authUpdate);
          fieldUpdates.push(`authorizedUsers: ${authResponse.status}`);
        } catch (error) {
          console.error(`- Error updating authorizedUsers field: ${error.message}`);
        }
      }
      
      console.log(`- Individual field update results: ${fieldUpdates.join(', ')}`);
      return true;
    } else {
      console.error(`- Failed to update contract metadata via API: ${metadataResponse.status}`);
      console.error(`- Error: ${metadataResponse.data}`);
      return false;
    }
    
  } catch (error) {
    console.error(`- Error updating contract metadata: ${error.message}`);
    return false;
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