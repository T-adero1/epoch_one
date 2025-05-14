// Import required modules
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');
const axios = require('axios');

// Convert exec to promise-based
const execAsync = promisify(exec);

/**
 * Main handler for SEAL API operations
 * This implementation matches the Python encrypt_and_upload.py approach
 * by running seal_operations.js as a subprocess and parsing the output
 */
module.exports = async (req, res) => {
  console.log('[SEAL API] Request received:', req.method);
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const config = req.body;
    console.log('[SEAL API] Processing request for contract:', config.contractId);
    
    // Validate required fields
    if ((!config.documentContentBase64) || !config.contractId || !config.signerAddresses || !config.adminPrivateKey) {
      return res.status(400).json({ 
        error: 'Missing required configuration',
        details: 'documentContentBase64, contractId, signerAddresses, and adminPrivateKey are required'
      });
    }
    
    console.log('[SEAL API] Request validation passed');
    console.log(`- Contract ID: ${config.contractId}`);
    console.log(`- Document content length: ${config.documentContentBase64.length} chars`);
    console.log(`- Signer addresses: ${config.signerAddresses.length} addresses`);
    
    // Create temporary configuration file - EXACTLY like in encrypt_and_upload.py
    const tempDir = os.tmpdir();
    const configFilePath = path.join(tempDir, `seal-config-${Date.now()}-${Math.random().toString(36).substring(2, 10)}.json`);
    
    // Prepare clean configuration object
    const configObject = {
      operation: "encrypt",
      documentContentBase64: config.documentContentBase64,
      contractId: config.contractId,
      signerAddresses: config.signerAddresses,
      adminPrivateKey: config.adminPrivateKey,
      sealPackageId: config.sealPackageId,
      allowlistPackageId: config.allowlistPackageId || config.sealPackageId,
      network: config.network || 'testnet'
    };
    
    try {
      // Write configuration to temporary file
      await fs.writeFile(configFilePath, JSON.stringify(configObject));
      console.log(`[SEAL API] Created config file: ${configFilePath}`);
      
      // Get path to seal_operations.js script
      const scriptDir = path.resolve(__dirname, 'upload_encrypt_download_decrypt');
      const scriptPath = path.join(scriptDir, 'seal_operations.js');
      console.log(`[SEAL API] Script path: ${scriptPath}`);
      
      // Execute the script directly - EXACTLY like in encrypt_and_upload.py local mode
      console.log(`[SEAL API] Executing Node.js script`);
      const command = `node "${scriptPath}" "${configFilePath}"`;
      
      const { stdout, stderr } = await execAsync(command, {
        cwd: scriptDir,
        timeout: 55000 // 55 second timeout like in Python script
      });
      
      // Process console output - IDENTICAL to Python script approach
      console.log(`[SEAL API] Script executed successfully`);
      
      if (stderr) {
        console.log(`[SEAL API] Script stderr: ${stderr}`);
      }
      
      // Parse the output by searching for specific lines - EXACTLY like in encrypt_and_upload.py
      const outputLines = stdout.split('\n');
      
      // Extract all relevant SEAL information from output
      let blobId = null;
      let allowlistId = null;
      let documentId = null;
      let capId = null;
      
      // Look for all IDs in the output lines - IDENTICAL to Python script
      for (const line of outputLines) {
        if (line.includes('Blob ID:')) {
          blobId = line.split('Blob ID:')[1].trim();
        } else if (line.includes('Allowlist ID:')) {
          allowlistId = line.split('Allowlist ID:')[1].trim();
        } else if (line.includes('Document ID:') || line.includes('Document ID (hex):')) {
          documentId = line.split(':')[1].trim();
        } else if (line.includes('Capability ID:') || line.includes('Cap ID:')) {
          capId = line.split(':')[1].trim();
        }
      }
      
      // Create response with all found values - IDENTICAL to Python script
      const responseData = {
        success: true,
        contractId: config.contractId,
        encrypted: true,
        blobId,
        allowlistId,
        documentId,
        capId,
        raw_success: true,
        message: 'SEAL encryption succeeded'
      };
      
      console.log(`[SEAL API] Document successfully encrypted and uploaded`);
      if (blobId) console.log(`[SEAL API] Blob ID: ${blobId}`);
      if (allowlistId) console.log(`[SEAL API] Allowlist ID: ${allowlistId}`);
      if (documentId) console.log(`[SEAL API] Document ID: ${documentId}`);
      if (capId) console.log(`[SEAL API] Capability ID: ${capId}`);
      
      // Update the contract metadata in the database
      responseData.databaseUpdated = false;
      
      try {
        const databaseUpdated = await updateContractMetadata(config.contractId, {
          blobId,
          allowlistId,
          documentId,
          capId,
          signerAddresses: config.signerAddresses
        });
        
        responseData.databaseUpdated = databaseUpdated;
      } catch (dbError) {
        console.error(`[SEAL API] Error updating database:`, dbError);
      }
      
      return res.status(200).json(responseData);
      
    } finally {
      // Clean up temporary file - SAME as Python cleanup
      try {
        await fs.unlink(configFilePath);
        console.log(`[SEAL API] Deleted temporary config file: ${configFilePath}`);
      } catch (cleanupError) {
        console.warn(`[SEAL API] Error cleaning up temporary file:`, cleanupError);
      }
    }
    
  } catch (error) {
    console.error('[SEAL API] Error processing request:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
};

/**
 * Update the contract metadata in the database
 * Following the same pattern as Python script
 */
async function updateContractMetadata(contractId, data) {
  console.log(`[SEAL API] Updating contract metadata for ${contractId}`);
  
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
            documentId: data.documentId,
            capId: data.capId
          },
          authorizedWallets: data.signerAddresses || [],
          lastUpdated: new Date().toISOString()
        }
      },
      // Also set database-level fields for direct queries
      walrusBlobId: data.blobId,
      allowlistId: data.allowlistId,
      documentId: data.documentId
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
      
      // Update individual fields - IDENTICAL to Python code
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
      if (data.documentId) {
        try {
          const docUpdate = { documentId: data.documentId };
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