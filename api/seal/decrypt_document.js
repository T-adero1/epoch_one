// Decryption example for DocumentGroup implementation
const { SealClient, SessionKey, Transaction, getAllowlistedKeyServers } = require('@mysten/seal');
const { SuiClient } = require('@mysten/sui/client');
const { Ed25519Keypair } = require('@mysten/sui/keypairs/ed25519');
const { fromHEX, toHex } = require('@mysten/sui/utils');
const fs = require('fs');
require('dotenv').config();

// Import utility functions
const { createDocumentId, getSealApproveTxPayload } = require('./dist/utils');

// Configuration
const NETWORK = 'testnet';
const RPC_URL = 'https://fullnode.testnet.sui.io:443';

// Parse command line arguments
// Usage: node decrypt_document.js <metadata_file_path> [encrypted_file_path]
// If only one argument is provided, treat it as the metadata file and expect encoded data in it
// If two arguments are provided, first is metadata file, second is encrypted file
if (process.argv.length < 3) {
  console.error('Usage: node decrypt_document.js <metadata_file_path> [encrypted_file_path]');
  process.exit(1);
}

const METADATA_FILE_PATH = process.argv[2];
// If a second path is provided, use it as the encrypted file path
const ENCRYPTED_FILE_PATH = process.argv.length > 3 ? process.argv[3] : null;

// The private key of the wallet that wants to decrypt
// This should be one of the authorized wallets
const USER_PRIVATE_KEY = process.env.USER_PRIVATE_KEY;

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

