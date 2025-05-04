import { getBaseUrl } from './url';
import { log } from './logger';

interface SealEncryptionResponse {
  encrypted: boolean;
  blobId?: string;
  allowlistId?: string;
  capId?: string;
  documentId?: string;
  signerAddresses?: string[];
  contractId?: string;
  hash?: string;
  encryption?: {
    method: string;
    packageId: string;
    allowlistId: string;
    documentId: string;
    signerAddresses: string[];
  };
  message?: string;
  error?: string;
}

interface SealDecryptionResponse {
  decrypted: boolean;
  decryptedDocument?: string; // base64 encoded document
  documentSize?: number;
  blobId?: string;
  message?: string;
  error?: string;
}

interface ContractMetadata {
  signers?: string[];
  encryption?: {
    method: string;
    packageId: string;
    allowlistId: string;
    documentId: string;
    signerAddresses: string[];
    blobId: string;
  };
  [key: string]: unknown;
}

// Type for request metadata that includes signers
interface RequestMetadata {
  signers: string[];
  [key: string]: unknown;
}

/**
 * Checks if a contract is encrypted with SEAL
 */
export const isContractEncrypted = (metadata: ContractMetadata | null): boolean => {
  if (!metadata?.encryption) {
    return false;
  }
  return metadata.encryption.method === 'seal';
};

/**
 * Encrypts a document using SEAL Protocol and uploads it to Walrus
 * This version uses wallet addresses directly
 */
export const encryptAndUploadWithAddresses = async (
  contractId: string, 
  documentContent: string, 
  signerAddresses: string[]
) => {
  log.info('Encrypting and uploading document with SEAL using wallet addresses', {
    contractId,
    documentContentLength: documentContent.length,
    signerCount: signerAddresses.length
  });

  try {
    const apiUrl = `${getBaseUrl()}/api/encrypt_and_upload`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contractId,
        documentContent,
        isBase64: true, // Assuming documentContent is base64 encoded
        signerAddresses
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      log.error('SEAL encryption API error', {
        contractId,
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });
      throw new Error(`SEAL encryption failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as SealEncryptionResponse;
    
    if (!data.encrypted) {
      log.error('SEAL encryption failed', {
        contractId,
        message: data.message,
        error: data.error
      });
      throw new Error(`SEAL encryption failed: ${data.message || data.error || 'Unknown error'}`);
    }

    log.info('SEAL encryption successful', {
      contractId,
      blobId: data.blobId,
      allowlistId: data.allowlistId,
      documentId: data.documentId
    });

    return data;
  } catch (error) {
    log.error('SEAL encryption error', {
      contractId,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
};

/**
 * Encrypts a document using SEAL Protocol and uploads it to Walrus
 * This version uses signer emails and lets the backend fetch wallet addresses
 */
export const encryptAndUploadWithEmails = async (
  contractId: string, 
  documentContent: string, 
  signerEmails: string[]
) => {
  log.info('Encrypting and uploading document with SEAL using signer emails', {
    contractId,
    documentContentLength: documentContent.length,
    signerCount: signerEmails.length
  });

  try {
    const apiUrl = `${getBaseUrl()}/api/encrypt_and_upload`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contractId,
        documentContent,
        isBase64: true, // Assuming documentContent is base64 encoded
        metadata: {
          signers: signerEmails
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      log.error('SEAL encryption API error', {
        contractId,
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });
      throw new Error(`SEAL encryption failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as SealEncryptionResponse;
    
    if (!data.encrypted) {
      log.error('SEAL encryption failed', {
        contractId,
        message: data.message,
        error: data.error
      });
      throw new Error(`SEAL encryption failed: ${data.message || data.error || 'Unknown error'}`);
    }

    log.info('SEAL encryption successful', {
      contractId,
      blobId: data.blobId,
      allowlistId: data.allowlistId,
      documentId: data.documentId
    });

    return data;
  } catch (error) {
    log.error('SEAL encryption error', {
      contractId,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
};

/**
 * Encrypts a document using SEAL Protocol and uploads it to Walrus
 * @param contractId The contract ID
 * @param documentContent The document content (base64 encoded)
 * @param signerAddressesOrEmails Array of signer wallet addresses or emails
 * @param areEmails Whether the signerAddressesOrEmails are emails instead of wallet addresses
 */
export const encryptAndUpload = async (
  contractId: string, 
  documentContent: string, 
  signerAddressesOrEmails: string[], 
  areEmails: boolean = false
) => {
  if (areEmails) {
    return encryptAndUploadWithEmails(contractId, documentContent, signerAddressesOrEmails);
  } else {
    return encryptAndUploadWithAddresses(contractId, documentContent, signerAddressesOrEmails);
  }
};

/**
 * Decrypts a document using SEAL Protocol
 */
export const decryptDocument = async (
  blobId: string,
  userAddress: string,
  signature: string,
  allowlistId: string,
  documentId: string
): Promise<string> => {
  log.info('Decrypting document with SEAL', {
    blobId,
    userAddress,
    allowlistId,
    documentId
  });

  try {
    const apiUrl = `${getBaseUrl()}/api/decrypt_document`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        blobId,
        userAddress,
        signature,
        allowlistId,
        documentId
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      log.error('SEAL decryption API error', {
        blobId,
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });
      throw new Error(`SEAL decryption failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as SealDecryptionResponse;
    
    if (!data.decrypted || !data.decryptedDocument) {
      log.error('SEAL decryption failed', {
        blobId,
        message: data.message,
        error: data.error
      });
      throw new Error(`SEAL decryption failed: ${data.message || data.error || 'Unknown error'}`);
    }

    log.info('SEAL decryption successful', {
      blobId,
      documentSize: data.documentSize
    });

    return data.decryptedDocument;
  } catch (error) {
    log.error('SEAL decryption error', {
      blobId,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
};

/**
 * Updates a contract's metadata to add SEAL encryption info
 */
export const updateContractWithSealMetadata = async (contractId: string, sealData: SealEncryptionResponse) => {
  log.info('Updating contract with SEAL metadata', {
    contractId,
    blobId: sealData.blobId,
    allowlistId: sealData.allowlistId,
    documentId: sealData.documentId
  });

  try {
    const apiUrl = `${getBaseUrl()}/api/contracts/${contractId}`;
    
    // Create the encryption metadata
    const encryptionMetadata = {
      method: 'seal',
      packageId: sealData.encryption?.packageId,
      allowlistId: sealData.allowlistId,
      documentId: sealData.documentId,
      signerAddresses: sealData.signerAddresses,
      blobId: sealData.blobId
    };
    
    const response = await fetch(apiUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        metadata: {
          encryption: encryptionMetadata
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      log.error('Error updating contract with SEAL metadata', {
        contractId,
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });
      throw new Error(`Failed to update contract with SEAL metadata: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    log.info('Contract updated with SEAL metadata', {
      contractId,
      success: true
    });

    return data;
  } catch (error) {
    log.error('Error updating contract with SEAL metadata', {
      contractId,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}; 