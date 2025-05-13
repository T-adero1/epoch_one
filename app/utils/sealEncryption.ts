import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { fromB64, fromHEX, toHEX } from '@mysten/sui/utils';
import { SealClient, SessionKey, getAllowlistedKeyServers } from '@mysten/seal';

// Add a simple logging utility
const log = {
  info: (...args: any[]) => console.log('[SEAL:INFO]', ...args),
  warn: (...args: any[]) => console.warn('[SEAL:WARN]', ...args),
  error: (...args: any[]) => console.error('[SEAL:ERROR]', ...args),
  debug: (...args: any[]) => console.debug('[SEAL:DEBUG]', ...args),
};

// Configuration
// Use the package ID from environment variables
const NETWORK = 'testnet';
const SEAL_PACKAGE_ID = process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID || '0x...';
const MODULE_NAME = 'document_sharing';

log.info('SEAL configuration loaded:', { 
  network: NETWORK, 
  packageId: SEAL_PACKAGE_ID,
  moduleName: MODULE_NAME,
});

// Initialize Sui client
const suiClient = new SuiClient({ url: getFullnodeUrl(NETWORK) });

/**
 * Formats the ID for SEAL encryption by combining contract ID and signer addresses
 * @param contractId The contract ID (will be converted to bytes if string)
 * @param signerAddresses Array of signer wallet addresses
 * @returns Formatted ID as Uint8Array
 */
function formatSealId(contractId: string, signerAddresses: string[]): Uint8Array {
  // Convert contract ID to bytes (assuming it's a hex string)
  const contractIdBytes = fromHEX(contractId.startsWith('0x') ? contractId : `0x${contractId}`);
  
  // Create a buffer to hold all data
  const chunks: Uint8Array[] = [contractIdBytes];
  
  // Add each signer address
  for (const address of signerAddresses) {
    const addressBytes = fromHEX(address.startsWith('0x') ? address : `0x${address}`);
    chunks.push(addressBytes);
  }
  
  // Concatenate all chunks
  return new Uint8Array(Buffer.concat(chunks.map(c => Buffer.from(c))));
}

/**
 * Encrypts document content using SEAL with signers' addresses
 * @param documentContent The document content to encrypt
 * @param signerAddresses Array of signer wallet addresses
 * @param contractId ID of the contract to associate with the encryption
 * @returns Object containing the encrypted document and metadata
 */
