/**
 * Walrus integration for blob storage using Python script
 * This version uses the Python walrus_sdk_manager.py script directly
 */
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const config = require('./fixed_config');
const { ensureDirectoryExists } = require('./fixed_utils');

// Path to the Python script
const PYTHON_SCRIPT_PATH = path.join(__dirname, '..', '..', 'walrus_sdk_manager.py');

// Upload a blob to Walrus using Python script
async function uploadToWalrus(data, epochs = config.WALRUS_EPOCHS_TO_STORE) {
  console.log('\n☁️ STEP 5: Uploading encrypted blob to Walrus via Python script...');
  console.log(`- Data size: ${data.length} bytes`);
  console.log(`- Epochs to store: ${epochs}`);
  console.log(`- Network: ${config.NETWORK}`);
  
  try {
    // Create a temporary file for the encrypted data
    const tempFilePath = path.join(config.TEMP_DIR, `upload-temp-${Date.now()}.bin`);
    console.log(`- Saving data to temporary file: ${tempFilePath}`);
    ensureDirectoryExists(config.TEMP_DIR);
    fs.writeFileSync(tempFilePath, Buffer.from(data));
    
    // Build Python command
    const pythonCmd = `python "${PYTHON_SCRIPT_PATH}" --context ${config.NETWORK.toLowerCase()} upload "${tempFilePath}" --epochs ${epochs}`;
    console.log(`- Executing Python command: ${pythonCmd}`);
    
    // Execute the Python script
    const startTime = Date.now();
    const { stdout, stderr } = await execAsync(pythonCmd);
    const endTime = Date.now();
    const uploadTime = (endTime - startTime) / 1000;
    
    // Check for errors
    if (stderr && !stderr.includes('Blob ID:')) {
      console.error(`- Python script error: ${stderr}`);
      throw new Error(`Python script error: ${stderr}`);
    }
    
    console.log(`- Upload time: ${uploadTime.toFixed(2)} seconds`);
    console.log(`- Upload speed: ${((data.length / 1024 / 1024) / (uploadTime)).toFixed(2)} MB/s`);
    console.log(`- Python script output: ${stdout}`);
    
    // Extract blob ID from output - FIXED: Better regex to capture the full ID
    const blobIdLine = stdout.split('\n').find(line => line.includes('Blob ID:'));
    if (!blobIdLine) {
      throw new Error('Could not find Blob ID in Python script output');
    }
    
    // Extract the ID from the line "Blob ID: [ID]"
    const blobId = blobIdLine.split('Blob ID:')[1].trim();
    if (!blobId) {
      throw new Error('Could not extract blob ID from Python script output');
    }
    
    console.log(`✅ Upload successful! Blob ID: ${blobId}`);
    console.log('- IMPORTANT: This blob ID is needed for blockchain registration (STEP 7)');
    
    // Clean up temporary file
    try {
      fs.unlinkSync(tempFilePath);
      console.log(`- Cleaned up temporary file: ${tempFilePath}`);
    } catch (cleanupError) {
      console.log(`- Warning: Could not delete temporary file: ${cleanupError.message}`);
    }
    
    return {
      blobId,
      uploadTime
    };
  } catch (error) {
    console.error(`❌ Failed to upload to Walrus: ${error.message}`);
    console.error(error.stack);
    throw error;
  }
}

// Download a blob from Walrus using Python script
async function downloadFromWalrus(blobId, outputPath = null) {
  console.log('\n📥 STEP 6: Downloading blob from Walrus via Python script...');
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
    const pythonCmd = `python "${PYTHON_SCRIPT_PATH}" --context ${config.NETWORK.toLowerCase()} download ${blobId} "${outputPath}"`;
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
    console.log(`✅ Download successful! Data size: ${fileData.length} bytes`);
    
    return new Uint8Array(fileData);
  } catch (error) {
    console.error(`❌ Failed to download from Walrus: ${error.message}`);
    console.error(error.stack);
    throw error;
  }
}

// Check if a blob exists in Walrus using Python script
async function checkBlobExists(blobId) {
  console.log(`\n🔍 Checking if blob exists in Walrus via Python script...`);
  console.log(`- Blob ID: ${blobId}`);
  console.log(`- Network: ${config.NETWORK}`);
  
  try {
    // Build Python command
    const pythonCmd = `python "${PYTHON_SCRIPT_PATH}" --context ${config.NETWORK.toLowerCase()} metadata ${blobId}`;
    console.log(`- Executing Python command: ${pythonCmd}`);
    
    // Execute the Python script
    const { stdout, stderr } = await execAsync(pythonCmd);
    
    // Check for errors indicating not found
    if (stderr && stderr.includes('No metadata found')) {
      console.log(`❌ Blob does not exist in Walrus`);
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
      console.log(`✅ Blob exists in Walrus`);
    } else {
      console.log(`❌ Blob does not exist in Walrus`);
    }
    
    return { exists };
  } catch (error) {
    // If the command fails completely, assume blob doesn't exist
    console.error(`❌ Failed to check blob existence: ${error.message}`);
    return { exists: false, error: error.message };
  }
}

module.exports = {
  uploadToWalrus,
  downloadFromWalrus,
  checkBlobExists
};