async function decryptDocument() {
  console.log('\n' + '='.repeat(50));
  console.log('DOCUMENT DECRYPTION WITH SESSION KEY');
  console.log('='.repeat(50));
  
  if (!USER_PRIVATE_KEY) {
    console.error('❌ Error: No user private key provided in .env file. Set USER_PRIVATE_KEY=<your_private_key>');
    return;
  }
  
  console.log('\n📋 Configuration:');
  console.log('- Network:', NETWORK);
  console.log('- RPC URL:', RPC_URL);
  console.log('- Metadata File:', METADATA_FILE_PATH);
  if (ENCRYPTED_FILE_PATH) {
    console.log('- Encrypted File:', ENCRYPTED_FILE_PATH);
  }

  try {
    // Read the metadata file
    console.log('\n📄 Reading metadata file...');
    const metadata = JSON.parse(fs.readFileSync(METADATA_FILE_PATH, 'utf8'));
    
    // Extract required information
    const { 
      documentGroupId, 
      databaseDocumentId, 
      packageId, 
      encryptedObject: encryptedObjectHex,
      documentIdHex,
      authorizedWallets 
    } = metadata;
    
    console.log('- Document Group ID:', documentGroupId);
    console.log('- Database Document ID:', databaseDocumentId);
    console.log('- Package ID:', packageId);
    
    if (authorizedWallets) {
      console.log('- Authorized Wallets:', authorizedWallets.map(w => w.slice(0, 10) + '...').join(', '));
    }
    
    // Get encrypted data - either from the metadata file or from a separate file
    console.log('\n📄 Reading encrypted data...');
    let encryptedBytes;
    
    if (ENCRYPTED_FILE_PATH) {
      // If an encrypted file path was provided, read from that file
      console.log(`- Reading from file: ${ENCRYPTED_FILE_PATH}`);
      encryptedBytes = new Uint8Array(fs.readFileSync(ENCRYPTED_FILE_PATH));
    } else if (encryptedObjectHex) {
      // If encrypted data is included in the metadata file, use that
      console.log('- Using encrypted data from metadata file');
      encryptedBytes = new Uint8Array(Buffer.from(encryptedObjectHex, 'hex'));
    } else {
      throw new Error('No encrypted data found. Please provide either an encrypted file path or include encrypted data in the metadata file.');
    }
    
    console.log(`- Encrypted data size: ${encryptedBytes.length} bytes`);
    
    // Create keypair from private key
    console.log('\n🔑 Creating session key...');
    console.log('- Attempting to create keypair from private key...');
    
    let keypair;
    if (USER_PRIVATE_KEY.startsWith('suiprivkey1')) {
      console.log('- Using Sui string format for private key (suiprivkey1...)');
      keypair = Ed25519Keypair.fromExportedKeypair({
        schema: 'ED25519',
        privateKey: USER_PRIVATE_KEY
      });
    } else {
      console.log('- Using hex format for private key');
      keypair = Ed25519Keypair.fromSecretKey(fromHEX(USER_PRIVATE_KEY));
    }
    
    const userAddress = keypair.getPublicKey().toSuiAddress();
    console.log('- User Address:', userAddress);
    
    // Check if user is authorized
    if (authorizedWallets && !authorizedWallets.includes(userAddress)) {
      console.warn(`⚠️ Warning: User address ${userAddress} not in the authorized wallets list`);
      console.warn('Decryption might fail if the user is not authorized in the DocumentGroup on-chain');
    }
    
    // Initialize SUI client
    console.log('\n🔌 Connecting to Sui network...');
    const suiClient = new SuiClient({ url: RPC_URL });
    await validateSuiClient(suiClient);
    
    // Get the allowlisted key servers
    console.log('\n🔑 Fetching allowlisted key servers...');
    const keyServerIds = await getAllowlistedKeyServers(NETWORK);
    console.log('✅ Found', keyServerIds.length, 'key servers:');
    
    // Initialize SEAL client
    console.log('\n🔒 Initializing SEAL client...');
    const client = new SealClient({
      suiClient,
      serverObjectIds: keyServerIds,
      verifyKeyServers: false  // For testing
    });
    
    // Create a session key
    console.log('\n🔑 Creating session key...');
    const sessionKey = new SessionKey({
      address: userAddress,
      packageId,
      ttlMin: 10  // Session valid for 10 minutes
    });
    
    // Get personal message to sign
    const personalMessage = sessionKey.getPersonalMessage();
    console.log('- Personal message:', personalMessage);
    
    // In a real frontend app, the user would sign this with their wallet
    // Since we're using a script, we'll sign directly with the keypair
    console.log('- Signing personal message...');
    const signature = await keypair.signPersonalMessage(Buffer.from(personalMessage));
    await sessionKey.setPersonalMessageSignature(signature);
    console.log('✅ Session key created with signature');
    
    // Determine the document ID to use
    console.log('\n🔍 Creating document ID...');
    let documentId;
    let documentIdHexToUse;
    
    if (documentIdHex) {
      // Use the stored document ID hex if available (from newer test versions)
      documentIdHexToUse = documentIdHex;
      documentId = fromHEX(documentIdHex);
      console.log('- Using stored document ID hex (recommended)');
    } else {
      // Fall back to creating the document ID using the old method
      documentId = createDocumentId(documentGroupId, databaseDocumentId);
      documentIdHexToUse = toHex(documentId);
      console.log('- Created document ID from group ID and database ID (legacy)');
    }
    console.log('- Document ID (hex):', documentIdHexToUse);
    
    // Create the approval transaction
    console.log('\n📝 Creating approval transaction...');
    const tx = new Transaction();
    const approvePayload = getSealApproveTxPayload(packageId, documentGroupId, documentId);
    tx.moveCall(approvePayload);
    
    // Build transaction bytes
    const txBytes = await tx.build({
      client: suiClient,
      onlyTransactionKind: true
    });
    
    // Try to fetch keys from the key servers
    console.log('\n🔐 Fetching key shares from key servers...');
    try {
      await client.fetchKeys({
        ids: [documentId],
        txBytes,
        sessionKey,
        threshold: 2
      });
      console.log('✅ Successfully fetched key shares');
      
      // Decrypt the document
      console.log('\n🔓 Decrypting document...');
      const decryptedData = await client.decrypt({
        data: encryptedBytes,
        sessionKey,
        txBytes,
      });
      
      console.log('✅ Decryption successful!');
      console.log('- Decrypted size:', decryptedData.length, 'bytes');
      
      // Save the decrypted file
      const outputFile = `./decrypted_${Date.now()}.pdf`;
      fs.writeFileSync(outputFile, Buffer.from(decryptedData));
      console.log(`\n💾 Decrypted PDF saved to: ${outputFile}`);
      
    } catch (error) {
      console.error('\n❌ Decryption failed:', error.message);
      
      if (error.message.includes('No access')) {
        console.error('\nThis may be due to:');
        console.error('1. The user is not in the authorized users list in the DocumentGroup');
        console.error('2. The DocumentGroup ID provided is incorrect');
        console.error('3. The document ID format is not correctly formed');
      }
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.message.includes('no such file')) {
      console.error(`The file specified does not exist.`);
    }
  }
}

// Run the decryption
decryptDocument().catch(error => {
  console.error('\n💥 Unhandled error:', error);
}); 