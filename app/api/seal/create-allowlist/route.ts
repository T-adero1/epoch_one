import { NextRequest, NextResponse } from 'next/server';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { PrismaClient } from '@prisma/client';
import { bech32 } from 'bech32';
import { generatePredeterminedWalletForAllowlist } from '@/app/utils/predeterminedWallet';

// Add Prisma client
const prisma = new PrismaClient();

// Constants
const SEAL_PACKAGE_ID = process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID || '0xb5c84864a69cb0b495caf548fa2bf0d23f6b69b131fa987d6f896d069de64429';

const MODULE_NAME = 'allowlist';
const NETWORK = 'testnet';

// Helper function to check if a string is a valid Sui address
function isValidSuiAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(address);
}

// Helper function to check if a string looks like a hashed identifier
function isHashedIdentifier(input: string): boolean {
  // Hashed identifiers will be long hex-like strings that aren't valid Sui addresses
  return input.length > 40 && !isValidSuiAddress(input) && !input.includes('@');
}



// Function to verify objects exist before proceeding
async function verifyObjectsExist(client: SuiClient, objectIds: string[], maxAttempts = 10) {
  console.log(`[API] Verifying ${objectIds.length} objects exist and are available...`);
  
  // First try with the primary client
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Get multiple objects in a single call
      const objects = await client.multiGetObjects({
        ids: objectIds,
        options: { showContent: true }
      });
      
      // 🔍 LOG THE FULL NODE RESPONSE
      console.log(`\n📋 PRIMARY NODE RESPONSE (Attempt ${attempt}):`);
      console.log(JSON.stringify(objects, null, 2));
      
      // Check if all objects exist and are valid
      const allExist = objects.every(obj => 
        obj && 
        obj.data && 
        !obj.error && 
        obj.data.content !== null
      );
      
      if (allExist) {
        console.log('✅ [API] All objects verified and available on primary node');
        return true;
      }
      
      console.log(`⚠️ [API] Primary node attempt ${attempt}/${maxAttempts} - Some objects not available yet`);
      
      // If not all exist, wait a moment before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (e: any) {
      console.log(`❌ [API] Error with primary node: ${e.message}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // If primary node failed, try with backup node
  const backupRpcUrl = process.env.SUI_RPC_URL2;
  if (backupRpcUrl) {
    console.log(`🔄 [API] Primary node failed after ${maxAttempts} attempts, trying backup node: ${backupRpcUrl}`);
    
    const backupClient = new SuiClient({ url: backupRpcUrl });
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Get multiple objects in a single call with backup client
        const objects = await backupClient.multiGetObjects({
          ids: objectIds,
          options: { showContent: true }
        });
        
        // 🔍 LOG THE BACKUP NODE RESPONSE
        console.log(`\n📋 BACKUP NODE RESPONSE (Attempt ${attempt}):`);
        console.log(JSON.stringify(objects, null, 2));
        
        // Check if all objects exist and are valid
        const allExist = objects.every(obj => 
          obj && 
          obj.data && 
          !obj.error && 
          obj.data.content !== null
        );
        
        if (allExist) {
          console.log('✅ [API] All objects verified and available on backup node');
          return true;
        }
        
        console.log(`⚠️ [API] Backup node attempt ${attempt}/${maxAttempts} - Some objects not available yet`);
        
        // If not all exist, wait a moment before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (e: any) {
        console.log(`❌ [API] Error with backup node: ${e.message}`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.error(`❌ [API] Both primary and backup nodes failed after ${maxAttempts} attempts each`);
    throw new Error(`Objects [${objectIds.join(', ')}] not available after ${maxAttempts * 2} total attempts across 2 nodes`);
  } else {
    console.error(`❌ [API] Primary node failed and no backup node configured (SUI_RPC_URL2 not set)`);
    throw new Error(`Objects [${objectIds.join(', ')}] not available after ${maxAttempts} attempts on primary node`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { contractId, signerAddresses } = body;
    
    if (!contractId || !signerAddresses || !Array.isArray(signerAddresses)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    console.log('[API] Creating allowlist for contract:', contractId);
    console.log('[API] Signer inputs (privacy-preserving):', signerAddresses.map(addr => addr.substring(0, 8) + '...'));
    
    // ENHANCED: Separate hashed emails and wallet addresses, then resolve
    const walletAddresses: string[] = [];
    const addressSources: { input: string; type: 'hashed_email' | 'wallet'; source: 'predetermined' | 'direct'; address: string }[] = [];
    
    if (signerAddresses.length > 0) {
      console.log('[API] Processing signer inputs...');
      
      // Separate hashed emails from wallet addresses
      const hashedEmails: string[] = [];
      const directWalletAddresses: string[] = [];
      
      for (const input of signerAddresses) {
        if (isValidSuiAddress(input)) {
          console.log(`[API] Detected wallet address: ${input.substring(0, 8)}...`);
          directWalletAddresses.push(input);
          walletAddresses.push(input);
          addressSources.push({ input, type: 'wallet', source: 'direct', address: input });
        } else if (isHashedIdentifier(input)) {
          console.log(`[API] Detected hashed email identifier: ${input.substring(0, 8)}...`);
          hashedEmails.push(input);
        } else {
          console.warn(`[API] Invalid input (not hashed email or wallet): ${input.substring(0, 8)}...`);
        }
      }
      
      // Process hashed emails if any
      if (hashedEmails.length > 0) {
        console.log('[API] Generating predetermined wallets for hashed email identifiers...');
        
        // Generate predetermined wallets for each hashed email
        for (const hashedEmail of hashedEmails) {
          try {
            console.log(`[API] Generating predetermined wallet for hashed identifier: ${hashedEmail.substring(0, 8)}...`);
            
            // **UPDATED: Use hashed email as the identifier for predetermined wallet generation**
            const predeterminedResult = generatePredeterminedWalletForAllowlist(
              hashedEmail, // Use hashed email as identifier
              contractId, 
              'allowlist-creation'
            );
            const predeterminedAddress = predeterminedResult.predeterminedAddress;
            
            walletAddresses.push(predeterminedAddress);
            addressSources.push({ 
              input: hashedEmail, 
              type: 'hashed_email', 
              source: 'predetermined', 
              address: predeterminedAddress,
              context: 'allowlist-creation' // Track context
            });
            console.log(`[API] Generated predetermined wallet: ${hashedEmail.substring(0, 8)}... -> ${predeterminedAddress.substring(0, 8)}...`);
          } catch (predeterminedError) {
            console.error(`[API] Failed to generate predetermined wallet for hashed identifier ${hashedEmail.substring(0, 8)}...:`, predeterminedError);
            console.warn(`[API] Skipping hashed identifier due to predetermined wallet generation failure`);
          }
        }
      }
      
      console.log('[API] Final wallet addresses for allowlist:', walletAddresses.map(addr => addr.substring(0, 8) + '...'));
      console.log('[API] Address sources:', addressSources.map(source => ({
        type: source.type,
        source: source.source,
        inputPreview: source.input.substring(0, 8) + '...',
        addressPreview: source.address.substring(0, 8) + '...'
      })));
    }
    
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
    
    // Create unique allowlist name
    const allowlistName = `Contract-${contractId}-${Date.now()}`;
    console.log('[API] Allowlist name:', allowlistName);
    
    // Create transaction
    const tx = new Transaction();
    tx.setSender(adminAddress);
    
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
    
    // Verify objects exist before proceeding
    console.log('[API] Verifying allowlist objects are available...');
    await verifyObjectsExist(suiClient, [allowlistId, capId]);
    
    // Add signers to allowlist using resolved wallet addresses
    if (walletAddresses.length > 0) {
      console.log('[API] Adding users to allowlist...');
      console.log('[API] Using wallet addresses:', walletAddresses);
      
      const addSignersTx = new Transaction();
      addSignersTx.setSender(adminAddress);
      
      addSignersTx.moveCall({
        target: `${SEAL_PACKAGE_ID}::${MODULE_NAME}::add_users_entry`,
        arguments: [
          addSignersTx.object(allowlistId),
          addSignersTx.object(capId),
          addSignersTx.pure.vector('address', walletAddresses),
          addSignersTx.object('0x6') // Clock object
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
    
    // Return enhanced allowlist information
    return NextResponse.json({
      success: true,
      allowlistId,
      capId,
      name: allowlistName,
      signerCount: walletAddresses.length,
      walletAddresses,
      addressSources: addressSources.map(source => ({
        type: source.type,
        source: source.source,
        inputPreview: source.input.substring(0, 8) + '...',
        addressPreview: source.address.substring(0, 8) + '...'
      })),
      summary: {
        hashedEmails: addressSources.filter(s => s.type === 'hashed_email').length,
        wallets: addressSources.filter(s => s.type === 'wallet').length,
        predetermined: addressSources.filter(s => s.source === 'predetermined').length,
        direct: addressSources.filter(s => s.source === 'direct').length,
        total: addressSources.length
      },
      authorizedUsers: walletAddresses
    });
    
  } catch (error: any) {
    console.error('[API] Error creating allowlist:', error);
    return NextResponse.json(
      { error: `Failed to create allowlist: ${error.message}` },
      { status: 500 }
    );
  } finally {
    // Disconnect Prisma client
    await prisma.$disconnect();
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