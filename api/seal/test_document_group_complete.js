// Complete SEAL integration test for DocumentGroup implementation
const { SealClient, SessionKey, Transaction, getAllowlistedKeyServers } = require('@mysten/seal');
const { SuiClient } = require('@mysten/sui/client');
const { Ed25519Keypair } = require('@mysten/sui/keypairs/ed25519');
const { fromHEX, toHex } = require('@mysten/sui/utils');
const fs = require('fs');
require('dotenv').config();

// Import utility functions
const { 
  createDocumentId, 
  createDocumentGroupTxPayload, 
  addUserToDocumentGroupTxPayload 
} = require('./dist/utils');

// Configuration
const NETWORK = 'testnet';
const RPC_URL = 'https://fullnode.testnet.sui.io:443';

// This should be the REAL package ID of your published document_sharing package
const PACKAGE_ID = process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID || '0xa39c1223eaf93fc5cc085e6c8113170959036319b0e24d706e821c1f82840ecf';

// Test wallet addresses - these will be given access to the document
const WALLET_ADDRESS_1 = "0x82222415bfb7e66b1fa652c2dac774d18cd24dfce1cc000f16f20465c4078416";
const WALLET_ADDRESS_2 = "0x94e6bd6b2bea5fa7dcf30508909e8cd123b5dae515a8fabce91d1a269b646207";

// PDF file path
const PDF_FILE_PATH = "./Personal letter of motivation.pdf";

