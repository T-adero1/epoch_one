import { NextRequest, NextResponse } from 'next/server';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { bech32 } from 'bech32';

// Constants
const SEAL_PACKAGE_ID = process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID || '0xb5c84864a69cb0b495caf548fa2bf0d23f6b69b131fa987d6f896d069de64429';
const MODULE_NAME = 'allowlist';
const NETWORK = 'testnet';

// Utility function to decode a Sui bech32 private key
function decodeSuiPrivateKey(suiPrivateKey: string): Uint8Array {
  try {
    if (!suiPrivateKey.startsWith('suiprivkey1')) {
      throw new Error('Not a valid Sui bech32 private key format');
    }
    
    const decoded = bech32.decode(suiPrivateKey);
    const privateKeyBytes = Buffer.from(bech32.fromWords(decoded.words));
    const secretKey = privateKeyBytes.slice(1);
    
    if (secretKey.length !== 32) {
      throw new Error(`Expected 32 bytes after removing flag, got ${secretKey.length}`);
    }
    
    return new Uint8Array(secretKey);
  } catch (error) {
    console.error('Error decoding private key:', error);
    throw new Error(`Failed to decode private key: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function POST(request: NextRequest) {
  console.log('[API] Cleanup allowlist endpoint called');
  
  try {
    const body = await request.json();
    const { allowlistId } = body;
    
    console.log('[API] Received request:', { allowlistId });
    
    // Validate required parameters
    if (!allowlistId) {
      console.error('[API] Missing required parameter: allowlistId');
      return NextResponse.json(
        { error: 'Missing required parameter: allowlistId' }, 
        { status: 400 }
      );
    }

    // Get admin private key from environment
    const adminPrivateKeyBech32 = process.env.ADMIN_PRIVATE_KEY;
    if (!adminPrivateKeyBech32) {
      console.error('[API] Admin private key not configured');
      return NextResponse.json(
        { error: 'Admin private key not configured' }, 
        { status: 500 }
      );
    }
    console.log('[API] Admin private key available');
    
    // Decode bech32 private key
    console.log('[API] Decoding admin private key');
    const adminPrivateKeyBytes = decodeSuiPrivateKey(adminPrivateKeyBech32);
    const adminKeypair = Ed25519Keypair.fromSecretKey(adminPrivateKeyBytes);
    const adminAddress = adminKeypair.getPublicKey().toSuiAddress();
    console.log(`[API] Admin address: ${adminAddress}`);
    
    // Initialize Sui client
    console.log('[API] Initializing Sui client');
    const suiClient = new SuiClient({ url: getFullnodeUrl(NETWORK) });
    
    // Find a gas coin owned by the admin
    console.log(`[API] Finding gas payment coins for admin ${adminAddress}`);
    const coins = await suiClient.getCoins({
      owner: adminAddress,
      coinType: '0x2::sui::SUI',
    });

    if (coins.data.length === 0) {
      console.error('[API] Admin has no SUI coins to pay for gas');
      return NextResponse.json(
        { error: 'Admin has no SUI coins to pay for gas' },
        { status: 500 }
      );
    }
    console.log(`[API] Found ${coins.data.length} coins for admin`);

    // Use the first coin as gas payment
    const gasCoin = coins.data[0];
    console.log(`[API] Using gas coin: ${gasCoin.coinObjectId}, version: ${gasCoin.version}`);
    
    // Create transaction
    console.log('[API] Creating cleanup transaction');
    const tx = new Transaction();
    tx.setSender(adminAddress);
    
    // Add the cleanup Move call
    console.log('[API] Adding cleanup Move call to transaction');
    tx.moveCall({
      target: `${SEAL_PACKAGE_ID}::${MODULE_NAME}::clean_expired_keys`,
      arguments: [
        tx.object(allowlistId),  // allowlist object
        tx.object('0x6')         // clock object (shared system object)
      ],
    });
    
    // Set gas configuration
    console.log('[API] Setting gas configuration');
    tx.setGasPayment([{
      objectId: gasCoin.coinObjectId,
      version: gasCoin.version,
      digest: gasCoin.digest
    }]);
    tx.setGasOwner(adminAddress);
    tx.setGasBudget(30000000); // 30M MIST budget
    
    // Build transaction
    console.log('[API] Building transaction...');
    const txBytes = await tx.build({ client: suiClient });
    
    // Sign transaction
    console.log('[API] Signing transaction with admin keypair...');
    const { signature } = await tx.sign({ client: suiClient, signer: adminKeypair });
    
    // Execute transaction
    console.log('[API] Executing cleanup transaction on blockchain...');
    const result = await suiClient.executeTransactionBlock({
      transactionBlock: txBytes,
      signature,
      options: {
        showEffects: true,
        showEvents: true,
        showObjectChanges: true
      }
    });
    
    console.log('[API] Cleanup transaction completed successfully');
    console.log(`[API] Transaction digest: ${result.digest}`);
    
    // Check if transaction succeeded
    if (result.effects?.status?.status === 'success') {
      console.log('[API] Cleanup operation succeeded');
      
      // Look for cleanup events in the transaction
      const cleanupEvents = result.events?.filter(event => 
        event.type?.includes('EphemeralKeyExpired')
      ) || [];
      
      return NextResponse.json({
        success: true,
        message: 'Allowlist cleanup completed successfully',
        transactionDigest: result.digest,
        expiredKeysRemoved: cleanupEvents.length,
        events: cleanupEvents,
        effects: result.effects
      });
    } else {
      console.error('[API] Cleanup transaction failed:', result.effects?.status);
      return NextResponse.json(
        { 
          error: 'Cleanup transaction failed', 
          details: result.effects?.status,
          transactionDigest: result.digest
        }, 
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error('[API] Cleanup operation error:', error);
    return NextResponse.json(
      { error: `Failed to cleanup allowlist: ${error instanceof Error ? error.message : String(error)}` }, 
      { status: 500 }
    );
  }
} 