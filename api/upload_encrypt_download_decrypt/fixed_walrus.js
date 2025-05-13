/**
 * Walrus integration for blob storage using Python script
 * This version uses the Python walrus_sdk_manager.py script directly
 */
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const config = require('./fixed_config');
const { ensureDirectoryExists } = require('./fixed_utils');
const crypto = require('crypto');

// Path to the Python script
const PYTHON_SCRIPT_PATH = path.join(__dirname, '..', 'walrus_sdk_manager.py');

/**
 * Upload a blob to Walrus storage using direct HTTP API
 * @param {Uint8Array|Buffer} content - The binary content to upload
 * @param {Object} options - Upload options
 * @param {number} options.epochs - Number of epochs to store (default: 2)
 * @param {boolean} options.deletable - Whether the blob is deletable
 * @returns {Promise<string>} - The blob ID
 */
async function uploadToWalrusDirectly(content, options = {}) {
  console.log('\n=== STARTING DIRECT HTTP UPLOAD ===');
  const epochs = options.epochs || 2;
  const deletable = options.deletable || false;
  
  console.log(`- Content size: ${content.length} bytes`);
  console.log(`- Epochs: ${epochs}`);
  console.log(`- Deletable: ${deletable}`);
  
  // Calculate content hash for verification
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  console.log(`- Content SHA-256 hash: ${hash}`);
  
  // Determine the correct Walrus endpoint based on network
  const network = process.env.NETWORK || 'testnet';
  const publisherUrl = network === 'mainnet' 
    ? 'https://publisher.walrus-mainnet.walrus.space' 
    : 'https://walrus-testnet-publisher.trusted-point.com';
  
  const uploadUrl = `${publisherUrl}/blob`;
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
    
    console.log(`- Starting HTTP POST request to ${uploadUrl}`);
    
    const startTime = Date.now();
    const response = await axios.post(uploadUrl, content, { 
      params,
      headers,
      // Important: Disable automatic JSON parsing since the content is binary
      responseType: 'json'
    });
    
    const requestDuration = (Date.now() - startTime) / 1000;
    console.log(`- POST request completed in ${requestDuration.toFixed(2)} seconds`);
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
      console.error(`- Response data: ${JSON.stringify(error.response.data)}`);
      console.error(`- Response status: ${error.response.status}`);
    }
    console.error('=== DIRECT HTTP UPLOAD FAILED ===\n');
    throw error;
  }
}

/**
 * Upload encrypted data to Walrus
 * This function replaces the Python subprocess call
 */
async function uploadToWalrus(encryptedBytes) {
  console.log(`\n STEP 5: Uploading to Walrus...`);
  
  try {
    // Use direct HTTP upload instead of calling Python
    const blobId = await uploadToWalrusDirectly(encryptedBytes, {
      epochs: 2,  // Default to 2 epochs
      deletable: false  // Default to non-deletable
    });
    
    console.log(`- Uploaded to Walrus: ${blobId}`);
    return { blobId };
  } catch (error) {
    console.error(`- Error uploading to Walrus: ${error.message}`);
    throw error;
  }
}

// Download a blob from Walrus using Python script
async function downloadFromWalrus(blobId, outputPath = null) {
  console.log('\nSTEP 6: Downloading blob from Walrus via Python script...');
  console.log(`- Blob ID: ${blobId}`);
  console.log(`- Output path: ${outputPath || 'none (will use default from Python script)'}`);
  console.log(`- Network: ${config.NETWORK}`);
  
  try {
    // If no output path is provided, create one
    if (!outputPath) {
      outputPath = path.join(config.TEMP_DIR, `download-${blobId}-${Date.now()}.bin`);
      ensureDirectoryExists(config.TEMP_DIR);
    }
    
    // Build Python command
    const pythonCmd = `python3 "${PYTHON_SCRIPT_PATH}" --context ${config.NETWORK.toLowerCase()} download ${blobId} "${outputPath}"`;
    console.log(`- Executing Python command: ${pythonCmd}`);
    
    // Execute the Python script
    const startTime = Date.now();
    const { stdout, stderr } = await execAsync(pythonCmd);
    const endTime = Date.now();
    const downloadTime = (endTime - startTime) / 1000;
    
    // Check for errors
    if (stderr && !stderr.includes('Document saved to:')) {
      console.error(`- Python script error: ${stderr}`);
      throw new Error(`Python script error: ${stderr}`);
    }
    
    console.log(`- Download time: ${downloadTime.toFixed(2)} seconds`);
    console.log(`- Python script output: ${stdout}`);
    
    // Check if file was downloaded
    if (!fs.existsSync(outputPath)) {
      // Check if the Python script saved to a different path
      const outputPathMatch = stdout.match(/Document saved to: ([^\n]+)/);
      if (outputPathMatch && outputPathMatch[1]) {
        outputPath = outputPathMatch[1].trim();
        console.log(`- Python script saved file to: ${outputPath}`);
      } else {
        throw new Error(`File not found at ${outputPath} and could not determine alternate path`);
      }
    }
    
    // Get file stats
    const stats = fs.statSync(outputPath);
    console.log(`- Downloaded file size: ${stats.size} bytes`);
    console.log(`- Download speed: ${((stats.size / 1024 / 1024) / (downloadTime)).toFixed(2)} MB/s`);
    
    // Read the file into memory
    const fileData = fs.readFileSync(outputPath);
    console.log(` Download successful! Data size: ${fileData.length} bytes`);
    
    return new Uint8Array(fileData);
  } catch (error) {
    console.error(` Failed to download from Walrus: ${error.message}`);
    console.error(error.stack);
    throw error;
  }
}

// Check if a blob exists in Walrus using Python script
async function checkBlobExists(blobId) {
  console.log(`\n Checking if blob exists in Walrus via Python script...`);
  console.log(`- Blob ID: ${blobId}`);
  console.log(`- Network: ${config.NETWORK}`);
  
  try {
    // Build Python command
    const pythonCmd = `python3 "${PYTHON_SCRIPT_PATH}" --context ${config.NETWORK.toLowerCase()} metadata ${blobId}`;
    console.log(`- Executing Python command: ${pythonCmd}`);
    
    // Execute the Python script
    const { stdout, stderr } = await execAsync(pythonCmd);
    
    // Check for errors indicating not found
    if (stderr && stderr.includes('No metadata found')) {
      console.log(` Blob does not exist in Walrus`);
      return { exists: false };
    }
    
    if (stderr && !stderr.includes('Metadata:')) {
      console.error(`- Python script error: ${stderr}`);
      throw new Error(`Python script error: ${stderr}`);
    }
    
    console.log(`- Python script output: ${stdout}`);
    
    // If we get metadata, the blob exists
    const exists = stdout.includes('Metadata:') || !stdout.includes('No metadata found');
    
    if (exists) {
      console.log(` Blob exists in Walrus`);
    } else {
      console.log(` Blob does not exist in Walrus`);
    }
    
    return { exists };
  } catch (error) {
    // If the command fails completely, assume blob doesn't exist
    console.error(` Failed to check blob existence: ${error.message}`);
    return { exists: false, error: error.message };
  }
}

module.exports = {
  uploadToWalrus,
  uploadToWalrusDirectly,
  downloadFromWalrus,
  checkBlobExists
};