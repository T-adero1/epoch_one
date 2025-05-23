// Import required modules
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const crypto = require('crypto');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const axios = require('axios');

// Convert exec to promise-based
const execAsync = promisify(exec);

// Near the beginning of the file add:
const ENHANCED_LOGGING = process.env.ENHANCED_LOGGING === 'true' || false;

// Add this function early in the file
function extractSaltFromDocumentId(documentId, allowlistId) {
  // Remove 0x prefix from allowlist ID if present
  const cleanAllowlistId = allowlistId?.startsWith('0x') ? allowlistId.substring(2) : allowlistId;
  
  // If documentId starts with the allowlistId (without 0x), extract the salt
  if (documentId && cleanAllowlistId && documentId.startsWith(cleanAllowlistId)) {
    return documentId.substring(cleanAllowlistId.length);
  }
  
  console.log(`[SEAL-API] WARNING: Could not extract salt from documentId: ${documentId}`);
  return '';
}

// Add this helper function
function safeConsoleLog(message, prefix = "") {
  try {
    console.log(`${prefix}${message}`);
  } catch (error) {
    // If it fails, try a safer approach
    console.log(`${prefix}[Content contains characters that cannot be displayed properly]`);
    console.log(`${prefix}[Content length: ${message.length} characters]`);
  }
}

/**
 * Main handler for SEAL API operations
 * This implementation matches the Python encrypt_and_upload.py approach
 * by running seal_operations.js as a subprocess and parsing the output
 */
