/**
 * Utility functions for SEAL backend
 * Enhanced version with clearer logging and improved document ID generation
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SuiClient } = require('@mysten/sui/client');

const { fromHEX, toHex } = require('@mysten/sui/utils');

const config = require('./fixed_config');

const { suiPrivkeyToKeypair } = require('./sui_key_utils');
const { getFullnodeUrl } = require('@mysten/sui/client');

// Initialize SUI client
async function initSuiClient() {
  console.log('\n Initializing Sui client...');
  const client = new SuiClient({ url: getFullnodeUrl('testnet') });
  
  // Validate the client is working
  try {
    const chainId = await client.getChainIdentifier();
    console.log(` Connected to Sui ${config.NETWORK} with chain ID: ${chainId}`);
    return client;
  } catch (error) {
    console.error(' Failed to connect to Sui network:', error);
    console.error(error.stack);
    throw new Error('Failed to initialize Sui client');
  }
}

// Convert a private key (various formats) to a Sui keypair
function privateKeyToKeypair(privateKey) {
  console.log('\n Converting private key to Sui keypair...');
  console.log('- This converts various private key formats to a Sui-compatible keypair');
  const keypair = suiPrivkeyToKeypair(privateKey);
  console.log(' Successfully converted private key to Sui keypair');
  return keypair;
}

// Create a document ID by combining a document group ID (allowlist ID) with a random or deterministic nonce
function createDocumentId(allowlistId, contractId, options = {}) {
  console.log('\n STEP 3: Generating document ID from allowlist ID...');
  console.log(`- Allowlist ID: ${allowlistId}`);
  console.log('- Document ID = allowlist ID prefix + salt');
  console.log('- This ID is critical for security - MUST be created BEFORE encryption');
  
  try {
    // Convert allowlist ID to bytes
    const allowlistBytes = fromHEX(allowlistId);
    console.log(`- Allowlist bytes length: ${allowlistBytes.length}`);
    
    let nonce;
    
    // Check if we should generate a deterministic salt
    if (options.publicKeys && options.publicKeys.length > 0) {
      nonce = generateDeterministicSalt(contractId, options.publicKeys);
      console.log('- Using deterministic salt generation with public keys');
    } else {
      // Create a random nonce (5 bytes)
      nonce = crypto.randomBytes(5);
      console.log(`- Generated random nonce: ${Buffer.from(nonce).toString('hex')}`);
    }
    
    console.log(`- Nonce/salt length: ${nonce.length} bytes`);
    
    // Combine into a single ID (allowlistId + nonce)
    const fullIdBytes = new Uint8Array([...allowlistBytes, ...nonce]);
    console.log(`- Combined ID length: ${fullIdBytes.length} bytes`);
    
    // Convert to hex representation for use with SEAL
    const documentIdHex = toHex(fullIdBytes);
    const salt = toHex(nonce);
    
    console.log(` Document ID generated successfully`);
    console.log(`- Document ID (hex): ${documentIdHex}`);
    console.log(`- Salt (hex): ${salt}`);
    console.log('- IMPORTANT: This document ID must be used for encryption');
    console.log('- IMPORTANT: The salt must be saved for recovery');
    
    return {
      documentIdHex,
      fullIdBytes,
      allowlistBytes,
      nonce,
      salt  // Return salt in hex format for easy storage
    };
  } catch (error) {
    console.error(' Failed to create document ID:', error);
    console.error(error.stack);
    throw error;
  }
}

// Ensure directory exists
function ensureDirectoryExists(dirPath) {
  console.log(`\n Ensuring directory exists: ${dirPath}...`);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(` Created directory: ${dirPath}`);
  } else {
    console.log(` Directory already exists: ${dirPath}`);
  }
}

// Get a random Walrus endpoint
function getRandomWalrusEndpoint() {
  const index = Math.floor(Math.random() * config.WALRUS_ENDPOINTS.length);
  const endpoint = config.WALRUS_ENDPOINTS[index];
  console.log(`- Selected Walrus endpoint: ${endpoint}`);
  return endpoint;
}

// Save data to file with logging
function saveToFile(data, filePath) {
  console.log(`\n Saving data to file: ${filePath}...`);
  console.log(`- Data size: ${data.length} bytes`);
  
  try {
    // Ensure parent directory exists
    ensureDirectoryExists(path.dirname(filePath));
    
    // Write file
    fs.writeFileSync(filePath, data);
    console.log(` Data saved successfully to: ${filePath}`);
    return filePath;
  } catch (error) {
    console.error(` Failed to save data to file: ${error.message}`);
    console.error(error.stack);
    throw error;
  }
}

// Read file with logging
function readFromFile(filePath) {
  console.log(`\n Reading file: ${filePath}...`);
  
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }
    
    const data = fs.readFileSync(filePath);
    console.log(` File read successfully, size: ${data.length} bytes`);
    return data;
  } catch (error) {
    console.error(` Failed to read file: ${error.message}`);
    console.error(error.stack);
    throw error;
  }
}

// Wait for transaction confirmation and object availability
async function waitForTransactionFinality(client, transactionDigest, maxAttempts = 10, delayMs = 1000) {
  console.log(`\n Waiting for transaction ${transactionDigest} to be finalized...`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`- Attempt ${attempt}/${maxAttempts} - Checking transaction status...`);
      
      // Get transaction status
      const txStatus = await client.getTransactionBlock({
        digest: transactionDigest,
        options: { showEffects: true }
      });
      
      if (txStatus.effects?.status?.status === 'success') {
        // Verify objects are available
        console.log('- Transaction successful, verifying object availability...');
        const objects = txStatus.effects.created?.map(obj => obj.reference.objectId) || [];
        
        if (objects.length > 0) {
          // Try to get the first object to confirm it's available
          try {
            await client.getObject({ id: objects[0] });
            console.log(` Transaction finalized and objects are available`);
            return true;
          } catch (objErr) {
            console.log(`- Objects not yet available: ${objErr.message}`);
          }
        } else {
          console.log(' Transaction finalized (no objects to verify)');
          return true;
        }
      }
      
      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, delayMs));
    } catch (error) {
      console.log(`- Error checking transaction: ${error.message}`);
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  console.warn(` Waited for ${maxAttempts} attempts but transaction may not be fully finalized`);
  return false;
}

/**
 * Generate a deterministic salt using public keys
 * This ensures the same document ID is generated for the same set of parties
 * 
 * @param {string} contractId - Contract ID to include in the salt calculation
 * @param {Array<string>} publicKeys - Array of public keys in hex format
 * @returns {Uint8Array} - 5-byte salt
 */
function generateDeterministicSalt(contractId, publicKeys) {
  console.log('\n Generating deterministic salt from public keys...');
  console.log(`- Contract ID: ${contractId}`);
  console.log(`- Number of public keys: ${publicKeys.length}`);
  
  // Sort public keys to ensure order independence
  const sortedKeys = [...publicKeys].sort();
  console.log('- Sorted public keys to ensure consistent results regardless of order');
  
  // Combine contract ID and public keys into a single string
  const combinedInput = contractId + sortedKeys.join('');
  
  // Create a hash
  const saltHash = crypto.createHash('sha256').update(combinedInput);
  // Extract first 5 bytes for the salt
  const salt = Buffer.from(saltHash.digest()).slice(0, 5);
  
  console.log(`- Generated deterministic salt: ${salt.toString('hex')}`);
  console.log('- This salt will be the same for the same public keys and contract ID');
  
  return salt;
}

module.exports = {
  initSuiClient,
  privateKeyToKeypair,
  createDocumentId,
  ensureDirectoryExists,
  getRandomWalrusEndpoint,
  saveToFile,
  readFromFile,
  waitForTransactionFinality,
  generateDeterministicSalt
};