/**
 * Alternative blockchain operations with simplified blob registration
 */
const { Transaction } = require('@mysten/sui/transactions');
const { fromB64, toHex } = require('@mysten/sui/utils');
const config = require('./fixed_config');
const utils = require('./fixed_utils');

// Publish a blob to an allowlist with base64 handling
async function publishBlobToAllowlistSimple(client, adminKeypair, allowlistId, capId, blobId) {
  console.log('\n📋 STEP 7: Publishing blob to allowlist (alternative approach)...');
  console.log(`- Allowlist ID: ${allowlistId}`);
  console.log(`- Cap ID: ${capId}`);
  console.log(`- Blob ID: ${blobId}`);
  
  try {
    // Create a transaction
    const tx = new Transaction();
    
    // Set the sender
    tx.setSender(adminKeypair.getPublicKey().toSuiAddress());
    
    // Set gas budget explicitly
    tx.setGasBudget(50000000);
    
    // Add the publish_blob_entry call with blobId as bytes
    console.log('- Converting blob ID to safe format...');
    
    // First try to convert the blobId to bytes directly
    let blobIdBytes;
    try {
      // Try to encode as a safe string
      const blobIdSafe = Buffer.from(blobId).toString('hex');
      console.log(`- Encoded blob ID as hex: ${blobIdSafe}`);
      
      tx.moveCall({
        target: `${config.ALLOWLIST_PACKAGE_ID}::allowlist::publish_blob_entry`,
        arguments: [
          tx.object(allowlistId),
          tx.object(capId),
          tx.pure.string(blobIdSafe)
        ]
      });
    } catch (encodeError) {
      console.log(`- Error encoding blob ID: ${encodeError.message}`);
      console.log('- Falling back to simple string approach...');
      
      tx.moveCall({
        target: `${config.ALLOWLIST_PACKAGE_ID}::allowlist::publish_blob_entry`,
        arguments: [
          tx.object(allowlistId),
          tx.object(capId),
          tx.pure.string(blobId.substring(0, 32)) // Use only first 32 chars
        ]
      });
    }
    
    // Build the transaction
    console.log('- Building transaction...');
    const txBytes = await tx.build({ client });
    
    // Sign the transaction
    console.log('- Signing transaction with admin keypair...');
    const { signature } = await adminKeypair.signTransaction(txBytes);
    
    // Execute the transaction
    console.log('- Executing transaction on blockchain...');
    const result = await client.executeTransactionBlock({
      transactionBlock: txBytes,
      signature,
      options: {
        showEffects: true,
        showObjectChanges: true
      }
    });
    
    // Check result
    if (result.effects?.status?.status !== 'success') {
      throw new Error(`Transaction failed: ${result.effects?.status?.error}`);
    }
    
    console.log(`✅ Blob published to allowlist successfully`);
    console.log(`- Transaction digest: ${result.digest}`);
    
    // Wait for transaction to be finalized
    await utils.waitForTransactionFinality(client, result.digest);
    
    return {
      tx: result
    };
  } catch (error) {
    console.error(`❌ Failed to publish blob to allowlist: ${error.message}`);
    console.error(error.stack);
    throw error;
  }
}

// Simple add user to allowlist function
async function addUserToAllowlistSimple(client, adminKeypair, allowlistId, capId, userAddress) {
  console.log('\n👥 STEP 2: Adding user to allowlist (simple approach)...');
  console.log(`- Allowlist ID: ${allowlistId}`);
  console.log(`- Cap ID: ${capId}`);
  console.log(`- User Address: ${userAddress}`);
  
  try {
    // Create a transaction
    const tx = new Transaction();
    
    // Set the sender
    tx.setSender(adminKeypair.getPublicKey().toSuiAddress());
    
    // Set gas budget explicitly
    tx.setGasBudget(50000000);
    
    // Add a single user
    const users = [userAddress];
    
    tx.moveCall({
      target: `${config.ALLOWLIST_PACKAGE_ID}::allowlist::add_users_entry`,
      arguments: [
        tx.object(allowlistId),
        tx.object(capId),
        tx.pure.vector('address', users)
      ]
    });
    
    // Build the transaction
    console.log('- Building transaction...');
    const txBytes = await tx.build({ client });
    
    // Sign the transaction
    console.log('- Signing transaction with admin keypair...');
    const { signature } = await adminKeypair.signTransaction(txBytes);
    
    // Execute the transaction
    console.log('- Executing transaction on blockchain...');
    const result = await client.executeTransactionBlock({
      transactionBlock: txBytes,
      signature,
      options: {
        showEffects: true
      }
    });
    
    // Check result
    if (result.effects?.status?.status !== 'success') {
      throw new Error(`Transaction failed: ${result.effects?.status?.error}`);
    }
    
    console.log(`✅ User added to allowlist successfully`);
    console.log(`- Transaction digest: ${result.digest}`);
    
    // Wait for transaction to be finalized
    await utils.waitForTransactionFinality(client, result.digest);
    
    return {
      tx: result
    };
  } catch (error) {
    console.error(`❌ Failed to add user to allowlist: ${error.message}`);
    console.error(error.stack);
    throw error;
  }
}

module.exports = {
  publishBlobToAllowlistSimple,
  addUserToAllowlistSimple
};