module.exports = async (req, res) => {

  
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
      
      // Pre-encrypted flags
      preEncrypted: config.preEncrypted,
      documentIdHex: config.documentIdHex,
      documentSalt: config.documentSalt,
      allowlistId: config.allowlistId,
      
      // CRITICAL: Move these to the top level of the object
      skipAllowlistCreation: config.preEncrypted && config.allowlistId ? true : false,
      skipDocumentIdGeneration: config.preEncrypted && config.documentIdHex ? true : false,
      useExistingAllowlist: config.allowlistId || null,
      useExistingDocumentId: config.documentIdHex || null,
      
      // Also include in options but with different property names for compatibility
      options: {
        publicKeys: config.signerAddresses,
        verbose: true,
        skipCreateAllowlist: config.preEncrypted && config.allowlistId ? true : false,
        skipGenerateDocumentId: config.preEncrypted && config.documentIdHex ? true : false,
        existingAllowlistId: config.allowlistId || null,
        existingDocumentId: config.documentIdHex || null
      }
    };
    
    // Add detailed logging about the skip flags
    if (config.preEncrypted) {
      console.log(`[SEAL-API] Document is pre-encrypted by client with ID: ${config.documentIdHex}`);
      if (config.allowlistId) {
        console.log(`[SEAL-API] Using client-provided allowlist ID: ${config.allowlistId}`);
        console.log(`[SEAL-API] CRITICAL: Set multiple skip flags to prevent allowlist creation`);
        console.log(`[SEAL-API] skipAllowlistCreation: ${configObject.skipAllowlistCreation}`);
        console.log(`[SEAL-API] skipDocumentIdGeneration: ${configObject.skipDocumentIdGeneration}`);
        console.log(`[SEAL-API] useExistingAllowlist: ${configObject.useExistingAllowlist}`);
        console.log(`[SEAL-API] useExistingDocumentId: ${configObject.useExistingDocumentId}`);
      } else {
        console.log(`[SEAL-API] WARNING: Pre-encrypted document without allowlist ID - WILL CAUSE ISSUES!`);
      }
    }
    
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
      
      // And then when executing the command:
      const env = {
        ...process.env,
        SEAL_VERBOSE: 'true',
        SEAL_DEBUG: 'true',
        SEAL_LOG_LEVEL: 'debug'
      };

      const command = `node "${scriptPath}" "${configFilePath}"`;
      
      const { stdout, stderr } = await execAsync(command, {
        cwd: scriptDir,
        timeout: 55000,
        env  // Use the environment without NODE_DEBUG
      });
      
      // Log the raw output safely
      console.log("[SEAL-API] Raw stdout from seal_operations.js:");
      console.log("------- BEGIN RAW STDOUT -------");
      safeConsoleLog(stdout.toString('utf8'));
      console.log("------- END RAW STDOUT -------");

      if (stderr && stderr.length > 0) {
        console.log("[SEAL-API] Raw stderr from seal_operations.js:");
        console.log("------- BEGIN RAW STDERR -------");
        safeConsoleLog(stderr.toString('utf8'));
        console.log("------- END RAW STDERR -------");
      }
      
      // Extract input and output sections
      let inputData = null;
      const inputStartMarker = '==== SEAL_OPERATION_INPUT_BEGIN ====';
      const inputEndMarker = '==== SEAL_OPERATION_INPUT_END ====';
      if (stdout.includes(inputStartMarker) && stdout.includes(inputEndMarker)) {
        const inputStart = stdout.indexOf(inputStartMarker) + inputStartMarker.length;
        const inputEnd = stdout.indexOf(inputEndMarker);
        const inputJson = stdout.substring(inputStart, inputEnd).trim();
        try {
          inputData = JSON.parse(inputJson);
          console.log(`[PROD] SEAL Operation Input:\n${JSON.stringify(inputData, null, 2)}`);
        } catch (e) {
          console.error(`[PROD] Failed to parse input JSON: ${e.message}`);
        }
      }

      let outputData = null;
      const outputStartMarker = '==== SEAL_OPERATION_OUTPUT_BEGIN ====';
      const outputEndMarker = '==== SEAL_OPERATION_OUTPUT_END ====';
      if (stdout.includes(outputStartMarker) && stdout.includes(outputEndMarker)) {
        const outputStart = stdout.indexOf(outputStartMarker) + outputStartMarker.length;
        const outputEnd = stdout.indexOf(outputEndMarker);
        const outputJson = stdout.substring(outputStart, outputEnd).trim();
        try {
          outputData = JSON.parse(outputJson);
          console.log(`[PROD] SEAL Operation Output:\n${JSON.stringify(outputData, null, 2)}`);
        } catch (e) {
          console.error(`[PROD] Failed to parse output JSON: ${e.message}`);
        }
      }
      
      // Extract values from the parsed JSON output data first (PRIORITY)
      let blobId = outputData?.blobId || null;
      let allowlistId = outputData?.allowlistId || null;
      let documentId = outputData?.documentIdHex || outputData?.documentId || null;
      let capId = outputData?.capId || null;
      let salt = outputData?.documentSalt || outputData?.salt || null;

      // Log what we got from JSON
      console.log(`[SEAL-API] From JSON output: blobId=${blobId}, allowlistId=${allowlistId}, documentId=${documentId}`);

      // Only parse lines if JSON data is missing key values
      if (!blobId || !allowlistId) {
        console.log("[SEAL-API] JSON output missing critical data, trying line parsing as fallback");
        
        const outputLines = stdout.split('\n');
        
        for (const line of outputLines) {
          if (line.includes('Blob ID:') && !blobId) {
            blobId = line.split('Blob ID:')[1].trim();
            console.log(`[SEAL-API] Found blob ID in line: ${blobId}`);
          } else if (line.includes('Allowlist ID:') && !allowlistId) {
            allowlistId = line.split('Allowlist ID:')[1].trim();
            console.log(`[SEAL-API] Found allowlist ID in line: ${allowlistId}`);
          } else if ((line.includes('Document ID:') || line.includes('Document ID (hex):')) && !documentId) {
            documentId = line.split(':')[1].trim();
            console.log(`[SEAL-API] Found document ID in line: ${documentId}`);
          } else if ((line.includes('Capability ID:') || line.includes('Cap ID:')) && !capId) {
            capId = line.split(':')[1].trim();
            console.log(`[SEAL-API] Found cap ID in line: ${capId}`);
          } else if (line.includes('Salt (hex):') && !salt) {
            salt = line.split('Salt (hex):')[1].trim();
            console.log(`[SEAL-API] Found salt in line: ${salt}`);
          }
        }
      }

      // Extract salt from documentId if still not found
      if (!salt && documentId && allowlistId) {
        const cleanAllowlistId = allowlistId?.startsWith('0x') ? allowlistId.substring(2) : allowlistId;
        if (documentId.startsWith(cleanAllowlistId)) {
          salt = documentId.substring(cleanAllowlistId.length);
          console.log(`[SEAL-API] Extracted salt from document ID: ${salt}`);
        }
      }

      console.log(`[SEAL-API] Final extracted values:`);
      console.log(`[SEAL-API] - Blob ID: ${blobId}`);
      console.log(`[SEAL-API] - Allowlist ID: ${allowlistId}`);
      console.log(`[SEAL-API] - Document ID: ${documentId}`);
      console.log(`[SEAL-API] - Cap ID: ${capId}`);
      console.log(`[SEAL-API] - Salt: ${salt}`);
      
      // Create response with all found values - IDENTICAL to Python script
      const responseData = {
        success: true,
        contractId: config.contractId,
        encrypted: true,
        blobId,
        allowlistId,
        documentId,
        capId,
        salt,  // Include salt for document ID reconstruction
        raw_success: true,
        message: 'SEAL encryption succeeded',
        logs: {
          stdout: stdout.substring(0, 2000) + (stdout.length > 2000 ? '...(truncated)' : ''),
          stderr: stderr.substring(0, 2000) + (stderr.length > 2000 ? '...(truncated)' : '')
        }
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
        blobId,
        allowlistId,
        documentId,
        capId,
        salt,  // Include salt here too for document ID reconstruction
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
        
        // Create combined update with metadata and individual fields
        const combinedUpdate = {
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
                salt: walrusData.salt
              },
              authorizedWallets: walrusData.authorizedWallets || [],
              lastUpdated: new Date().toISOString()
            }
          },
          // Set content to null to remove it from the database
          content: null
        };

        // Add individual field updates to the same request
        if (blobId) {
          combinedUpdate.walrusBlobId = blobId;
        }
        if (allowlistId) {
          combinedUpdate.allowlistId = allowlistId;
        }
        if (documentId) {
          combinedUpdate.documentId = documentId;
        }
        if (config.signerAddresses && config.signerAddresses.length > 0) {
          combinedUpdate.authorizedUsers = config.signerAddresses;
        }
        
        console.log(`Sending combined update: ${JSON.stringify(combinedUpdate, null, 2)}`);
        const updateResponse = await axios.patch(
          apiUrl,
          combinedUpdate,
          {
            headers: { 'Content-Type': 'application/json' }
          }
        );
        
        if (updateResponse.status === 200) {
          console.log(`Successfully updated contract data`);
          responseData.databaseUpdated = true;
        } else {
          console.error(`Failed to update contract data via API: ${updateResponse.status}`);
          console.error(`Error: ${JSON.stringify(updateResponse.data)}`);
        }
        
      } catch (dbError) {
        console.error(`Error updating database:`, dbError);
      }
      
      console.log(`Returning SEAL response with all data`);
      console.log(`RESPONSE_JSON_BEGIN`);
      console.log(JSON.stringify(responseData));
      console.log(`RESPONSE_JSON_END`);
      console.log(`Upload completed successfully`);
      
      // Ensure we have the document ID and related information correctly extracted
      if (responseData.success || responseData.documentId) {
        // Extract salt if not already present
        if (!responseData.salt && responseData.documentId && responseData.allowlistId) {
          responseData.salt = extractSaltFromDocumentId(responseData.documentId, responseData.allowlistId);
          console.log(`[SEAL-API] Extracted salt from document ID: ${responseData.salt}`);
        }
        
        // Make sure document ID is complete (should include allowlistId without 0x prefix + salt)
        const cleanAllowlistId = responseData.allowlistId?.startsWith('0x') 
          ? responseData.allowlistId.substring(2) 
          : responseData.allowlistId;
          
        // Validate document ID format
        if (responseData.documentId && cleanAllowlistId && responseData.salt) {
          const expectedDocId = `${cleanAllowlistId}${responseData.salt}`;
          if (responseData.documentId !== expectedDocId) {
            console.log(`[SEAL-API] WARNING: Document ID format mismatch. Got: ${responseData.documentId}, Expected: ${expectedDocId}`);
            // Correct the document ID
            responseData.documentId = expectedDocId;
            console.log(`[SEAL-API] Corrected document ID to: ${responseData.documentId}`);
          }
        }
      }
      
      // Ensure the walrusData includes the salt
      if (responseData.walrusData && responseData.salt) {
        responseData.walrusData.salt = responseData.salt;
        
        // Also ensure it's in the encryption section if it exists
        if (responseData.walrusData.encryption) {
          responseData.walrusData.encryption.salt = responseData.salt;
        }
      }
      
      res.status(200).json(responseData);
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