export async function encryptDocument(
  documentContent: string | Uint8Array,
  signerAddresses: string[],
  contractId: string
): Promise<{
  encryptedDocument: Uint8Array;
  symmetricKey: string;
  keyServerIds: string[];
}> {
  const startTime = performance.now();
  log.info('Starting SEAL encryption', { 
    contractId,
    contentType: typeof documentContent,
    contentLength: typeof documentContent === 'string' 
      ? documentContent.length 
      : documentContent.byteLength,
    signerCount: signerAddresses.length,
    packageId: SEAL_PACKAGE_ID,
  });
  
  try {
    // Get allowlisted key servers
    log.debug('Fetching allowlisted key servers');
    const keyServerIds = await getAllowlistedKeyServers(NETWORK);
    
    if (!keyServerIds || keyServerIds.length < 2) {
      log.error('Failed to retrieve key servers', { 
        count: keyServerIds?.length || 0,
        keyServerIds 
      });
      throw new Error('Failed to retrieve key servers or not enough servers available');
    }
    
    log.info('Retrieved key servers', { 
      count: keyServerIds.length,
      keyServerIds: keyServerIds.slice(0, 2),
    });
    
    // Choose the first two key servers
    const selectedKeyServers = keyServerIds.slice(0, 2);
    
    // Initialize SEAL client
    log.debug('Initializing SEAL client', { serverCount: selectedKeyServers.length });
    const client = new SealClient({
      suiClient,
      serverObjectIds: selectedKeyServers,
      verifyKeyServers: true,
    });

    // Convert document to bytes if it's a string
    const documentBytes = typeof documentContent === 'string' 
      ? new TextEncoder().encode(documentContent)
      : documentContent;
    
    log.debug('Formatted document for encryption', { 
      byteLength: documentBytes.byteLength 
    });

    // Format the ID for SEAL by combining contract ID and signer addresses
    log.debug('Formatting SEAL ID with contract and signer addresses');
    const sealId = formatSealId(contractId, signerAddresses);
    log.debug('SEAL ID created', { idLength: sealId.byteLength });
    
    // Encrypt the document with threshold 1 (any signer can decrypt)
    log.info('Encrypting document', { 
      threshold: 1,
      keyServerCount: selectedKeyServers.length,
    });
    
    const encryptionStartTime = performance.now();
    const { encryptedObject, key } = await client.encrypt({
      threshold: 1, // Any 1 of the 2 key servers is sufficient
      packageId: fromHEX(SEAL_PACKAGE_ID),
      id: sealId,
      data: documentBytes,
    });
    const encryptionDuration = performance.now() - encryptionStartTime;
    
    log.info('Document encrypted successfully', {
      contractId,
      originalSize: documentBytes.byteLength,
      encryptedSize: encryptedObject.byteLength,
      encryptionDurationMs: Math.round(encryptionDuration),
      hasBackupKey: !!key,
    });

    const totalDuration = performance.now() - startTime;
    log.info('Encryption process completed', { 
      durationMs: Math.round(totalDuration)
    });
    
    // Return the encrypted data and backup key
    return {
      encryptedDocument: encryptedObject,
      symmetricKey: key,
      keyServerIds: selectedKeyServers,
    };
  } catch (error) {
    const totalDuration = performance.now() - startTime;
    log.error('Encryption failed', { 
      contractId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      durationMs: Math.round(totalDuration),
    });
    throw error;
  }
}

/**
 * Decrypts a document using SEAL
 * @param encryptedDocument The encrypted document
 * @param userAddress Address of the user trying to decrypt
 * @param contractId ID of the contract
 * @param signerAddresses Array of signer addresses
 * @param keyServerIds IDs of the key servers used for encryption
 * @returns The decrypted document content
 */
export async function decryptDocument(
  encryptedDocument: Uint8Array,
  userAddress: string,
  contractId: string,
  signerAddresses: string[],
  keyServerIds: string[]
): Promise<Uint8Array> {
  // Initialize SEAL client
  const client = new SealClient({
    suiClient,
    serverObjectIds: keyServerIds,
    verifyKeyServers: true, // No need to verify again for decryption
  });

  // Create session key
  const sessionKey = new SessionKey({
    address: userAddress,
    packageId: fromHEX(SEAL_PACKAGE_ID),
    ttlMin: 10, // Session valid for 10 minutes
  });

  // Get personal message for signing
  const message = sessionKey.getPersonalMessage();
  
  // In a real app, you would use:
  // const { signature } = await wallet.signPersonalMessage(message);
  
  // For testing, we'll throw an error - frontend integration needed
  throw new Error('Wallet integration required for signing personal message');
  
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
    data: encryptedDocument,
    sessionKey,
    txBytes,
  });

  return decryptedBytes;
}

/**
 * Decrypt document using symmetric key (for recovery)
 * @param encryptedDocument The encrypted document bytes
 * @param symmetricKey The symmetric key for decryption
 * @returns The decrypted document bytes
 */
export async function decryptWithSymmetricKey(
  encryptedDocument: Uint8Array,
  symmetricKey: string
): Promise<Uint8Array> {
  // In a real implementation, you would use SEAL's symmetric decryption
  // For now, we'll throw an error as this would need the SEAL CLI or additional integration
  throw new Error('Symmetric key decryption requires SEAL CLI integration');
}

/**
 * Gets the SEAL package ID
 * @returns The configured SEAL package ID
 */
export function getSealPackageId(): string {
  return SEAL_PACKAGE_ID;
} 