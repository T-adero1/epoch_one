import { NextRequest, NextResponse } from 'next/server';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromB64 } from '@mysten/sui/utils';
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
    const body = await request.json();
    const { 
      contractId,
      isEncrypted, 
      encryptedContent, 
      documentId,
      signerAddresses,
      tempAllowlistId
    } = body;
    
    // Validate required fields
    if (!contractId || !encryptedContent || !documentId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // Verify the content is actually pre-encrypted
    if (!isEncrypted) {
      return NextResponse.json(
        { error: 'Content must be pre-encrypted' },
        { status: 400 }
      );
    }
    
    console.log(`Received pre-encrypted document for contract: ${contractId}`);
    console.log(`Document ID: ${documentId}`);
    console.log(`Encrypted content length: ${encryptedContent.length}`);
    
    // Get admin key for blockchain operations
    const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY;
    if (!adminPrivateKey) {
      return NextResponse.json(
        { error: 'Admin private key not configured' },
        { status: 500 }
      );
    }
    
    // Initialize Sui client
    const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
    
    // Decode the admin private key
    const adminKeyBytes = decodeSuiPrivateKey(adminPrivateKey);
    const adminKeypair = Ed25519Keypair.fromSecretKey(adminKeyBytes);
    const adminAddress = adminKeypair.getPublicKey().toSuiAddress();
    
    console.log(`Admin address: ${adminAddress}`);
    
    // Decode the encrypted content
    const encryptedBytes = fromB64(encryptedContent);
    
    // **IMPORTANT**: This is where we would normally encrypt the document
    // Since we're receiving already-encrypted data, we skip that step
    console.log(`Document is already encrypted (${encryptedBytes.length} bytes)`);
    
    // Upload encrypted data to Walrus
    // For this example, we'll just mock this step
    const blobId = `mock-blob-${Date.now()}`; // Normally comes from actual upload
    
    // Create or use existing allowlist in blockchain
    const allowlistId = process.env.ALLOWLIST_ID || tempAllowlistId;
    const capId = process.env.CAP_ID || 'mock-cap-id';
    
    console.log(`Using allowlist ID: ${allowlistId}`);
    console.log(`Using capability ID: ${capId}`);
    
    // Update the database with metadata
    // For this example, we'll just prepare the response
    // In a real implementation, you would update your database
    
    // Prepare walrus data
    const walrusData = {
      blobId,
      allowlistId,
      documentId,
      capId,
      encryptionMethod: 'seal',
      authorizedWallets: signerAddresses || [],
      uploadedAt: new Date().toISOString()
    };
    
    // Prepare the response
    const responseData = {
      success: true,
      contractId,
      encrypted: true,
      blobId,
      allowlistId,
      documentId,
      capId,
      walrusData
    };
    
    return NextResponse.json(responseData);
    
  } catch (error) {
    console.error('Error processing encrypted upload:', error);
    return NextResponse.json(
      { 
        error: `Failed to process encrypted upload: ${error instanceof Error ? error.message : 'Unknown error'}` 
      },
      { status: 500 }
    );
  }
} 