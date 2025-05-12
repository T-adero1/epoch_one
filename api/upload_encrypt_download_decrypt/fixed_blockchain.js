/**
 * Blockchain operations for document sharing and access control
 * Enhanced version with batch operations
 */
const { Transaction } = require('@mysten/sui/transactions');
const config = require('./fixed_config');
const utils = require('./fixed_utils');

// Create a new allowlist
async function createAllowlist(client, adminKeypair, name) {
  console.log('\n STEP 1: Creating allowlist...');
  console.log(`- Name: ${name}`);
  console.log(`- Admin: ${adminKeypair.getPublicKey().toSuiAddress()}`);
  console.log('- This allowlist will be used as security domain for documents');
  
  try {
    // Create a transaction
    const tx = new Transaction();
    
    // Set the sender
    tx.setSender(adminKeypair.getPublicKey().toSuiAddress());
    
    // Add the create_allowlist_entry call
    tx.moveCall({
      target: `${config.ALLOWLIST_PACKAGE_ID}::allowlist::create_allowlist_entry`,
      arguments: [tx.pure.string(name)]
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
        showEffects: true,
        showObjectChanges: true
      }
    });
    
    // Check result
    if (result.effects?.status?.status !== 'success') {
      throw new Error(`Transaction failed: ${result.effects?.status?.error}`);
    }
    
    // Extract the allowlist and cap IDs from the object changes
    console.log('- Extracting created objects from transaction result...');
    const allowlistObj = result.objectChanges?.find(change => 
      change.objectType && change.objectType.includes('::allowlist::Allowlist')
    );
    
    const capObj = result.objectChanges?.find(change => 
      change.objectType && change.objectType.includes('::allowlist::Cap')
    );
    
    if (!allowlistObj || !capObj) {
      throw new Error('Could not find allowlist or cap objects in transaction results');
    }
    
    const allowlistId = allowlistObj.objectId;
    const capId = capObj.objectId;
    
    console.log(` Allowlist created successfully`);
    console.log(`- Allowlist ID: ${allowlistId} - CRITICAL: needed for document ID generation`);
    console.log(`- Cap ID: ${capId} - Required for admin operations`);
    console.log(`- Transaction digest: ${result.digest}`);

    // Wait for transaction finality before returning
    await utils.waitForTransactionFinality(client, result.digest);
    
    return {
      allowlistId,
      capId,
      tx: result
    };
  } catch (error) {
    console.error(`Failed to create allowlist: ${error.message}`);
    console.error(error.stack);
    throw error;
  }
}

// Add a user to an allowlist
async function addUserToAllowlist(client, adminKeypair, allowlistId, capId, userAddress) {
  console.log('\n👥 STEP 2: Adding user to allowlist...');
  console.log(`- Allowlist ID: ${allowlistId}`);
  console.log(`- Cap ID: ${capId}`);
  console.log(`- User Address: ${userAddress}`);
  console.log('- This grants the user permission to access documents in this allowlist');
  
  try {
    // Log all input values
    console.log('Creating transaction with values:');
    console.log('- Admin public key:', adminKeypair.getPublicKey().toSuiAddress());
    console.log('- Allowlist package ID:', config.ALLOWLIST_PACKAGE_ID);
    console.log('- Allowlist ID:', allowlistId);
    console.log('- Cap ID:', capId); 
    console.log('- User address:', userAddress);

    // Create a transaction
    const tx = new Transaction();
    
    // Set the sender
    tx.setSender(adminKeypair.getPublicKey().toSuiAddress());
    
    // Add the add_user_entry call
    tx.moveCall({
      target: `${config.ALLOWLIST_PACKAGE_ID}::allowlist::add_users_entry`,
      arguments: [
        tx.object(allowlistId),
        tx.object(capId),
        tx.pure.vector('address', [userAddress]),
        tx.object('0x6')
      ]
    });
    // Build the transaction
    console.log('- Building transaction...');
    const txBytes = await tx.build({ client });
    console.log('- Transaction bytes:', txBytes);
    
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
    
    console.log(` User added to allowlist successfully`);
    console.log(`- Transaction digest: ${result.digest}`);
    
    return {
      tx: result
    };
  } catch (error) {
    console.error(` Failed to add user to allowlist: ${error.message}`);
    console.error(error.stack);
    throw error;
  }
}

