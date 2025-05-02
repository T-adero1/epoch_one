// SEAL integration test for DocumentGroup implementation
const { SealClient, SessionKey, Transaction, getAllowlistedKeyServers } = require('@mysten/seal');
const { SuiClient } = require('@mysten/sui/client');
const { fromHEX, toHex } = require('@mysten/sui/utils');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config();

// Import utility functions
const { createDocumentId } = require('./dist/utils');

// Configuration
const NETWORK = 'testnet';
const RPC_URL = 'https://fullnode.testnet.sui.io:443';

// This should be the REAL package ID of your published document_sharing package
const PACKAGE_ID = process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID || '0xa39c1223eaf93fc5cc085e6c8113170959036319b0e24d706e821c1f82840ecf';

// Test wallet addresses
const WALLET_ADDRESS_1 = "0x521b05256c4b23fc5304fbea1ff485bb44d61b9b60df3ca8e984a10782948b2a";
const WALLET_ADDRESS_2 = "0x652eccaafef833d3703524d720bd9716008ddd4973113e353ded7281827a7d2c";

// PDF file path
const PDF_FILE_PATH = "./Personal letter of motivation.pdf";

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
  console.log('DOCUMENT GROUP SEAL INTEGRATION TEST');
  console.log('='.repeat(50));
  
  console.log('\n📋 Test Configuration:');
  console.log('- Network:', NETWORK);
  console.log('- RPC URL:', RPC_URL);
  console.log('- Package ID:', PACKAGE_ID);
  console.log('- Wallet 1:', WALLET_ADDRESS_1);
  console.log('- Wallet 2:', WALLET_ADDRESS_2);
  console.log('- PDF File:', PDF_FILE_PATH);

  try {
    // Read the PDF file
    console.log('\n📄 Reading PDF file...');
    const pdfData = fs.readFileSync(PDF_FILE_PATH);
    console.log('✅ PDF loaded, size:', pdfData.length, 'bytes');

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
    
    // Try encryption with document group ID
    console.log('\n🔐 Encrypting PDF document...');
    try {
      // In a real scenario, you would get these by creating a document group and adding users,
      // but for testing purposes, we'll simulate with a mock document group ID
      const mockDocumentGroupId = '0x1111111111111111111111111111111111111111111111111111111111111111'; // Mock ID for testing
      const databaseDocumentId = 'test-pdf-doc-' + Date.now().toString(36);
      
      console.log('- Document Group ID (mock):', mockDocumentGroupId);
      console.log('- Database Document ID:', databaseDocumentId);
      
      // Create a random nonce to make the ID unique 
      const nonce = crypto.randomBytes(5);
      
      // Convert document group ID to bytes and combine with database ID
      const documentGroupBytes = fromHEX(mockDocumentGroupId);
      const dbIdBytes = Buffer.from(databaseDocumentId);
      
      // Combine into a single ID
      const fullIdBytes = new Uint8Array([...documentGroupBytes, ...dbIdBytes, ...nonce]);
      
      // Convert the ID to a hex string
      const documentIdHex = toHex(fullIdBytes);
      
      console.log('- Full Document ID (hex):', documentIdHex);
      console.log('- Threshold:', 2); // Using both servers with threshold 2
      console.log('- Package ID:', PACKAGE_ID);
      
      // Encrypt the PDF document
      const { encryptedObject: encryptedBytes, key: backupKey } = await client.encrypt({
        threshold: 2, // Use both servers with threshold 2
        packageId: PACKAGE_ID,
        id: documentIdHex, // Use the hex string ID
        data: pdfData,
      });
      
      console.log('\n✅ Encryption successful!');
      console.log('- Has encrypted object:', !!encryptedBytes);
      console.log('- Encrypted size:', encryptedBytes?.length || 0, 'bytes');
      console.log('- Has backup key:', !!backupKey);
      
      // Save the encrypted PDF and metadata for reference
      const resultFile = `./encrypted_pdf_${Date.now()}.json`;
      fs.writeFileSync(resultFile, JSON.stringify({
        documentGroupId: mockDocumentGroupId,
        databaseDocumentId: databaseDocumentId,
        packageId: PACKAGE_ID,
        documentIdHex: documentIdHex,
        authorizedWallets: [WALLET_ADDRESS_1, WALLET_ADDRESS_2],
        encryptedObject: Buffer.from(encryptedBytes).toString('hex'),
        backupKey: backupKey ? Buffer.from(backupKey).toString('hex') : null,
      }, null, 2));
      console.log('\n💾 Results saved to:', resultFile);
      
      console.log('\n📝 Next Steps:');
      console.log('1. Create a real DocumentGroup using the admin UI or API');
      console.log('2. Add the wallet addresses to the authorized users list');
      console.log('3. Use the real DocumentGroup ID for encryption (instead of mock)');
      console.log('4. Implement decryption with sessions for authorized users');
      
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