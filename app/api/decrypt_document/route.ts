import { NextResponse } from 'next/server';
import { log } from '@/app/utils/logger';
import { prisma } from '@/app/utils/db';
import { getSealPackageId } from '@/app/utils/sealEncryption';


// Constants
const NETWORK = 'testnet';
const MODULE_NAME = 'document_sharing';
const SEAL_PACKAGE_ID = getSealPackageId();

export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    // Extract data from request
    const { contractId, userAddress, encryptedDocument, symmetricKey } = data;
    
    // Validate required fields
    if (!contractId || !encryptedDocument || (!userAddress && !symmetricKey)) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // If symmetric key is provided, use it for decryption (backup method)
    if (symmetricKey) {
      // This would typically be implemented with the SEAL CLI
      // For now, return an informational message
      return NextResponse.json({
        decrypted: false,
        message: 'Symmetric key decryption requires SEAL CLI integration',
        decryptionMethod: 'symmetric_key'
      });
    }
    
    // Otherwise, proceed with standard SEAL decryption
    if (!userAddress) {
      return NextResponse.json(
        { error: 'User wallet address is required for decryption' },
        { status: 400 }
      );
    }
    
    log.info('Starting SEAL decryption for contract', { contractId, userAddress });
    
    // Fetch contract to get encryption metadata
    const contract = await prisma.contract.findUnique({
      where: { id: contractId }
    });
    
    if (!contract || !contract.metadata?.encryption) {
      log.error('Contract not found or not encrypted with SEAL', { contractId });
      return NextResponse.json(
        { error: 'Contract not found or not encrypted with SEAL' },
        { status: 404 }
      );
    }
    
    const encryption = contract.metadata.encryption as any;
    
    if (encryption.method !== 'seal') {
      log.error('Contract not encrypted with SEAL', { 
        contractId, 
        encryptionMethod: encryption.method 
      });
      
      return NextResponse.json(
        { error: 'Contract not encrypted with SEAL' },
        { status: 400 }
      );
    }
    
    const keyServerIds = encryption.keyServerIds || [];
    const signerAddresses = encryption.signerAddresses || [];
    
    // Check if user is authorized to decrypt
    if (!signerAddresses.includes(userAddress)) {
      log.warn('User not authorized to decrypt document', {
        contractId,
        userAddress,
        authorizedSigners: signerAddresses
      });
      
      return NextResponse.json(
        { error: 'You are not authorized to decrypt this document' },
        { status: 403 }
      );
    }
    
    // Return a response that frontend integration is needed for wallet signing
    // In a full implementation, this would be handled by the frontend
    return NextResponse.json({
      decrypted: false,
      needsWalletSignature: true,
      message: 'Decryption requires wallet signature which must be done from the frontend',
      decryptionMethod: 'seal',
      sealMetadata: {
        packageId: SEAL_PACKAGE_ID,
        moduleName: MODULE_NAME,
        keyServerIds,
        signerAddresses,
      }
    });
    
    // The following code would be executed in the frontend with wallet access:
    /*
    // Initialize SUI client
    const suiClient = new SuiClient({ url: getFullnodeUrl(NETWORK) });
    
    // Create SEAL client
    const client = new SealClient({
      suiClient,
      serverObjectIds: keyServerIds,
      verifyKeyServers: false,
    });
    
    // Create session key
    const sessionKey = new SessionKey({
      address: userAddress,
      packageId: fromHEX(SEAL_PACKAGE_ID),
      ttlMin: 10, // TTL of 10 minutes
    });
    
    // Get personal message for signing
    const message = sessionKey.getPersonalMessage();
    
    // Sign with wallet (this requires frontend integration)
    const { signature } = await wallet.signPersonalMessage(message);
    sessionKey.setPersonalMessageSignature(signature);
    
    // Format the ID for SEAL
    const sealId = formatSealId(contractId, signerAddresses);
    
    // Create transaction for approval
    const tx = new Transaction();
    tx.moveCall({
      target: `${SEAL_PACKAGE_ID}::${MODULE_NAME}::seal_approve`,
      arguments: [tx.pure.vector("u8", sealId)],
    });
    
    const txBytes = tx.build({ client: suiClient, onlyTransactionKind: true });
    
    // Decrypt the document
    const decryptedBytes = await client.decrypt({
      data: Buffer.from(encryptedDocument, 'base64'),
      sessionKey,
      txBytes,
    });
    
    // Return decrypted document
    return NextResponse.json({
      decrypted: true,
      decryptedDocument: Buffer.from(decryptedBytes).toString('base64'),
      decryptionMethod: 'seal'
    });
    */
  } catch (error) {
    log.error('Error in decrypt_document API', { error });
    
    return NextResponse.json(
      { error: 'Failed to process document decryption request' },
      { status: 500 }
    );
  }
} 