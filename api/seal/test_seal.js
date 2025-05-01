// SEAL integration test using official SDK
const { SealClient, SessionKey, Transaction, getAllowlistedKeyServers } = require('@mysten/seal');
const { SuiClient } = require('@mysten/sui/client');
const { fromHEX, toHex } = require('@mysten/sui/utils');
const { bcs } = require('@mysten/bcs');
const crypto = require('crypto');
const fs = require('fs');
require('dotenv').config();

// Configuration
const NETWORK = 'testnet';
const RPC_URL = 'https://fullnode.testnet.sui.io:443';

// This should be a REAL package ID of a published package that has seal_approve functions
const PACKAGE_ID = process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID || '0xa39c1223eaf93fc5cc085e6c8113170959036319b0e24d706e821c1f82840ecf';

// Test signer address - replace with actual address that would decrypt
const TEST_SIGNER_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";

// Register the AccessRequest struct type to match the Move contract
bcs.registerStructType('AccessRequest', {
  contract_id: 'vector<u8>',
  signer_addresses: 'vector<address>',
});

// Simple SUI client validation
async function validateSuiClient(client) {
  console.log('\n🔍 Validating SuiClient...');
  try {
    console.log('Testing getChainIdentifier...');
    const chain = await client.getChainIdentifier();
    console.log('✅ Chain identifier:', chain);
    return true;
  } catch (error) {
    console.error('❌ SuiClient validation failed:', error.message);
    return false;
  }
}

async function runTest() {
  console.log('\n' + '='.repeat(50));
  console.log('SEAL INTEGRATION TEST STARTING');
  console.log('='.repeat(50));
  
  console.log('\n📋 Test Configuration:');
  console.log('- Network:', NETWORK);
  console.log('- RPC URL:', RPC_URL);
  console.log('- SEAL Package ID:', PACKAGE_ID);
  console.log('- Test Signer:', TEST_SIGNER_ADDRESS);

  // Sample content to encrypt
  const testContent = {
    title: "Test Contract",
    content: "This is a test contract document for SEAL encryption testing.",
    timestamp: new Date().toISOString()
  };

  // Convert to bytes
  const contentBytes = Buffer.from(JSON.stringify(testContent));
  console.log('\n📝 Content size:', contentBytes.length, 'bytes');

  try {
    // Initialize SUI client
    console.log('\n🔌 Connecting to Sui network...');
    const suiClient = new SuiClient({ url: RPC_URL });
    await validateSuiClient(suiClient);
    
    // Get the allowlisted key servers
    console.log('\n🔑 Fetching allowlisted key servers...');
    const keyServerIds = await getAllowlistedKeyServers(NETWORK);
    console.log('✅ Found', keyServerIds.length, 'key servers:');
    keyServerIds.forEach((id, index) => {
      console.log(`  ${index + 1}. ${id}`);
    });
    
    // Initialize SEAL client
    console.log('\n🔒 Initializing SEAL client...');
    const client = new SealClient({
      suiClient,
      serverObjectIds: keyServerIds,
      verifyKeyServers: false  // For testing
    });
    
    // Try encryption with properly formatted ID
    console.log('\n🔐 Encrypting document...');
    try {
      // Create a contract ID (as bytes)
      const contractId = Buffer.from('test-contract-' + Date.now().toString(36));
      console.log('- Contract ID:', toHex(contractId));
      
      // Create list of authorized addresses that can decrypt
      const authorizedAddress = TEST_SIGNER_ADDRESS.replace(/^0x/, ''); // Remove 0x prefix if present
      console.log('- Authorized address:', authorizedAddress);
      
      // Create properly BCS-encoded AccessRequest struct
      const bcsEncoded = bcs.ser('AccessRequest', {
        contract_id: Array.from(contractId),
        signer_addresses: [fromHEX(`0x${authorizedAddress}`)]
      }).toBytes();
      
      const idHex = toHex(bcsEncoded);
      console.log('- BCS encoded ID (hex):', idHex);
      console.log('- Package ID:', PACKAGE_ID);
      console.log('- Threshold:', 2); // Using both servers with threshold 2
      
      const { encryptedObject: encryptedBytes, key: backupKey } = await client.encrypt({
        threshold: 2, // Use both servers with threshold 2
        packageId: fromHEX(PACKAGE_ID),
        id: bcsEncoded,
        data: contentBytes,
      });
      
      console.log('\n✅ Encryption successful!');
      console.log('- Has encrypted object:', !!encryptedBytes);
      console.log('- Encrypted size:', encryptedBytes?.length || 0, 'bytes');
      console.log('- Has backup key:', !!backupKey);
      
      // Save for reference
      const resultFile = `./seal_test_result_${Date.now()}.json`;
      fs.writeFileSync(resultFile, JSON.stringify({
        id: idHex,
        packageId: PACKAGE_ID,
        authorizedAddress,
        encryptedObject: Buffer.from(encryptedBytes).toString('hex'),
        backupKey: backupKey ? Buffer.from(backupKey).toString('hex') : null,
      }, null, 2));
      console.log('\n💾 Results saved to:', resultFile);
      
    } catch (error) {
      console.error('\n❌ Encryption failed:');
      console.error('- Name:', error.name);
      console.error('- Message:', error.message);
      console.error('- Stack:', error.stack);
    }
  } catch (error) {
    console.log('\n' + '='.repeat(50));
    console.log('❌ TEST FAILED');
    console.log('='.repeat(50));
    console.error('\nError details:');
    console.error('- Name:', error.name);
    console.error('- Message:', error.message);
    console.error('- Stack:', error.stack);
    
    return false;
  }
}

// Run the test
runTest().catch(error => {
  console.error('\n💥 Unhandled error:', error);
});