// Add multiple users to an allowlist in one transaction
async function addMultipleUsersToAllowlist(client, adminKeypair, allowlistId, capId, userAddresses) {
  console.log('\n STEP 2: Adding multiple users to allowlist in one transaction...');
  console.log(`- Allowlist ID: ${allowlistId}`);
  console.log(`- Cap ID: ${capId}`);
  console.log(`- User Addresses: ${userAddresses.join(', ')}`);
  console.log(`- Number of users: ${userAddresses.length}`);
  console.log('- This grants multiple users permission to access documents');
  
  try {
    // Create a transaction
    const tx = new Transaction();
    
    // Set the sender
    tx.setSender(adminKeypair.getPublicKey().toSuiAddress());
    
    // Add the add_users_entry call (our batch operation)
    tx.moveCall({
      target: `${config.ALLOWLIST_PACKAGE_ID}::allowlist::add_users_entry`,
      arguments: [
        tx.object(allowlistId),
        tx.object(capId),
        tx.pure.vector('address', userAddresses.map(addr => addr)),
        tx.object('0x6')
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
    
    console.log(` ${userAddresses.length} users added to allowlist successfully`);
    console.log(`- Transaction digest: ${result.digest}`);
    
    return {
      tx: result
    };
  } catch (error) {
    console.error(`Failed to add multiple users to allowlist: ${error.message}`);
    console.error(error.stack);
    throw error;
  }
}

// Register blob and set permissions in one transaction
async function registerBlobAndSetPermissions(client, adminKeypair, allowlistId, capId, blobId, userAddresses) {
  console.log('\n STEP 7: Registering blob and setting permissions in one transaction...');
  console.log(`- Allowlist ID: ${allowlistId}`);
  console.log(`- Cap ID: ${capId}`);
  console.log(`- Blob ID: ${blobId}`);
  console.log(`- User Addresses: ${userAddresses.join(', ')}`);
  console.log(`- Number of users: ${userAddresses.length}`);
  console.log('- This combines user permission updates and document registration');
  
  try {
    // Create a transaction
    const tx = new Transaction();
    
    // Set the sender
    tx.setSender(adminKeypair.getPublicKey().toSuiAddress());
    
    // Add the add_users_and_publish_entry call (our batch operation)
    tx.moveCall({
      target: `${config.ALLOWLIST_PACKAGE_ID}::allowlist::add_users_and_publish_entry`,
      arguments: [
        tx.object(allowlistId),
        tx.object(capId),
        tx.pure.vector('address', userAddresses.map(addr => addr)),
        tx.pure.string(blobId),
        tx.object('0x6')
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
    
    console.log(` Blob registered and permissions set for ${userAddresses.length} users in one transaction`);
    console.log(`- Transaction digest: ${result.digest}`);
    
    return {
      tx: result
    };
  } catch (error) {
    console.error(`Failed to register blob and set permissions: ${error.message}`);
    console.error(error.stack);
    throw error;
  }
}

// Publish a blob to an allowlist
async function publishBlobToAllowlist(client, adminKeypair, allowlistId, capId, blobId) {
  console.log('\n STEP 7A: Publishing blob to allowlist...');
  console.log(`- Allowlist ID: ${allowlistId}`);
  console.log(`- Cap ID: ${capId}`);
  console.log(`- Blob ID: ${blobId}`);
  
  try {
    // Create a transaction
    const tx = new Transaction();
    
    // Set the sender
    tx.setSender(adminKeypair.getPublicKey().toSuiAddress());
    
    // Use add_users_and_publish_entry with empty users vector
    // since we've already added users in a previous step
    tx.moveCall({
      target: `${config.ALLOWLIST_PACKAGE_ID}::allowlist::add_users_and_publish_entry`,
      arguments: [
        tx.object(allowlistId),
        tx.object(capId),
        tx.pure.vector('address', []), // Empty vector since users already added
        tx.pure.string(blobId),
        tx.object('0x6')
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
    
    console.log(` Blob published to allowlist successfully`);
    console.log(`- Transaction digest: ${result.digest}`);
    
    return {
      tx: result
    };
  } catch (error) {
    console.error(` Failed to publish blob to allowlist: ${error.message}`);
    console.error(error.stack);
    throw error;
  }
}

// Update document access for specific users
async function updateDocumentAccess(client, adminKeypair, allowlistId, capId, blobId, userAddresses) {
  console.log('\n Updating document access permissions...');
  console.log(`- Allowlist ID: ${allowlistId}`);
  console.log(`- Cap ID: ${capId}`);
  console.log(`- Blob ID: ${blobId}`);
  console.log(`- User Addresses: ${userAddresses.join(', ')}`);
  
  try {
    // Create a transaction
    const tx = new Transaction();
    
    // Set the sender
    tx.setSender(adminKeypair.getPublicKey().toSuiAddress());
    
    // Add the add_users_entry call
    tx.moveCall({
      target: `${config.ALLOWLIST_PACKAGE_ID}::allowlist::add_users_entry`,
      arguments: [
        tx.object(allowlistId),
        tx.object(capId),
        tx.pure.vector('address', userAddresses.map(addr => addr)),
        tx.object('0x6')
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
    
    console.log(` Document access updated successfully for ${userAddresses.length} users`);
    console.log(`- Transaction digest: ${result.digest}`);
    
    return {
      tx: result
    };
  } catch (error) {
    console.error(` Failed to update document access: ${error.message}`);
    console.error(error.stack);
    throw error;
  }
}

module.exports = {
  createAllowlist,
  addUserToAllowlist,
  addMultipleUsersToAllowlist,
  registerBlobAndSetPermissions,
  publishBlobToAllowlist,
  updateDocumentAccess
};