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
 * Simplified document ID formatting - use just the contract ID like in fixed_seal.js
 */
function formatSealId(contractId: string): string {
  // Just ensure it's properly formatted as hex
  return contractId.startsWith('0x') ? contractId : `0x${contractId}`;
}

/**
 * Update the document ID creation to match fixed_seal.js approach
 */
function createDocumentId(allowlistId: string): { documentIdHex: string } {
  // Use the first 32 bytes of allowlist ID as prefix
  const rawAllowlistId = allowlistId.startsWith('0x') ? allowlistId.substring(2) : allowlistId;
  
  // Generate a unique suffix using timestamp and random number
  const timestamp = Date.now().toString(16);
  const random = Math.floor(Math.random() * 1000000).toString(16).padStart(6, '0');
  const suffix = timestamp + random;
  
  // Create document ID by appending suffix to allowlist ID
  const documentIdHex = rawAllowlistId + suffix;
  
  log.debug('Created document ID with format: [allowlistId]+[timestamp+random]', {
    documentIdHex,
    allowlistId: rawAllowlistId,
    suffix
  });
  
  return { documentIdHex };
}

/**
 * Encrypts document content using SEAL with simpler ID approach
 */
export async function encryptDocument(
  documentContent: string | Uint8Array,
  signerAddresses: string[],
  contractId: string
): Promise<{
  encryptedDocument: Uint8Array;
  symmetricKey: string;
  keyServerIds: string[];
  documentIdHex: string;
  allowlistId: string; // Added for consistency
}> {
  
  try {
    // Use contract ID as allowlist ID
    const allowlistId = contractId.startsWith('0x') ? contractId : `0x${contractId}`;
    log.info('Starting SEAL encryption', { allowlistId });
    
    // Get ALL allowlisted key servers (not just first 2)
    log.debug('Fetching allowlisted key servers');
    const keyServerIds = await getAllowlistedKeyServers(NETWORK);
    
    if (!keyServerIds || keyServerIds.length < 1) {
      throw new Error('Failed to retrieve key servers or not enough servers available');
    }
    
    log.info('Retrieved key servers', { count: keyServerIds.length });
    
    // Initialize SEAL client with ALL key servers
    const client = new SealClient({
      suiClient,
      serverObjectIds: keyServerIds,
      verifyKeyServers: true,
    });

    // Convert document to bytes
    const documentBytes = typeof documentContent === 'string' 
      ? new TextEncoder().encode(documentContent)
      : documentContent;
    
    // Create document ID using the proper format that matches decryption
    const { documentIdHex } = createDocumentId(allowlistId);
    log.debug('Using document ID for encryption:', documentIdHex);
    
    // Encrypt the document with threshold 1 (exactly like fixed_seal.js)
    const { encryptedObject, key } = await client.encrypt({
      threshold: 1,
      packageId: SEAL_PACKAGE_ID.startsWith('0x') ? SEAL_PACKAGE_ID : `0x${SEAL_PACKAGE_ID}`,
      id: documentIdHex,
      data: documentBytes,
    });
    
    // Convert the key from Uint8Array to base64 string format
    const symmetricKeyString = key ? Buffer.from(key).toString('base64') : '';
    
    log.info('Document encrypted successfully', {
      documentIdHex,
      allowlistId,
      originalSize: documentBytes.byteLength,
      encryptedSize: encryptedObject.byteLength,
      hasKey: !!key
    });
    
    return {
      encryptedDocument: encryptedObject,
      symmetricKey: symmetricKeyString,
      keyServerIds,
      documentIdHex,
      allowlistId
    };
  } catch (error) {
    log.error('Encryption failed', { 
      contractId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}



