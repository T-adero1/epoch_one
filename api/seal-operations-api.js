
const axios = require('axios');



// Import the actual seal_operations.js module
const sealOperations = require('./upload_encrypt_download_decrypt/seal_operations');

/**
 * API wrapper for the SEAL operations
 * This simply forwards requests to the original seal_operations.js module
 * to ensure consistent behavior between local and production environments
 */
async function encryptAndUpload(config) {
  console.log('[SEAL API Wrapper] Forwarding request to seal_operations.js module');
  
  try {
    // Call the original implementation directly
    const result = await sealOperations.encryptAndUpload(config);
    
    // If successful, update the contract metadata in the database
    if (result.success) {
      console.log('[SEAL API Wrapper] Encryption successful, updating contract metadata');
      
      const databaseUpdated = await updateContractMetadata(config.contractId, {
        blobId: result.blobId,
        allowlistId: result.allowlistId,
        documentIdHex: result.documentIdHex,
        capId: result.capId,
        signerAddresses: result.signerAddresses
      });
      
      result.databaseUpdated = databaseUpdated;
    }
    
    return result;
  } catch (error) {
    console.error('[SEAL API Wrapper] Error:', error);
    
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
  console.log(`[SEAL API Wrapper] Updating contract metadata for ${contractId}`);
  
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
    
    // Create metadata update - IDENTICAL format to the one used in Python code
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
            documentId: data.documentIdHex,
            capId: data.capId
          },
          authorizedWallets: data.signerAddresses || [],
          lastUpdated: new Date().toISOString()
        }
      },
      // Also set database-level fields for direct queries
      walrusBlobId: data.blobId,
      allowlistId: data.allowlistId,
      documentId: data.documentIdHex
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
      
      // Update documentId separately
      if (data.documentIdHex) {
        try {
          const docUpdate = { documentId: data.documentIdHex };
          const docResponse = await axios.patch(apiUrl, docUpdate);
          fieldUpdates.push(`documentId: ${docResponse.status}`);
        } catch (error) {
          console.error(`- Error updating documentId field: ${error.message}`);
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