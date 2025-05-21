import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { fromB64 } from '@mysten/sui/utils';
import { NextRequest, NextResponse } from 'next/server';
import { bech32 } from 'bech32';
import { Transaction } from '@mysten/sui/transactions';

// Utility function to decode a Sui bech32 private key
function decodeSuiPrivateKey(suiPrivateKey: string): Uint8Array {
  try {
    if (!suiPrivateKey.startsWith('suiprivkey1')) {
      throw new Error('Not a valid Sui bech32 private key format');
    }
    
    // Decode the bech32 string
    const decoded = bech32.decode(suiPrivateKey);
    
    // Convert the words to bytes
    const privateKeyBytes = Buffer.from(bech32.fromWords(decoded.words));
    
    // IMPORTANT: Remove the first byte (flag) before creating the keypair
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
    const body = await request.json();
    const { sponsoredTxBytes, zkLoginSignature } = body;
    
    if (!sponsoredTxBytes || !zkLoginSignature) {
      return NextResponse.json(
        { error: 'Missing required parameters' }, 
        { status: 400 }
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
    
    // Initialize Sui client
    const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
    
    // Sign with admin key - NO REBUILDING of transaction
    const txBlock = Transaction.from(fromB64(sponsoredTxBytes));
    const { signature: sponsorSignature } = await txBlock.sign({
      client: suiClient,
      signer: adminKeypair
    });
    
    // Submit transaction with both signatures
    const result = await suiClient.executeTransactionBlock({
      transactionBlock: sponsoredTxBytes,
      signature: [zkLoginSignature, sponsorSignature],
      options: { showEffects: true, showEvents: true }
    });
    
    // Return the transaction digest to the client
    return NextResponse.json({ digest: result.digest });
  } catch (error) {
    console.error('Execute transaction error:', error);
    return NextResponse.json(
      { error: `Failed to execute transaction: ${error instanceof Error ? error.message : String(error)}` }, 
      { status: 500 }
    );
  }
} 