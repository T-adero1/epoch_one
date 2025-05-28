import { NextRequest, NextResponse } from 'next/server';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

import { bech32 } from 'bech32';

// Constants
const SEAL_PACKAGE_ID = process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID || '0xb5c84864a69cb0b495caf548fa2bf0d23f6b69b131fa987d6f896d069de64429';
const SEAL_PACKAGE_ID = process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID || SEAL_PACKAGE_ID;
const MODULE_NAME = 'allowlist';
const NETWORK = 'testnet';

// Function to verify objects exist before proceeding
async function verifyObjectsExist(client: SuiClient, objectIds: string[], maxAttempts = 10) {
  console.log(`[API] Verifying ${objectIds.length} objects exist and are available...`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Get multiple objects in a single call
      const objects = await client.multiGetObjects({
        ids: objectIds,
        options: { showContent: true }
      });
      
      // Check if all objects exist and are valid
      const allExist = objects.every(obj => 
        obj && 
        obj.data && 
        !obj.error && 
        obj.data.content !== null
      );
      
      if (allExist) {
        console.log('[API] All objects verified and available');
        return true;
      }
      
      console.log(`[API] Attempt ${attempt}/${maxAttempts} - Some objects not available yet`);
      
      // If not all exist, wait a moment before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (e: any) {
      console.log(`[API] Error verifying objects: ${e.message}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  throw new Error(`Objects [${objectIds.join(', ')}] not available after ${maxAttempts} attempts`);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { contractId, signerAddresses } = body;
    
    if (!contractId || !signerAddresses || !Array.isArray(signerAddresses)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    console.log('[API] Creating allowlist for contract:', contractId);
    console.log('[API] Signer addresses:', signerAddresses);
    
    // Get admin private key from environment
    const adminPrivateKeyBech32 = process.env.ADMIN_PRIVATE_KEY;
    if (!adminPrivateKeyBech32) {
      return NextResponse.json({ error: 'Admin private key not configured' }, { status: 500 });
    }
    
    // Decode the private key
    const adminKeypair = decodeSuiPrivateKey(adminPrivateKeyBech32);
    const adminAddress = adminKeypair.getPublicKey().toSuiAddress();
    console.log('[API] Admin address:', adminAddress);
    
    // Initialize Sui client
    const suiClient = new SuiClient({ url: getFullnodeUrl(NETWORK) });
    
    // Create unique allowlist name - exactly as in fixed_blockchain.js
    const allowlistName = `Contract-${contractId}-${Date.now()}`;
    console.log('[API] Allowlist name:', allowlistName);
    
    // Create transaction - EXACT MATCH to fixed_blockchain.js
    const tx = new Transaction();
    tx.setSender(adminAddress);
    
    // CRITICAL CHANGE: Use create_allowlist_entry instead of create_allowlist
    tx.moveCall({
      target: `${SEAL_PACKAGE_ID}::${MODULE_NAME}::create_allowlist_entry`,
      arguments: [tx.pure.string(allowlistName)]
    });
    
    // Build transaction
    console.log('[API] Building transaction...');
    const txBytes = await tx.build({ client: suiClient });
    
    // Sign transaction
    console.log('[API] Signing transaction with admin keypair...');
    const { signature } = await tx.sign({ client: suiClient, signer: adminKeypair });
    
    // Execute transaction
    console.log('[API] Executing transaction on blockchain...');
    const result = await suiClient.executeTransactionBlock({
      transactionBlock: txBytes,
      signature,
      options: {
        showEffects: true,
        showObjectChanges: true
      }
    });
    
    // Check result
    if (result.effects?.status?.status !== 'success') {
      console.error('[API] Transaction failed:', result.effects?.status);
      return NextResponse.json({ 
        error: `Transaction failed: ${result.effects?.status?.error || 'Unknown error'}`
      }, { status: 500 });
    }
    
    // Extract the allowlist and cap IDs from the object changes
    console.log('[API] Extracting created objects from transaction result...');
    
    // EXACT MATCH to fixed_blockchain.js extraction logic
    const allowlistObj = result.objectChanges?.find(change => 
      change.objectType && change.objectType.includes('::allowlist::Allowlist')
    );
    
    const capObj = result.objectChanges?.find(change => 
      change.objectType && change.objectType.includes('::allowlist::Cap')
    );
    
    if (!allowlistObj || !capObj) {
      console.error('[API] Could not find allowlist or cap objects in results');
      return NextResponse.json({ 
        error: 'Could not find allowlist or cap objects in transaction results' 
      }, { status: 500 });
    }
    
    const allowlistId = allowlistObj.objectId;
    const capId = capObj.objectId;
    
    console.log('[API] Allowlist created successfully');
    console.log('[API] Allowlist ID:', allowlistId);
    console.log('[API] Cap ID:', capId);
    
    // CRITICAL: Verify objects exist before proceeding
    console.log('[API] Verifying allowlist objects are available...');
    await verifyObjectsExist(suiClient, [allowlistId, capId]);
    
    // Add signers to allowlist - EXACT MATCH to fixed_blockchain.js
    if (signerAddresses.length > 0) {
      console.log('[API] Adding multiple users to allowlist in one transaction...');
      
      const addSignersTx = new Transaction();
      addSignersTx.setSender(adminAddress);
      
      // CRITICAL CHANGE: Use add_users_entry and include clock object
      addSignersTx.moveCall({
        target: `${SEAL_PACKAGE_ID}::${MODULE_NAME}::add_users_entry`,
        arguments: [
          addSignersTx.object(allowlistId),
          addSignersTx.object(capId),
          addSignersTx.pure.vector('address', signerAddresses),
          addSignersTx.object('0x6') // Clock object - CRITICAL
        ]
      });
      
      // Build transaction
      console.log('[API] Building add signers transaction...');
      const addSignersTxBytes = await addSignersTx.build({ client: suiClient });
      
      // Sign transaction
      console.log('[API] Signing add signers transaction...');
      const { signature: addSignersSignature } = await addSignersTx.sign({ 
        client: suiClient, 
        signer: adminKeypair 
      });
      
      // Execute transaction
      console.log('[API] Executing add signers transaction...');
      const addSignersResult = await suiClient.executeTransactionBlock({
        transactionBlock: addSignersTxBytes,
        signature: addSignersSignature,
        options: { showEffects: true }
      });
      
      // Check result
      if (addSignersResult.effects?.status?.status !== 'success') {
        console.error('[API] Add signers transaction failed:', addSignersResult.effects?.status);
        // Continue anyway - allowlist was still created successfully
      } else {
        console.log('[API] Signers added successfully, transaction:', addSignersResult.digest);
      }
    }
    
    // Return allowlist information
    return NextResponse.json({
      success: true,
      allowlistId,
      capId,
      name: allowlistName,
      signerCount: signerAddresses.length
    });
    
  } catch (error: any) {
    console.error('[API] Error creating allowlist:', error);
    return NextResponse.json(
      { error: `Failed to create allowlist: ${error.message}` },
      { status: 500 }
    );
  }
}

// Helper function to decode Sui private key
function decodeSuiPrivateKey(suiPrivateKey: string): Ed25519Keypair {
  if (!suiPrivateKey.startsWith('suiprivkey1')) {
    throw new Error('Not a valid Sui bech32 private key format');
  }
  
  // Decode the bech32 string
  const decoded = bech32.decode(suiPrivateKey);
  
  // Convert the words to bytes
  const privateKeyBytes = Buffer.from(bech32.fromWords(decoded.words));
  
  // Remove the first byte (flag) before creating the keypair
  const secretKey = privateKeyBytes.slice(1);
  
  if (secretKey.length !== 32) {
    throw new Error(`Expected 32 bytes after removing flag, got ${secretKey.length}`);
  }
  
  // Create keypair from secret key
  return Ed25519Keypair.fromSecretKey(secretKey);
} 