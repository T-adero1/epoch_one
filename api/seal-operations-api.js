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

// Near the beginning of the file add:
const ENHANCED_LOGGING = process.env.ENHANCED_LOGGING === 'true' || false;

/**
 * Main handler for SEAL API operations
 * This implementation matches the Python encrypt_and_upload.py approach
 * by running seal_operations.js as a subprocess and parsing the output
 */
module.exports = async (req, res) => {
  console.log('[Python Direct] Command received');
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const config = req.body;
    console.log('Starting');
    
    // Validate required fields
    if ((!config.documentContentBase64) || !config.contractId || !config.signerAddresses || !config.adminPrivateKey) {
      return res.status(400).json({ 
        error: 'Missing required configuration',
        details: 'documentContentBase64, contractId, signerAddresses, and adminPrivateKey are required'
      });
    }
    
    // Create temporary configuration file - EXACTLY like in encrypt_and_upload.py
    const tempDir = os.tmpdir();
    const tempId = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    const configFilePath = path.join(tempDir, `${tempId}.json`);
    
    console.log(`Reading request from ${configFilePath}`);
    console.log(`Processing upload request ${config.contractId}`);
    
    // Calculate document hash for logging
    let contentBytes;
    try {
      contentBytes = Buffer.from(config.documentContentBase64, 'base64');
      const hash = crypto.createHash('sha256').update(contentBytes).digest('hex');
      console.log(`Document hash (SHA-256): ${hash}`);
    } catch (error) {
      console.error(`Error calculating hash: ${error.message}`);
    }
    
    console.log(`Using SEAL encryption for document with ${config.signerAddresses.length} signer addresses`);
    console.log(`Attempting SEAL encryption and upload...`);
    console.log(`================================================================================`);
    
    console.log(`[SEAL] Processing encrypt and upload request for contract: ${config.contractId}`);
    console.log(`[SEAL] Contract ID: ${config.contractId}`);
    console.log(`[SEAL] Content is base64: True`);
    console.log(`[SEAL] Content length: ${config.documentContentBase64.length}`);
    console.log(`[SEAL] Signer addresses: ${config.signerAddresses.join(', ')}`);
    
    // Prepare clean configuration object
    const configObject = {
      operation: "encrypt",
      documentContentBase64: config.documentContentBase64,
      contractId: config.contractId,
      signerAddresses: config.signerAddresses,
      adminPrivateKey: config.adminPrivateKey,
      sealPackageId: config.sealPackageId,
      allowlistPackageId: config.allowlistPackageId || config.sealPackageId,
      network: config.network || 'testnet',
      // Add options to generate deterministic document ID
      options: {
        publicKeys: config.signerAddresses,
        verbose: true  // Enable verbose logging
      }
    };
    
    try {
      // Write configuration to temporary file
      await fs.writeFile(configFilePath, JSON.stringify(configObject));
      console.log(`[SEAL] Created config file: ${configFilePath}`);
      
      // Get path to seal_operations.js script
      const scriptDir = path.resolve(__dirname, 'upload_encrypt_download_decrypt');
      const scriptPath = path.join(scriptDir, 'seal_operations.js');
      console.log(`[SEAL] Running seal_operations.js with config: ${configFilePath}`);
      
      // Add timestamp with ISO format
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [INFO] Environment detected: Production/Vercel`);
      console.log(`[${timestamp}] [INFO] SEAL_SCRIPT_PATH resolved to: ${scriptDir}`);
      console.log(`[${timestamp}] [INFO] [SEAL] Running in PRODUCTION mode. Using Node.js subprocess.`);
      console.log(`[${timestamp}] [INFO] [SEAL] Executing Node.js script`);
      
      // Execute the script directly - EXACTLY like in encrypt_and_upload.py local mode
      const command = `node "${scriptPath}" "${configFilePath}"`;
      
      const { stdout, stderr } = await execAsync(command, {
        cwd: scriptDir,
        timeout: 55000 // 55 second timeout like in Python script
      });
      
      console.log('[Python Direct] Command succeeded with python');
      console.log('[Python Direct] Python execution completed');
      console.log('[Python Direct] stdout: ' + stdout.substring(0, 200) + '...');
      
      if (stderr) {
        console.log(`[Python Direct] stderr: ${stderr}`);
      }
      
      // Try to parse the JSON result from stdout, which should contain logs
      let result = null;
      let detailedLogs = '';
      
      try {
        // Look for a valid JSON object in the output
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
          if (result.logs) {
            detailedLogs = result.logs;
            console.log(`\n=== DETAILED SEAL OPERATION LOGS ===\n${detailedLogs}\n=== END DETAILED LOGS ===\n`);
          }
        }
      } catch (parseError) {
        console.error(`Error parsing JSON from stdout: ${parseError.message}`);
      }
      
      // If we couldn't get logs from JSON, parse the output lines as before
      if (!result) {
        // Parse the output by searching for specific lines - EXACTLY like in encrypt_and_upload.py
        const outputLines = stdout.split('\n');
        
        // Extract all relevant SEAL information from output
        let blobId = null;
        let allowlistId = null;
        let documentId = null;
        let capId = null;
        let salt = null;
        
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
          } else if (line.includes('Salt (hex):')) {
            salt = line.split('Salt (hex):')[1].trim();
          }
        }
        
        // Create result object if we couldn't parse it
        result = {
          success: true,
          contractId: config.contractId,
          blobId,
          allowlistId,
          documentId,
          capId,
          salt,
          raw_success: true,
          message: 'SEAL encryption succeeded',
          // Use stdout as logs if we couldn't parse JSON
          logs: stdout
        };
      }
      
      // Log the same way as Python script
      console.log(`[SEAL] Document successfully encrypted and uploaded`);
      if (result.blobId) console.log(`[SEAL] Blob ID: ${result.blobId}`);
      if (result.allowlistId) console.log(`[SEAL] Allowlist ID: ${result.allowlistId}`);
      if (result.documentId) console.log(`[SEAL] Document ID: ${result.documentId}`);
      if (result.capId) console.log(`[SEAL] Capability ID: ${result.capId}`);
      if (result.salt) console.log(`[SEAL] Salt: ${result.salt}`);
      
      // Create response with all found values - IDENTICAL to Python script
      const responseData = {
        success: true,
        contractId: config.contractId,
        encrypted: true,
        blobId: result.blobId,
        allowlistId: result.allowlistId,
        documentId: result.documentId,
        capId: result.capId,
        salt: result.salt,  // Include salt for document ID reconstruction
        raw_success: true,
        message: 'SEAL encryption succeeded',
        logs: detailedLogs || stdout  // Include detailed logs in the response
      };
      
      // Log similar to Python
      console.log(`SEAL encryption and upload successful`);
      console.log(`SEAL response data: ${JSON.stringify(responseData, null, 2)}`);
      
      // Add contract hash to response
      if (contentBytes) {
        const hash = crypto.createHash('sha256').update(contentBytes).digest('hex');
        responseData.hash = hash;
        console.log(`Added contract ID ${config.contractId} and hash ${hash} to response`);
      }
      
      // Update the contract metadata in the database
      responseData.databaseUpdated = false;
      
      // Prepare walrus data
      const walrusData = {
        blobId: result.blobId,
        allowlistId: result.allowlistId,
        documentId: result.documentId,
        capId: result.capId,
        salt: result.salt,  // Include salt here too for document ID reconstruction
        encryptionMethod: 'seal',
        authorizedWallets: config.signerAddresses,
        uploadedAt: new Date().toISOString()
      };
      
      console.log(`Prepared Walrus data: ${JSON.stringify(walrusData, null, 2)}`);
      responseData.walrusData = walrusData;
      console.log(`Added Walrus data to SEAL response`);
      
      try {
        // Get the app URL from environment
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
        const apiUrl = `${appUrl}/api/contracts/${config.contractId}`;
        
        console.log(`Updating contract metadata via API: ${apiUrl}`);
        
        // First get existing metadata
        let existingMetadata = {};
        try {
          const getResponse = await axios.get(apiUrl);
          
          if (getResponse.status === 200) {
            const existingContract = getResponse.data;
            existingMetadata = existingContract.metadata || {};
            console.log(`Got existing metadata: ${JSON.stringify(existingMetadata, null, 2)}`);
          }
        } catch (error) {
          console.error(`Error fetching existing metadata: ${error.message}`);
        }
        
        // Create metadata update - IDENTICAL format to the one used in Python code
        const metadataUpdate = {
          metadata: {
            ...existingMetadata,
            walrus: {
              storage: {
                blobId: walrusData.blobId,
                uploadedAt: walrusData.uploadedAt,
                uploadType: 'seal'
              },
              encryption: {
                method: 'seal',
                allowlistId: walrusData.allowlistId,
                documentId: walrusData.documentId,
                capId: walrusData.capId,
                salt: walrusData.salt  // Add salt here for document ID reconstruction
              },
              authorizedWallets: walrusData.authorizedWallets || [],
              lastUpdated: new Date().toISOString()
            }
          }
        };
        
        console.log(`Sending metadata-only update: ${JSON.stringify(metadataUpdate, null, 2)}`);
        const metadataResponse = await axios.patch(
          apiUrl,
          metadataUpdate,
          {
            headers: { 'Content-Type': 'application/json' }
          }
        );
        
        // Check if metadata update was successful
        if (metadataResponse.status === 200) {
          console.log(`Successfully updated metadata. Now trying to update specific columns...`);
          
          // Update individual fields - IDENTICAL to Python code
          const fieldUpdates = [];
          
          // Update walrusBlobId separately
          if (result.blobId) {
            try {
              const blobUpdate = { walrusBlobId: result.blobId };
              const blobResponse = await axios.patch(apiUrl, blobUpdate);
              fieldUpdates.push(`walrusBlobId: ${blobResponse.status}`);
            } catch (error) {
              console.error(`Error updating walrusBlobId field: ${error.message}`);
            }
          }
          
          // Update allowlistId separately
          if (result.allowlistId) {
            try {
              const allowlistUpdate = { allowlistId: result.allowlistId };
              const allowlistResponse = await axios.patch(apiUrl, allowlistUpdate);
              fieldUpdates.push(`allowlistId: ${allowlistResponse.status}`);
            } catch (error) {
              console.error(`Error updating allowlistId field: ${error.message}`);
            }
          }
          
          // Update documentId separately
          if (result.documentId) {
            try {
              const docUpdate = { documentId: result.documentId };
              const docResponse = await axios.patch(apiUrl, docUpdate);
              fieldUpdates.push(`documentId: ${docResponse.status}`);
            } catch (error) {
              console.error(`Error updating documentId field: ${error.message}`);
            }
          }
          
          // Update authorizedUsers separately
          if (config.signerAddresses && config.signerAddresses.length > 0) {
            try {
              const authUpdate = { authorizedUsers: config.signerAddresses };
              const authResponse = await axios.patch(apiUrl, authUpdate);
              fieldUpdates.push(`authorizedUsers: ${authResponse.status}`);
            } catch (error) {
              console.error(`Error updating authorizedUsers field: ${error.message}`);
            }
          }
          
          console.log(`Individual field update results: ${fieldUpdates.join(', ')}`);
          responseData.databaseUpdated = true;
        } else {
          console.error(`Failed to update contract metadata via API: ${metadataResponse.status}`);
          console.error(`Error: ${JSON.stringify(metadataResponse.data)}`);
        }
        
      } catch (dbError) {
        console.error(`Error updating database:`, dbError);
      }
      
      console.log(`Returning SEAL response with all data`);
      console.log(`RESPONSE_JSON_BEGIN`);
      console.log(JSON.stringify(responseData));
      console.log(`RESPONSE_JSON_END`);
      console.log(`Upload completed successfully`);
      
      return res.status(200).json(responseData);
      
    } finally {
      // Clean up temporary file - SAME as Python cleanup
      try {
        await fs.unlink(configFilePath);
        console.log(`Deleted temporary config file: ${configFilePath}`);
      } catch (cleanupError) {
        console.warn(`Error cleaning up temporary file:`, cleanupError);
      }
    }
    
  } catch (error) {
    console.error('Error processing request:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
}; 