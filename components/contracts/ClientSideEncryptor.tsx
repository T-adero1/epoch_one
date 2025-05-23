'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { SealClient, getAllowlistedKeyServers } from '@mysten/seal';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { fromHEX, toHEX } from '@mysten/sui/utils';

interface ClientSideEncryptorProps {
  contractId: string;
  documentContent: string;
  signerAddresses: string[];
  signerEmails: string[];
  autoStart?: boolean;
  showLogs?: boolean;
  onSuccess?: (data: any) => void;
  onError?: (error: Error) => void;
}

export default function ClientSideEncryptor({
  contractId,
  documentContent,
  signerAddresses,
  signerEmails,
  autoStart = false,
  showLogs = true,
  onSuccess,
  onError
}: ClientSideEncryptorProps) {
  const [status, setStatus] = useState<'idle' | 'preparing' | 'encrypting' | 'uploading' | 'success' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const SEAL_PACKAGE_ID = process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID || '0xb5c84864a69cb0b495caf548fa2bf0d23f6b69b131fa987d6f896d069de64429';
  const NETWORK = 'testnet';

  function addLog(message: string) {
    if (showLogs) {
      setLogs(prev => [...prev, message]);
    }
    console.log('[ClientEncryptor]', message);
  }

  useEffect(() => {
    if (autoStart && status === 'idle') {
      encryptDocument();
    }
  }, [autoStart, status]);

  const createDocumentIdFromAllowlist = (allowlistId: string) => {
    addLog(`Creating document ID from allowlist ID: ${allowlistId}`);
    
    try {
      const cleanAllowlistId = allowlistId.startsWith('0x') ? allowlistId.slice(2) : allowlistId;
      
      const allowlistBytes = fromHEX(cleanAllowlistId);
      addLog(`Allowlist bytes length: ${allowlistBytes.length}`);
      
      const saltBytes = new Uint8Array(crypto.getRandomValues(new Uint8Array(5)));
      addLog(`Generated salt: ${toHEX(saltBytes)}`);
      
      const fullIdBytes = new Uint8Array([...allowlistBytes, ...saltBytes]);
      addLog(`Combined ID length: ${fullIdBytes.length} bytes`);
      
      const documentIdHex = toHEX(fullIdBytes);
      const saltHex = toHEX(saltBytes);
      
      addLog(`Document ID generated successfully`);
      addLog(`Document ID (hex): ${documentIdHex}`);
      addLog(`Salt (hex): ${saltHex}`);
      
      return { documentIdHex, documentSalt: saltHex };
    } catch (err) {
      console.error('[ClientEncryptor] Error generating document ID:', err);
      throw new Error(`Failed to generate document ID: ${err}`);
    }
  };

  const encryptDocument = async () => {
    try {
      setStatus('preparing');
      setProgress(10);
      setError(null);
      if (showLogs) setLogs([]);
      
      addLog(`Starting document encryption for contract: ${contractId}`);
      addLog(`Document content length: ${documentContent.length}`);
      addLog(`Signer addresses: ${signerAddresses.join(', ')}`);
      
      addLog('Requesting allowlist creation from server');
      addLog(`Using signer addresses: ${signerAddresses.join(', ')}`);
      
      const allowlistResponse = await fetch('/api/seal/create-allowlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractId,
          signerAddresses
        })
      });
      
      addLog(`Allowlist server response: ${allowlistResponse.status}`);
      
      if (!allowlistResponse.ok) {
        const errorText = await allowlistResponse.text();
        addLog(`Server error: ${errorText}`);
        throw new Error(`Failed to create allowlist: ${allowlistResponse.status} ${errorText}`);
      }
      
      const { allowlistId, capId } = await allowlistResponse.json();
      addLog(`Allowlist created successfully: ${allowlistId}`);
      addLog(`Capability ID: ${capId}`);
      
      setProgress(30);
      
      addLog('Initializing Sui client');
      const suiClient = new SuiClient({ url: getFullnodeUrl(NETWORK) });
      
      setStatus('encrypting');
      addLog('Initializing SEAL client');
      const keyServerIds = await getAllowlistedKeyServers(NETWORK);
      addLog(`Found ${keyServerIds.length} key servers`);
      
      const sealClient = new SealClient({
        suiClient: suiClient as any,
        serverObjectIds: keyServerIds.map(id => [id, 1]),
        verifyKeyServers: true
      });
      
      addLog(`Generating document ID from allowlist ID: ${allowlistId}`);
      const { documentIdHex, documentSalt } = createDocumentIdFromAllowlist(allowlistId);
      
      addLog('Preparing document content');
      const isBase64 = /^[A-Za-z0-9+/]*={0,2}$/.test(documentContent.trim());
      
      let documentBytes;
      if (isBase64) {
        addLog('Content is base64, decoding...');
        documentBytes = new Uint8Array(Buffer.from(documentContent, 'base64'));
      } else {
        addLog('Content is text, encoding to bytes...');
        documentBytes = new TextEncoder().encode(documentContent);
      }
      addLog(`Document bytes size: ${documentBytes.length}`);
      
      setProgress(50);
      
      addLog(`Encrypting document with SEAL`);
      addLog(`Using document ID: ${documentIdHex}`);
      addLog(`Using salt: ${documentSalt}`);
      
      const { encryptedObject: encryptedBytes } = await sealClient.encrypt({
        threshold: 1,
        packageId: SEAL_PACKAGE_ID,
        id: documentIdHex,
        data: documentBytes
      });
      
      addLog('Document encrypted successfully');
      addLog(`Encrypted data size: ${encryptedBytes.length} bytes`);
      
      setProgress(70);
      setStatus('uploading');
      
      const encryptedBase64 = Buffer.from(encryptedBytes).toString('base64');
      addLog(`Encoded encrypted data to base64, length: ${encryptedBase64.length}`);
      
      addLog(`Sending encrypted document to server`);
      
      const isDevelopment = process.env.NODE_ENV === 'development';
      const apiEndpoint = isDevelopment ? '/api/python_direct' : '/api/upload_contract';
      
      addLog(`Using API endpoint: ${apiEndpoint}`);
      
      const uploadResponse = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractId,
          contractContent: encryptedBase64,
          isBase64: true,
          context: 'testnet',
          deletable: false,
          signerAddresses,
          metadata: {
            signers: signerEmails,
          },
          preEncrypted: true,
          documentIdHex,
          documentSalt,
          allowlistId,
          capId,
          useSeal: true
        })
      });
      
      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`Upload failed: ${uploadResponse.status} ${errorText}`);
      }
      
      const responseData = await uploadResponse.json();
      addLog(`Upload successful:`);
      addLog(`Blob ID: ${responseData.blobId || 'unknown'}`);
      
      setProgress(100);
      setStatus('success');
      setResult(responseData);
      
      if (onSuccess) {
        onSuccess(responseData);
      }
      
      return responseData;
    } catch (err: any) {
      console.error('[ClientEncryptor] Error:', err);
      addLog(`ERROR: ${err.message}`);
      setStatus('error');
      setError(err.message || 'An unknown error occurred');
      
      if (onError) {
        onError(err);
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        {!autoStart && (
          <Button 
            onClick={encryptDocument} 
            disabled={status !== 'idle' && status !== 'error'}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {status === 'idle' ? 'Encrypt Document' : 
             status === 'preparing' ? 'Preparing...' : 
             status === 'encrypting' ? 'Encrypting...' : 
             status === 'uploading' ? 'Uploading...' : 
             status === 'success' ? 'Encrypted!' : 'Retry Encryption'}
          </Button>
        )}
        
        {status !== 'idle' && status !== 'error' && (
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        )}
      </div>
      
      {error && (
        <div className="text-red-500 text-sm mt-2 p-2 bg-red-50 rounded">
          Error: {error}
        </div>
      )}
      
      {status === 'success' && (
        <div className="text-green-500 text-sm mt-2 p-2 bg-green-50 rounded">
          Document encrypted and uploaded successfully! Blob ID: {result?.blobId}
        </div>
      )}
      
      {showLogs && logs.length > 0 && (
        <div className="mt-4 border rounded p-2 bg-gray-50">
          <h4 className="text-sm font-medium mb-2">Encryption Logs:</h4>
          <div className="text-xs font-mono bg-black text-green-400 p-2 rounded h-32 overflow-y-auto">
            {logs.map((log, i) => (
              <div key={i}>&gt; {log}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 