/**
 * Utility functions for SEAL backend
 * Enhanced version with clearer logging and improved document ID generation
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SuiClient } = require('@mysten/sui/client');
const { Ed25519Keypair } = require('@mysten/sui/keypairs/ed25519');
const { fromHEX, toHex } = require('@mysten/sui/utils');
const { bech32 } = require('bech32');
const config = require('./fixed_config');
const { Transaction } = require('@mysten/sui/transactions');
const { suiPrivkeyToKeypair } = require('./sui_key_utils');

// Initialize SUI client
async function initSuiClient() {
  console.log('\n🔌 Initializing Sui client...');
  const client = new SuiClient({ url: config.RPC_URL });
  
  // Validate the client is working
  try {
    const chainId = await client.getChainIdentifier();
    console.log(`✅ Connected to Sui ${config.NETWORK} with chain ID: ${chainId}`);
    return client;
  } catch (error) {
    console.error('❌ Failed to connect to Sui network:', error);
    console.error(error.stack);
    throw new Error('Failed to initialize Sui client');
  }
}

// Convert a private key (various formats) to a Sui keypair
function privateKeyToKeypair(privateKey) {
  console.log('\n🔑 Converting private key to Sui keypair...');
  console.log('- This converts various private key formats to a Sui-compatible keypair');
  const keypair = suiPrivkeyToKeypair(privateKey);
  console.log('✅ Successfully converted private key to Sui keypair');
  return keypair;
}

// Create a random document ID by combining a document group ID (allowlist ID) with a random nonce
function createDocumentId(allowlistId) {
  console.log('\n🔍 STEP 3: Generating document ID from allowlist ID...');
  console.log(`- Allowlist ID: ${allowlistId}`);
  console.log('- Document ID = allowlist ID prefix + random nonce');
  console.log('- This ID is critical for security - MUST be created BEFORE encryption');
  
  try {
    // Convert allowlist ID to bytes
    const allowlistBytes = fromHEX(allowlistId);
    console.log(`- Allowlist bytes length: ${allowlistBytes.length}`);
    
    // Create a random nonce (5 bytes)
    const nonce = crypto.randomBytes(5);
    console.log(`- Generated random nonce: ${Buffer.from(nonce).toString('hex')}`);
    console.log(`- Nonce length: ${nonce.length} bytes`);
    
    // Combine into a single ID (allowlistId + nonce)
    const fullIdBytes = new Uint8Array([...allowlistBytes, ...nonce]);
    console.log(`- Combined ID length: ${fullIdBytes.length} bytes`);
    
    // Convert to hex representation for use with SEAL
    const documentIdHex = toHex(fullIdBytes);
    console.log(`✅ Document ID generated successfully`);
    console.log(`- Document ID (hex): ${documentIdHex}`);
    console.log('- IMPORTANT: This document ID must be used for encryption');
    
    return {
      documentIdHex,
      fullIdBytes,
      allowlistBytes,
      nonce
    };
  } catch (error) {
    console.error('❌ Failed to create document ID:', error);
    console.error(error.stack);
    throw error;
  }
}

// Ensure directory exists
function ensureDirectoryExists(dirPath) {
  console.log(`\n📁 Ensuring directory exists: ${dirPath}...`);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`✅ Created directory: ${dirPath}`);
  } else {
    console.log(`✅ Directory already exists: ${dirPath}`);
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
  console.log(`\n💾 Saving data to file: ${filePath}...`);
  console.log(`- Data size: ${data.length} bytes`);
  
  try {
    // Ensure parent directory exists
    ensureDirectoryExists(path.dirname(filePath));
    
    // Write file
    fs.writeFileSync(filePath, data);
    console.log(`✅ Data saved successfully to: ${filePath}`);
    return filePath;
  } catch (error) {
    console.error(`❌ Failed to save data to file: ${error.message}`);
    console.error(error.stack);
    throw error;
  }
}

// Read file with logging
function readFromFile(filePath) {
  console.log(`\n📄 Reading file: ${filePath}...`);
  
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }
    
    const data = fs.readFileSync(filePath);
    console.log(`✅ File read successfully, size: ${data.length} bytes`);
    return data;
  } catch (error) {
    console.error(`❌ Failed to read file: ${error.message}`);
    console.error(error.stack);
    throw error;
  }
}

// Wait for transaction confirmation and object availability
async function waitForTransactionFinality(client, transactionDigest, maxAttempts = 10, delayMs = 1000) {
  console.log(`\n⏳ Waiting for transaction ${transactionDigest} to be finalized...`);
  
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
            console.log(`✅ Transaction finalized and objects are available`);
            return true;
          } catch (objErr) {
            console.log(`- Objects not yet available: ${objErr.message}`);
          }
        } else {
          console.log('✅ Transaction finalized (no objects to verify)');
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
  
  console.warn(`⚠️ Waited for ${maxAttempts} attempts but transaction may not be fully finalized`);
  return false;
}

module.exports = {
  initSuiClient,
  privateKeyToKeypair,
  createDocumentId,
  ensureDirectoryExists,
  getRandomWalrusEndpoint,
  saveToFile,
  readFromFile,
  waitForTransactionFinality
};
