const { suiPrivkeyToKeypair } = require('./sui_key_utils');

// Replace this with your test key
const testPrivateKey = "";

console.log('\n Testing suiPrivkeyToKeypair...');
try {
  const keypair = suiPrivkeyToKeypair(testPrivateKey);
  const address = keypair.getPublicKey().toSuiAddress();
  console.log('\n Successfully created keypair from private key');
  console.log(' Address:', address);
  console.log('Public key (base64):', keypair.getPublicKey().toBase64());
  console.log(' Public key (bytes):', Array.from(keypair.getPublicKey().toRawBytes()).slice(0, 5).join(',') + '...');
} catch (error) {
  console.error('\n Failed to convert private key:', error);
}
