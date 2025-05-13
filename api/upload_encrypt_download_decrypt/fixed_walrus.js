/**
 * Walrus integration for blob storage using HTTP API directly
 * This version eliminates all filesystem dependencies for serverless compatibility
 */
const axios = require('axios');
const crypto = require('crypto');
const config = require('./fixed_config');

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
  const epochs = options.epochs || config.WALRUS_EPOCHS_TO_STORE || 2;
  const deletable = options.deletable || false;
  
  console.log(`- Content size: ${content.length} bytes`);
  console.log(`- Epochs: ${epochs}`);
  console.log(`- Deletable: ${deletable}`);
  
  // Calculate content hash for verification
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  console.log(`- Content SHA-256 hash: ${hash}`);
  
  // Determine the correct Walrus endpoint based on network
  const network = process.env.NETWORK || config.NETWORK || 'testnet';
  const publisherEndpoint = getPublisherEndpoint(network);
  
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
 * Download a blob from Walrus using direct HTTP API
 * @param {string} blobId - The blob ID to download
 * @returns {Promise<Uint8Array>} - The downloaded content
 */
async function downloadFromWalrusDirectly(blobId) {
  console.log('\n=== STARTING DIRECT HTTP DOWNLOAD ===');
  console.log(`- Blob ID: ${blobId}`);
  
  // Determine the correct Walrus endpoint based on network
  const network = process.env.NETWORK || config.NETWORK || 'testnet';
  const aggregatorEndpoint = getAggregatorEndpoint(network);
  
  const downloadUrl = `${aggregatorEndpoint}/v1/blobs/${blobId}`;
  console.log(`- Target URL: ${downloadUrl}`);
  
  try {
    console.log(`- Starting HTTP GET request to ${downloadUrl}`);
    
    const startTime = Date.now();
    const response = await axios.get(downloadUrl, { 
      responseType: 'arraybuffer'
    });
    
    const requestDuration = (Date.now() - startTime) / 1000;
    console.log(`- GET request completed in ${requestDuration.toFixed(2)} seconds`);
    console.log(`- Response status: ${response.status}`);
    
    if (response.status !== 200) {
      throw new Error(`Download failed with status: ${response.status}`);
    }
    
    const contentLength = response.data.byteLength;
    console.log(`- Downloaded content size: ${contentLength} bytes`);
    console.log(`- Download speed: ${((contentLength / 1024 / 1024) / requestDuration).toFixed(2)} MB/s`);
    
    // Convert ArrayBuffer to Uint8Array
    const content = new Uint8Array(response.data);
    
    // Calculate content hash for verification
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    console.log(`- Content SHA-256 hash: ${hash}`);
    
    console.log(`- SUCCESS! Document downloaded with size: ${content.length} bytes`);
    console.log('=== DIRECT HTTP DOWNLOAD COMPLETED ===\n');
    
    return content;
  } catch (error) {
    console.error(`- ERROR DURING DOWNLOAD: ${error.message}`);
    if (error.response) {
      console.error(`- Response status: ${error.response.status}`);
    }
    console.error('=== DIRECT HTTP DOWNLOAD FAILED ===\n');
    throw error;
  }
}

/**
 * Check if a blob exists in Walrus using direct HTTP API
 * @param {string} blobId - The blob ID to check
 * @returns {Promise<{exists: boolean, metadata?: Object}>} - Result with exists flag and metadata if found
 */
async function checkBlobExistsDirectly(blobId) {
  console.log(`\n=== CHECKING BLOB EXISTENCE ===`);
  console.log(`- Blob ID: ${blobId}`);
  
  // Determine the correct Walrus endpoint based on network
  const network = process.env.NETWORK || config.NETWORK || 'testnet';
  const aggregatorEndpoint = getAggregatorEndpoint(network);
  
  const metadataUrl = `${aggregatorEndpoint}/v1/blobs/${blobId}/metadata`;
  console.log(`- Target URL: ${metadataUrl}`);
  
  try {
    console.log(`- Starting HTTP GET request to ${metadataUrl}`);
    
    const response = await axios.get(metadataUrl, { 
      validateStatus: status => status < 500 // Accept 404 as valid response
    });
    
    if (response.status === 404) {
      console.log(` Blob does not exist in Walrus`);
      return { exists: false };
    }
    
    if (response.status !== 200) {
      throw new Error(`Metadata request failed with status: ${response.status}`);
    }
    
    console.log(` Blob exists in Walrus`);
    return { 
      exists: true,
      metadata: response.data
    };
  } catch (error) {
    console.error(` Failed to check blob existence: ${error.message}`);
    return { exists: false, error: error.message };
  }
}

/**
 * Get the appropriate publisher endpoint based on network
 * @param {string} network - 'mainnet' or 'testnet'
 * @returns {string} The publisher endpoint
 */
function getPublisherEndpoint(network) {
  if (network === 'mainnet') {
    return 'https://publisher.walrus-mainnet.walrus.space';
  } else {
    // Use most reliable testnet endpoints
    return 'https://publisher.walrus-testnet.walrus.space';
  }
}

/**
 * Get the appropriate aggregator endpoint based on network
 * @param {string} network - 'mainnet' or 'testnet'
 * @returns {string} The aggregator endpoint
 */
function getAggregatorEndpoint(network) {
  if (network === 'mainnet') {
    return 'https://aggregator.walrus-mainnet.walrus.space';
  } else {
    // Use most reliable testnet endpoints
    return 'https://aggregator.walrus-testnet.walrus.space';
  }
}

/**
 * Upload encrypted data to Walrus
 * @param {Uint8Array|Buffer} encryptedBytes - The encrypted data to upload
 * @returns {Promise<{blobId: string}>} - Object containing the blob ID
 */
async function uploadToWalrus(encryptedBytes) {
  console.log(`\n STEP 5: Uploading to Walrus...`);
  
  try {
    // Use direct HTTP upload
    const blobId = await uploadToWalrusDirectly(encryptedBytes, {
      epochs: config.WALRUS_EPOCHS_TO_STORE || 2,
      deletable: false
    });
    
    console.log(`- Uploaded to Walrus: ${blobId}`);
    return { blobId };
  } catch (error) {
    console.error(`- Error uploading to Walrus: ${error.message}`);
    throw error;
  }
}

/**
 * Download a blob from Walrus
 * @param {string} blobId - The blob ID to download
 * @returns {Promise<Uint8Array>} - The downloaded content as Uint8Array
 */
async function downloadFromWalrus(blobId) {
  console.log('\nSTEP 6: Downloading blob from Walrus...');
  console.log(`- Blob ID: ${blobId}`);
  
  try {
    const content = await downloadFromWalrusDirectly(blobId);
    console.log(` Download successful! Data size: ${content.length} bytes`);
    return content;
  } catch (error) {
    console.error(` Failed to download from Walrus: ${error.message}`);
    throw error;
  }
}

/**
 * Check if a blob exists in Walrus
 * @param {string} blobId - The blob ID to check
 * @returns {Promise<{exists: boolean, metadata?: Object}>} - Result with exists flag and metadata if found
 */
async function checkBlobExists(blobId) {
  return checkBlobExistsDirectly(blobId);
}

module.exports = {
  uploadToWalrus,
  uploadToWalrusDirectly,
  downloadFromWalrus,
  downloadFromWalrusDirectly,
  checkBlobExists,
  checkBlobExistsDirectly
};