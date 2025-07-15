'use client';

import { useState } from 'react';
import { SealClient, getAllowlistedKeyServers } from '@mysten/seal';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { fromHEX, toHEX } from '@mysten/sui/utils';
import { useZkLogin } from '@/app/contexts/ZkLoginContext';
import { hashGoogleId } from '@/app/utils/privacy'; // Add this import

interface PDFEncryptorProps {
  file: File;
  contractId: string;
  signerAddresses: string[];
  onSuccess: (encryptedData: {
    encryptedBytes: Uint8Array;
    allowlistId: string;
    documentId: string;
    capId: string;
  }) => void;
  onError: (error: Error) => void;
  onProgress?: (progress: number) => void;
}

export default function PDFEncryptor({
  file,
  contractId,
  signerAddresses,
  onSuccess,
  onError,
  onProgress
}: PDFEncryptorProps) {
  const [status, setStatus] = useState<'idle' | 'encrypting' | 'success' | 'error'>('idle');
  const { user, userAddress } = useZkLogin();

  const SEAL_PACKAGE_ID = process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID || 
    '0xb5c84864a69cb0b495caf548fa2bf0d23f6b69b131fa987d6f896d069de64429';
  const NETWORK = 'testnet';

  const createDocumentIdFromAllowlist = (allowlistId: string) => {
    const cleanAllowlistId = allowlistId.startsWith('0x') ? allowlistId.slice(2) : allowlistId;
    const allowlistBytes = fromHEX(cleanAllowlistId);
    const saltBytes = new Uint8Array(crypto.getRandomValues(new Uint8Array(5)));
    const fullIdBytes = new Uint8Array([...allowlistBytes, ...saltBytes]);
    const documentIdHex = toHEX(fullIdBytes);
    const saltHex = toHEX(saltBytes);
    
    return { documentIdHex, documentSalt: saltHex };
  };

  const encryptPDF = async () => {
    try {
      setStatus('encrypting');
      onProgress?.(10);

      // Hash any email addresses for privacy before sending to API
      const hashedSignerAddresses = await Promise.all(
        signerAddresses.map(async (address) => {
          // Check if it's an email (contains @) and hash it
          if (address.includes('@')) {
            const hashedEmail = await hashGoogleId(`email_${address}`);
            console.log(`[PDFEncryptor] Hashed email for privacy: ${address.substring(0, 5)}...`);
            return hashedEmail;
          }
          // If it's already a wallet address, return as-is
          return address;
        })
      );

      // Include user's wallet address in signers
      const allSignerAddresses = [
        ...hashedSignerAddresses, // Now contains hashed emails
        ...(userAddress ? [userAddress] : [])
      ].filter((addr, index, arr) => arr.indexOf(addr) === index); // Remove duplicates

      console.log('[PDFEncryptor] Creating allowlist with hashed addresses:', allSignerAddresses.map(addr => addr.substring(0, 8) + '...'));

      // Create allowlist with user's wallet address included
      const allowlistResponse = await fetch('/api/seal/create-allowlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractId,
          signerAddresses: allSignerAddresses
        })
      });

      if (!allowlistResponse.ok) {
        throw new Error(`Failed to create allowlist: ${allowlistResponse.status}`);
      }

      const { allowlistId, capId } = await allowlistResponse.json();
      onProgress?.(30);

      // Initialize SEAL client
      const suiClient = new SuiClient({ url: getFullnodeUrl(NETWORK) });
      const keyServers = getAllowlistedKeyServers(NETWORK);
      
      const sealClient = new SealClient({
        suiClient: suiClient as any,
        serverConfigs: keyServers.map((id) => ({
          objectId: id,
          weight: 1,
        })),
        verifyKeyServers: true
      });

      onProgress?.(50);

      // Generate document ID
      const { documentIdHex } = createDocumentIdFromAllowlist(allowlistId);

      // Read PDF file as bytes
      const fileBuffer = await file.arrayBuffer();
      const fileBytes = new Uint8Array(fileBuffer);

      onProgress?.(70);

      // Encrypt the PDF
      console.log('[PDFEncryptor] Encrypting PDF with SEAL...');
      const { encryptedObject: encryptedBytes } = await sealClient.encrypt({
        threshold: 1,
        packageId: SEAL_PACKAGE_ID,
        id: documentIdHex,
        data: fileBytes
      });

      onProgress?.(100);
      setStatus('success');

      console.log('[PDFEncryptor] PDF encrypted successfully');
      onSuccess({
        encryptedBytes,
        allowlistId,
        documentId: documentIdHex,
        capId
      });

    } catch (error) {
      console.error('[PDFEncryptor] Encryption failed:', error);
      setStatus('error');
      onError(error instanceof Error ? error : new Error('Encryption failed'));
    }
  };

  return (
    <div className="space-y-4">
      {status === 'idle' && (
        <button 
          onClick={encryptPDF}
          className="w-full py-2 px-4 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Encrypt PDF
        </button>
      )}
      
      {status === 'encrypting' && (
        <div className="text-center">
          <div className="text-sm text-gray-600">Encrypting PDF...</div>
        </div>
      )}
      
      {status === 'success' && (
        <div className="text-green-600 text-sm">PDF encrypted successfully!</div>
      )}
      
      {status === 'error' && (
        <div className="text-red-600 text-sm">Encryption failed</div>
      )}
    </div>
  );
} 