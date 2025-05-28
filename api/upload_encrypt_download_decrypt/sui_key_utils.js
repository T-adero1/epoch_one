const { bech32 } = require('bech32');
const { Ed25519Keypair } = require('@mysten/sui/keypairs/ed25519');
const { fromHEX } = require('@mysten/sui/utils');
require('dotenv').config();

/**
 * Convert a Sui bech32 private key (suiprivkey1...) to a keypair
 * 
 * @param {string} suiPrivateKey - The Sui bech32 private key (suiprivkey1...)
 * @returns {Ed25519Keypair} - The corresponding Ed25519Keypair
 */
function suiPrivkeyToKeypair(suiPrivateKey) {
  console.log('\n Converting private key to keypair...');

  try {
    // Check if the key is in bech32 format (starts with suiprivkey1)
    if (suiPrivateKey.startsWith('suiprivkey1')) {
      console.log(' Detected bech32 format private key');
      console.log('- Converting bech32 private key to Sui keypair...');

      const decoded = bech32.decode(suiPrivateKey);
      console.log(' Bech32 decoded successfully');
      console.log('- Prefix:', decoded.prefix);
      
      // Convert the words to bytes
      const privateKeyBytes = Buffer.from(bech32.fromWords(decoded.words));
      console.log('- Full key size:', privateKeyBytes.length, 'bytes');
      
      // IMPORTANT: Remove the first byte (flag) before creating the keypair
      const secretKey = privateKeyBytes.slice(1);
      console.log('- Secret key size after removing flag:', secretKey.length, 'bytes');
      console.log('- Flag byte (first byte):', privateKeyBytes[0]);
      console.log('- First 4 bytes of secret key (for safety):', secretKey.slice(0, 4).toString('hex') + '...');
      
      if (secretKey.length !== 32) {
        throw new Error(`Expected 32 bytes after removing flag, got ${secretKey.length}`);
      }
      
      // Create a keypair using the 32-byte secret key (without the flag)
      const keypair = Ed25519Keypair.fromSecretKey(secretKey);
      console.log(' Successfully created Ed25519Keypair');
      return keypair;
    } 
    // Assume it's a hex string if not bech32
    else {
      console.log(' Detected hex format private key');
      console.log('- Converting hex private key to Sui keypair...');
      const keypair = Ed25519Keypair.fromSecretKey(fromHEX(suiPrivateKey));
      console.log(' Successfully created Ed25519Keypair');
      return keypair;
    }
  } catch (error) {
    console.error(' Error converting private key:', error);
    throw new Error(`Failed to convert private key: ${error.message}`);
  }
}

/**
 * Test both admin and user private keys
 */
// To use this script, run: node sui_key_utils.js
if (require.main === module) {
  console.log('\n' + '='.repeat(50));
  console.log('TESTING PRIVATE KEYS FROM ENVIRONMENT');
  console.log('='.repeat(50));

  // Use environment variables for keys
  const adminKey = process.env.ADMIN_PRIVATE_KEY;
  const userKey = process.env.USER_PRIVATE_KEY;
  
  if (adminKey) {
    try {
      console.log('\n ADMIN KEY TEST');
      console.log('-'.repeat(20));
      const adminKeypair = suiPrivkeyToKeypair(adminKey);
      const adminAddress = adminKeypair.getPublicKey().toSuiAddress();
      
      console.log(' Successfully created admin keypair');
      console.log(' Derived Sui address:', adminAddress);
    } catch (error) {
      console.error(' Failed to create admin keypair:', error.message);
    }
  } else {
    console.warn('  No ADMIN_PRIVATE_KEY found in environment variables');
  }
  
  if (userKey) {
    try {
      console.log('\n USER KEY TEST');
      console.log('-'.repeat(20));
      const userKeypair = suiPrivkeyToKeypair(userKey);
      const userAddress = userKeypair.getPublicKey().toSuiAddress();
      
      console.log(' Successfully created user keypair');
      console.log(' Derived Sui address:', userAddress);
    } catch (error) {
      console.error(' Failed to create user keypair:', error.message);
    }
  } else {
    console.warn('  No USER_PRIVATE_KEY found in environment variables');
  }
  
  if (!adminKey && !userKey) {
    console.error('\n No private keys found in environment variables');
    console.error('Please set ADMIN_PRIVATE_KEY and USER_PRIVATE_KEY in your .env file');
  }
}

module.exports = { suiPrivkeyToKeypair };