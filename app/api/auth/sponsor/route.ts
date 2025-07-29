import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { fromB64, toB64 } from '@mysten/sui/utils';
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
    throw new Error(`Failed to decode private key: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sender, allowlistId, ephemeralAddress, documentId, validityMs } = body;
    
    // Validate required parameters
    const missingParams = [];
    if (!sender) missingParams.push('sender');
    if (!allowlistId) missingParams.push('allowlistId');
    if (!ephemeralAddress) missingParams.push('ephemeralAddress');
    if (!documentId) missingParams.push('documentId');
    
    if (missingParams.length > 0) {
      return NextResponse.json(
        { error: `Missing required parameters: ${missingParams.join(', ')}` }, 
        { status: 400 }
      );
    }

    // Get package ID from environment
    const packageId = process.env.SEAL_PACKAGE_ID || process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID;
    if (!packageId) {
      return NextResponse.json(
        { error: 'Allowlist package ID not configured' }, 
        { status: 500 }
      );
    }

    // Get admin private key from server environment
    const adminPrivateKeyBech32 = process.env.ADMIN_PRIVATE_KEY;
    if (!adminPrivateKeyBech32) {
      return NextResponse.json(
        { error: 'Admin private key not configured' }, 
        { status: 500 }
      );
    }
    
    // Decode bech32 private key
    const adminPrivateKeyBytes = decodeSuiPrivateKey(adminPrivateKeyBech32);
    const adminKeypair = Ed25519Keypair.fromSecretKey(adminPrivateKeyBytes);
    const adminAddress = adminKeypair.getPublicKey().toSuiAddress();
    
    // Initialize Sui client
    const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
    
    // Find a gas coin owned by the admin/sponsor
    const coins = await suiClient.getCoins({
      owner: adminAddress,
      coinType: '0x2::sui::SUI',
    });

    if (coins.data.length === 0) {
      return NextResponse.json(
        { error: 'Sponsor has no SUI coins to pay for gas' },
        { status: 500 }
      );
    }

    // Use the first coin as gas payment
    const gasCoin = coins.data[0];
    
    // Create new transaction with the same operations
    const tx = new Transaction();
    tx.setSender(sender);
    
    // Add the same Move call
    const effectiveValidityMs = validityMs || 3600000; // 1 hour default
    tx.moveCall({
      target: `${packageId}::allowlist::authorize_ephemeral_key`,
      arguments: [
        tx.object(allowlistId),
        tx.pure.address(ephemeralAddress),
        tx.pure.string(documentId),
        tx.pure.u64(effectiveValidityMs),
        tx.object('0x6')
      ],
    });
    
    // Set gas configuration
    tx.setGasPayment([{
      objectId: gasCoin.coinObjectId,
      version: gasCoin.version,
      digest: gasCoin.digest
    }]);
    tx.setGasOwner(adminAddress);
    tx.setGasBudget(30000000);
    
    // Build the sponsored transaction bytes
    const sponsoredTxBytes = await tx.build({ client: suiClient });
    
    // Return the sponsored transaction bytes to the client
    const response = { sponsoredTxBytes: toB64(sponsoredTxBytes) };
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to sponsor transaction: ${error instanceof Error ? error.message : String(error)}` }, 
      { status: 500 }
    );
  }
} 