// For testing we'll need a keypair - this would be your admin wallet
// In production you'd use a wallet connector
// Use YOUR private key in a .env file
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY;

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
  console.log('COMPLETE DOCUMENT GROUP WORKFLOW TEST');
  console.log('='.repeat(50));
  
  console.log('\n📋 Test Configuration:');
  console.log('- Network:', NETWORK);
  console.log('- RPC URL:', RPC_URL);
  console.log('- Package ID:', PACKAGE_ID);
  console.log('- Wallet 1:', WALLET_ADDRESS_1);
  console.log('- Wallet 2:', WALLET_ADDRESS_2);
  console.log('- PDF File:', PDF_FILE_PATH);

  try {
    // Check if we have an admin private key for creating the document group
    if (!ADMIN_PRIVATE_KEY) {
      console.log('⚠️ No admin private key found in .env file, will use mock document group instead');
    }
    
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
    
    // Document group creation - with real keypair if available, otherwise mock
    let documentGroupId, adminCapId;
    
    if (ADMIN_PRIVATE_KEY) {
      console.log('\n🏗️ Creating document group on-chain...');
      
      // Create keypair from private key - handle both formats
      let keypair;
      if (ADMIN_PRIVATE_KEY.startsWith('suiprivkey1')) {
        console.log('- Using Sui string format for private key (suiprivkey1...)');
        keypair = Ed25519Keypair.fromExportedKeypair({
          schema: 'ED25519',
          privateKey: ADMIN_PRIVATE_KEY
        });
      } else {
        console.log('- Using hex format for private key');
        keypair = Ed25519Keypair.fromSecretKey(fromHEX(ADMIN_PRIVATE_KEY));
      }
      
      const adminAddress = keypair.getPublicKey().toSuiAddress();
      console.log('- Admin address:', adminAddress);
      
      // Create transaction to create document group
      const tx = new Transaction();
      const groupName = "PDF Test Group";
      const dbId = `pdf-test-${Date.now()}`;
      
      const createPayload = createDocumentGroupTxPayload(PACKAGE_ID, groupName, dbId);
      tx.moveCall(createPayload);
      
      // Sign and execute transaction
      try {
        const result = await suiClient.signAndExecuteTransactionBlock({
          signer: keypair,
          transactionBlock: tx,
          options: {
            showEffects: true,
            showEvents: true,
            showObjectChanges: true
          }
        });
        
        console.log('- Transaction status:', result.effects.status.status);
        
        if (result.effects.status.status === 'success') {
          // Extract document group ID and admin cap ID from transaction results
          const created = result.objectChanges.filter(change => 
            change.type === 'created' || change.type === 'published'
          );
          
          const adminCapObj = created.find(obj => 
            obj.objectType.includes('::document_sharing::AdminCap')
          );
          
          const documentGroupObj = created.find(obj => 
            obj.objectType.includes('::document_sharing::DocumentGroup')
          );
          
          if (adminCapObj && documentGroupObj) {
            adminCapId = adminCapObj.objectId;
            documentGroupId = documentGroupObj.objectId;
            
            console.log('✅ Document group created successfully!');
            console.log('- Document Group ID:', documentGroupId);
            console.log('- Admin Cap ID:', adminCapId);
            
            // Now add the authorized wallet addresses
            console.log('\n👥 Adding authorized users to document group...');
            
            for (const walletAddress of [WALLET_ADDRESS_1, WALLET_ADDRESS_2]) {
              const addUserTx = new Transaction();
              const addUserPayload = addUserToDocumentGroupTxPayload(
                PACKAGE_ID, 
                documentGroupId, 
                adminCapId, 
                walletAddress
              );
              addUserTx.moveCall(addUserPayload);
              
              try {
                const addResult = await suiClient.signAndExecuteTransactionBlock({
                  signer: keypair,
                  transactionBlock: addUserTx,
                  options: { showEffects: true }
                });
                
                if (addResult.effects.status.status === 'success') {
                  console.log(`- ✅ Added wallet ${walletAddress.slice(0, 10)}...`);
                } else {
                  console.log(`- ❌ Failed to add wallet ${walletAddress.slice(0, 10)}...`);
                }
              } catch (error) {
                console.error(`- ❌ Error adding wallet ${walletAddress.slice(0, 10)}...`, error.message);
              }
            }
          } else {
            console.error('❌ Could not find document group or admin cap in transaction results');
            documentGroupId = '0x' + '1'.repeat(64); // Mock ID for testing
          }
        } else {
          console.error('❌ Transaction failed:', result.effects.status);
          documentGroupId = '0x' + '1'.repeat(64); // Mock ID for testing
        }
      } catch (error) {
        console.error('❌ Error creating document group:', error.message);
        documentGroupId = '0x' + '1'.repeat(64); // Mock ID for testing
      }
    } else {
      // Use mock values if no private key available
      documentGroupId = '0x' + '1'.repeat(64); // Mock ID for testing
      console.log('\n⚠️ Using mock document group ID:', documentGroupId);
    }
    
    // Encrypt the PDF document using the document group ID
    console.log('\n🔐 Encrypting PDF document...');
    try {
      const databaseDocumentId = 'pdf-doc-' + Date.now().toString(36);
      console.log('- Database Document ID:', databaseDocumentId);
      
      // Create a random nonce to make the ID unique 
      const crypto = require('crypto');
      const nonce = crypto.randomBytes(5);
      
      // Convert document group ID to bytes and combine with database ID
      const documentGroupBytes = fromHEX(documentGroupId);
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
        documentGroupId: documentGroupId,
        adminCapId: adminCapId || null,
        databaseDocumentId: databaseDocumentId,
        packageId: PACKAGE_ID,
        documentIdHex: documentIdHex,
        authorizedWallets: [WALLET_ADDRESS_1, WALLET_ADDRESS_2],
        encryptedObject: Buffer.from(encryptedBytes).toString('hex'),
        backupKey: backupKey ? Buffer.from(backupKey).toString('hex') : null,
      }, null, 2));
      console.log('\n💾 Results saved to:', resultFile);
      
      // Instructions for decryption
      console.log('\n🔑 Decryption Instructions:');
      console.log('To decrypt this document, an authorized wallet (one of those added to the document group)');
      console.log('would need to:');
      console.log('1. Create a session key and sign a personal message');
      console.log('2. Build a transaction that calls the seal_approve function with:');
      console.log('   - The document ID derived from the document group ID and database ID');
      console.log('   - The document group object');
      console.log('3. Use the SealClient to fetch key shares');
      console.log('4. Decrypt the encrypted data using the session key and transaction');
      
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