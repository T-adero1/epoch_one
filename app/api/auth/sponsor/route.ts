import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { toB64 } from '@mysten/sui/utils';
import { NextRequest, NextResponse } from 'next/server';
import { bech32 } from 'bech32';

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
  try {
    // Log the start of the endpoint call
    console.log("[API][sponsor] Sponsor endpoint called");
    
    const body = await request.json();
    console.log("[API][sponsor] Received request body:", {
      // Log only the keys to avoid logging sensitive info
      keys: Object.keys(body),
      sender: body.sender,
      hasAllowlistId: !!body.allowlistId,
      hasEphemeralAddress: !!body.ephemeralAddress,
      hasDocumentId: !!body.documentId,
      hasEncryptedJWT: !!body.encryptedJWT
    });
    
    const { sender, allowlistId, ephemeralAddress, documentId, validityMs, encryptedJWT, jwtExpiryMs } = body;
    
    // Validate required parameters
    const missingParams = [];
    if (!sender) missingParams.push('sender');
    if (!allowlistId) missingParams.push('allowlistId');
    if (!ephemeralAddress) missingParams.push('ephemeralAddress');
    if (!documentId) missingParams.push('documentId');
    
    if (missingParams.length > 0) {
      console.error(`[API][sponsor] Missing required parameters: ${missingParams.join(', ')}`);
      return NextResponse.json(
        { error: `Missing required parameters: ${missingParams.join(', ')}` }, 
        { status: 400 }
      );
    }

    // Get package ID from environment
    const packageId = process.env.SEAL_PACKAGE_ID || process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID;
    if (!packageId) {
      console.error('[API][sponsor] Allowlist package ID not configured');
      return NextResponse.json(
        { error: 'Allowlist package ID not configured' }, 
        { status: 500 }
      );
    }
    console.log(`[API][sponsor] Using package ID: ${packageId}`);

    // Get admin private key from server environment
    const adminPrivateKeyBech32 = process.env.ADMIN_PRIVATE_KEY;
    if (!adminPrivateKeyBech32) {
      console.error('[API][sponsor] Admin private key not configured');
      return NextResponse.json(
        { error: 'Admin private key not configured' }, 
        { status: 500 }
      );
    }
    console.log('[API][sponsor] Admin private key available');
    
    // Decode bech32 private key
    console.log('[API][sponsor] Decoding admin private key');
    const adminPrivateKeyBytes = decodeSuiPrivateKey(adminPrivateKeyBech32);
    const adminKeypair = Ed25519Keypair.fromSecretKey(adminPrivateKeyBytes);
    const adminAddress = adminKeypair.getPublicKey().toSuiAddress();
    console.log(`[API][sponsor] Admin address: ${adminAddress}`);
    
    // Initialize Sui client
    console.log('[API][sponsor] Initializing Sui client');
    const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
    
    // Find a gas coin owned by the admin/sponsor
    console.log(`[API][sponsor] Finding gas payment coins for sponsor ${adminAddress}`);
    const coins = await suiClient.getCoins({
      owner: adminAddress,
      coinType: '0x2::sui::SUI',
    });

    if (coins.data.length === 0) {
      console.error('[API][sponsor] Sponsor has no SUI coins to pay for gas');
      return NextResponse.json(
        { error: 'Sponsor has no SUI coins to pay for gas' },
        { status: 500 }
      );
    }
    console.log(`[API][sponsor] Found ${coins.data.length} coins for sponsor`);

    // Use the first coin as gas payment
    const gasCoin = coins.data[0];
    console.log(`[API][sponsor] Using gas coin: ${gasCoin.coinObjectId}, version: ${gasCoin.version}`);
    
    // Create new transaction with the same operations
    console.log('[API][sponsor] Creating new transaction');
    const tx = new Transaction();
    tx.setSender(sender);
    
    // Add the same Move call
    console.log('[API][sponsor] Adding Move call to transaction');
    const effectiveValidityMs = validityMs || 3600000; // 1 hour default
    tx.moveCall({
      target: `${packageId}::allowlist::authorize_ephemeral_key`,
      arguments: [
        tx.object(allowlistId),
        tx.pure.address(ephemeralAddress),
        tx.pure.string(encryptedJWT),
        tx.pure.u64(jwtExpiryMs),
        tx.pure.string(documentId),
        tx.pure.u64(effectiveValidityMs),
        tx.object('0x6')
      ],
    });
    
    // Set gas configuration
    console.log('[API][sponsor] Setting gas configuration');
    tx.setGasPayment([{
      objectId: gasCoin.coinObjectId,
      version: gasCoin.version,
      digest: gasCoin.digest
    }]);
    tx.setGasOwner(adminAddress);
    tx.setGasBudget(30000000);
    
    // Build the sponsored transaction bytes
    console.log('[API][sponsor] Building transaction');
    const sponsoredTxBytes = await tx.build({ client: suiClient });
    console.log('[API][sponsor] Transaction built successfully');
    
    // Return the sponsored transaction bytes to the client
    const response = { sponsoredTxBytes: toB64(sponsoredTxBytes) };
    console.log('[API][sponsor] Returning sponsored transaction bytes');
    return NextResponse.json(response);
  } catch (error) {
    console.error('[API][sponsor] Sponsor transaction error:', error);
    return NextResponse.json(
      { error: `Failed to sponsor transaction: ${error instanceof Error ? error.message : String(error)}` }, 
      { status: 500 }
    );
  }
}  