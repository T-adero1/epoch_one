'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, FileText } from 'lucide-react';
import { useZkLogin } from '@/app/contexts/ZkLoginContext';
import { toast } from '@/components/ui/use-toast';
import { SealClient, SessionKey, getAllowlistedKeyServers } from '@mysten/seal';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { fromB64, fromHEX } from '@mysten/sui/utils';
import { bech32 } from 'bech32';
import { genAddressSeed, getZkLoginSignature } from '@mysten/sui/zklogin';

interface PDFDecryptorProps {
  contractId: string;
  allowlistId: string;
  documentId: string;
  fileName: string;
  onDecrypted?: (decryptedBlob: Blob) => void;
}

// Utility function to decode a Sui bech32 private key
function decodeSuiPrivateKey(suiPrivateKey: string): Uint8Array {
  console.log('[PDFDecryptor] Decoding bech32 private key...');
  
  try {
    if (!suiPrivateKey.startsWith('suiprivkey1')) {
      throw new Error('Not a valid Sui bech32 private key format');
    }
    
    const decoded = bech32.decode(suiPrivateKey);
    const privateKeyBytes = Buffer.from(bech32.fromWords(decoded.words));
    const secretKey = privateKeyBytes.slice(1); // Remove the first byte (flag)
    
    if (secretKey.length !== 32) {
      throw new Error(`Expected 32 bytes after removing flag, got ${secretKey.length}`);
    }
    
    return new Uint8Array(secretKey);
  } catch (error) {
    console.error('[PDFDecryptor] Error decoding private key:', error);
    throw new Error(`Failed to decode private key: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Time to live for session key in minutes
const TTL_MIN = 30;

// Local storage key for ephemeral wallet
const EPHEMERAL_STORAGE_KEY = "epochone_session";

// Ephemeral key validity (1 hour in milliseconds)
const EPHEMERAL_KEY_VALIDITY_MS = 60 * 60 * 1000;

export default function PDFDecryptor({
  contractId,
  allowlistId,
  documentId,
  fileName,
  onDecrypted
}: PDFDecryptorProps) {
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptionStep, setDecryptionStep] = useState<string>('idle');
  const { user } = useZkLogin();
  const [ephemeralKeypair, setEphemeralKeypair] = useState<Ed25519Keypair | null>(null);
  const [ephemeralAddress, setEphemeralAddress] = useState<string | null>(null);

  const SEAL_PACKAGE_ID = process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID || 
    '0xb5c84864a69cb0b495caf548fa2bf0d23f6b69b131fa987d6f896d069de64429';

  useEffect(() => {
    // Extract ephemeral keypair from session
    const loadEphemeralKeypair = async () => {
      console.log("[PDFDecryptor] Loading ephemeral keypair...");
      try {
        const sessionData = localStorage.getItem(EPHEMERAL_STORAGE_KEY);
        if (!sessionData) {
          console.error("[PDFDecryptor] No session data found in localStorage");
          return;
        }
        
        const sessionObj = JSON.parse(sessionData);
        const zkLoginState = sessionObj.zkLoginState || sessionObj.user.zkLoginState;
        
        if (!zkLoginState) {
          console.error("[PDFDecryptor] No ephemeral key private key found in session data");
          return;
        }
        
        // Try to find private key in different potential locations
        let privateKey: string | undefined;
        
        if (zkLoginState.ephemeralKeyPair?.privateKey) {
          privateKey = zkLoginState.ephemeralKeyPair.privateKey;
        } else if (sessionObj.user?.zkLoginState?.ephemeralKeyPair?.privateKey) {
          privateKey = sessionObj.user.zkLoginState.ephemeralKeyPair.privateKey;
        }
        
        if (!privateKey) {
          console.error("[PDFDecryptor] No ephemeral key private key found in session data");
          return;
        }
        
        if (!privateKey.startsWith('suiprivkey1')) {
          console.error("[PDFDecryptor] Private key is not in bech32 format");
          return;
        }
        
        // Decode the private key
        const privateKeyBytes = decodeSuiPrivateKey(privateKey);
        
        // Create keypair from private key bytes
        const keypair = Ed25519Keypair.fromSecretKey(privateKeyBytes);
        const address = keypair.getPublicKey().toSuiAddress();
        
        console.log("[PDFDecryptor] Derived ephemeral wallet address:", address);
        
        setEphemeralKeypair(keypair);
        setEphemeralAddress(address);
      } catch (error) {
        console.error("[PDFDecryptor] Error loading ephemeral keypair:", error);
      }
    };

    loadEphemeralKeypair();
  }, []);

  const authorizeEphemeralKey = async (suiClient: SuiClient, packageId: string, docId: string): Promise<void> => {
    if (!user?.address || !ephemeralAddress || !ephemeralKeypair) {
      throw new Error('User or ephemeral wallet not available');
    }

    console.log("[PDFDecryptor] Setting up sponsored transaction");
    setDecryptionStep('authorizing');
    
    try {
      // Format docId correctly - ensure no 0x prefix
      const docIdFormatted = docId.startsWith('0x') ? docId.substring(2) : docId;
      
      // Create transaction with user address as sender
      const tx = new Transaction();
      tx.setSender(user.address);
      
      // Add the Move call
      tx.moveCall({
        target: `${packageId}::allowlist::authorize_ephemeral_key`,
        arguments: [
          tx.object(allowlistId),
          tx.pure.address(ephemeralAddress),
          tx.pure.string(docIdFormatted),
          tx.pure.u64(EPHEMERAL_KEY_VALIDITY_MS),
          tx.object('0x6') // Clock object ID
        ],
      });
      
        // Build transaction kind bytes
        await tx.build({
          client: suiClient,
          onlyTransactionKind: true
        });
      
      // Request sponsorship from server
      const sponsorResponse = await fetch('/api/auth/sponsor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: user.address,
          allowlistId,
          ephemeralAddress,
          documentId: docIdFormatted,
          validityMs: EPHEMERAL_KEY_VALIDITY_MS
        })
      });

      if (!sponsorResponse.ok) {
        let errorText;
          try {
            const errorJson = await sponsorResponse.json();
            errorText = JSON.stringify(errorJson);
          } catch {
            errorText = await sponsorResponse.text();
          }
        throw new Error(`Sponsorship failed: ${sponsorResponse.status} ${errorText}`);
      }
      
      const { sponsoredTxBytes } = await sponsorResponse.json();
      
      // Sign the sponsored bytes with ephemeral key
      const txBlock = Transaction.from(fromB64(sponsoredTxBytes));
      const { signature: userSignature } = await txBlock.sign({
        client: suiClient,
        signer: ephemeralKeypair
      });
      
      // Get session data and create zkLogin signature
      const sessionData = localStorage.getItem(EPHEMERAL_STORAGE_KEY);
      if (!sessionData) {
        throw new Error("No session data found in localStorage");
      }
      
      const sessionObj = JSON.parse(sessionData);
      const zkLoginState = sessionObj.zkLoginState || sessionObj.user.zkLoginState;
      
      if (!zkLoginState || !zkLoginState.jwt || !zkLoginState.zkProofs) {
        throw new Error("Missing zkLogin state, jwt, or proofs in the session");
      }
      
      // Get salt from current session
      const salt = zkLoginState.salt;
      if (!salt) {
        throw new Error("No salt found in zkLoginState!");
      }
      
      // Parse JWT and create address seed
      const jwt = zkLoginState.jwt;
      const jwtBody = JSON.parse(atob(jwt.split('.')[1]));
      const addressSeed = genAddressSeed(
        BigInt(salt),
        'sub',
        jwtBody.sub,
        jwtBody.aud
      ).toString();
      
      // Create zkLogin signature
      const zkLoginSignature = getZkLoginSignature({
        inputs: {
          ...zkLoginState.zkProofs,
          addressSeed,
        },
        maxEpoch: zkLoginState.maxEpoch,
        userSignature,
      });
      
      // Send to server for execution
      const executeResponse = await fetch('/api/auth/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sponsoredTxBytes,
          zkLoginSignature
        })
      });
      
      if (!executeResponse.ok) {
        const errorText = await executeResponse.text();
        throw new Error(`Execution failed: ${executeResponse.status} ${errorText}`);
      }
      
      const { digest } = await executeResponse.json();
      
      // Wait for transaction confirmation
      await suiClient.waitForTransaction({
        digest: digest,
        options: { showEffects: true }
      });
      
      console.log("[PDFDecryptor] Ephemeral key authorization complete");
      
    } catch (error) {
      console.error("[PDFDecryptor] Error authorizing ephemeral key:", error);
      throw new Error(`Failed to authorize ephemeral key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const decryptAndView = async () => {
    if (!user?.address) {
      toast({
        title: "Authentication required",
        description: "Please login to decrypt this document",
        variant: "destructive"
      });
      return;
    }

    if (!ephemeralKeypair || !ephemeralAddress) {
      toast({
        title: "Error",
        description: "Ephemeral wallet not initialized", 
        variant: "destructive"
      });
      return;
    }

    try {
      setIsDecrypting(true);
      setDecryptionStep('preparing');
      
      // **NEW: Check cache first before AWS call**
      let encryptedData: ArrayBufferLike; // ✅ Change type to ArrayBufferLike
      
      try {
        const { pdfCache } = await import('@/app/utils/pdfCache');
        const cachedPDF = await pdfCache.getEncryptedPDF(contractId);
        
        if (cachedPDF) {
          console.log('[PDFDecryptor] Using cached encrypted PDF');
          setDecryptionStep('cache-hit');
          encryptedData = cachedPDF.encryptedData.buffer; // ✅ No casting needed
          
          // Verify encryption metadata matches
          if (cachedPDF.encryptionMeta.allowlistId !== allowlistId || 
              cachedPDF.encryptionMeta.documentId !== documentId) {
            console.warn('[PDFDecryptor] Cache metadata mismatch, fetching from AWS');
            throw new Error('Cache metadata mismatch');
          }
        } else {
          throw new Error('Not in cache');
        }
      } catch (cacheError) {
        // Fallback to AWS download
        console.log('[PDFDecryptor] Cache miss, downloading from AWS:', cacheError);
        setDecryptionStep('downloading');
        const response = await fetch(`/api/contracts/download-pdf/${contractId}?view=inline`);
        
        if (!response.ok) {
          throw new Error('Failed to download encrypted PDF from AWS');
        }

        encryptedData = await response.arrayBuffer();
        
        // **NEW: Cache the downloaded encrypted data for next time**
        try {
          const { pdfCache } = await import('@/app/utils/pdfCache');
          await pdfCache.storeEncryptedPDF(
            contractId,
            new Uint8Array(encryptedData),
            fileName,
            {
              allowlistId,
              documentId,
              capId: '', // We might not have capId here, that's okay
              isEncrypted: true
            }
          );
          console.log('[PDFDecryptor] Cached downloaded encrypted PDF');
        } catch (cacheError) {
          console.warn('[PDFDecryptor] Failed to cache downloaded PDF:', cacheError);
        }
      }
      
      // Initialize clients
      const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
      const sealClient = new SealClient({
        suiClient: suiClient as any,
        serverConfigs: getAllowlistedKeyServers('testnet').map((id) => ({
          objectId: id,
          weight: 1,
        })),
        verifyKeyServers: true
      });

      // Format document ID correctly
      const docId = documentId.startsWith('0x') ? documentId.substring(2) : documentId;
      
      // Authorize ephemeral key
      await authorizeEphemeralKey(suiClient, SEAL_PACKAGE_ID, docId);
      
      // Create a SessionKey with the ephemeral address
      const sessionKey = new SessionKey({
        address: ephemeralAddress,
        packageId: SEAL_PACKAGE_ID,
        ttlMin: TTL_MIN,
        signer: ephemeralKeypair,
        suiClient: suiClient as any
      });
      
      // Get personal message and sign it with ephemeral key
      const personalMessage = sessionKey.getPersonalMessage();
      
      setDecryptionStep('signing');
      const signature = await ephemeralKeypair.signPersonalMessage(personalMessage);
      
      // Set the signature on the session key
      await sessionKey.setPersonalMessageSignature(signature.signature);
      
      // Create seal_approve transaction with ephemeral key
      const tx = new Transaction();
      tx.setSender(ephemeralAddress);
      
      // Convert to bytes for transaction
      const rawId = docId.startsWith('0x') ? docId.substring(2) : docId;
      const documentIdBytes = fromHEX(rawId);

      tx.moveCall({
        target: `${SEAL_PACKAGE_ID}::allowlist::seal_approve`,
        arguments: [
          tx.pure.vector('u8', Array.from(documentIdBytes)),
          tx.object(allowlistId),
          tx.object('0x6')
        ]
      });
      
      // Build transaction bytes
      const txKindBytes = await tx.build({ 
        client: suiClient, 
        onlyTransactionKind: true
      });

      // Fetch keys
      setDecryptionStep('fetching-keys');
      await sealClient.fetchKeys({
        ids: [rawId], // No 0x prefix
        txBytes: txKindBytes,
        sessionKey,
        threshold: 1
      });
      
      // Decrypt the data (using encryptedData from cache or AWS)
      setDecryptionStep('decrypting');
      const decryptedData = await sealClient.decrypt({
        data: new Uint8Array(encryptedData),
        sessionKey: sessionKey,
        txBytes: txKindBytes // Use the same transaction bytes
      });

      setDecryptionStep('complete');

      // Create blob from decrypted data
      const decryptedBlob = new Blob([decryptedData], { type: 'application/pdf' });
      
      if (onDecrypted) {
        onDecrypted(decryptedBlob);
      }

      toast({
        title: "PDF Decrypted Successfully",
        description: "Your document has been decrypted and is ready to view.",
        variant: "default",
      });

    } catch (error) {
      console.error('[PDFDecryptor] Decryption failed:', error);
      toast({
        title: "Decryption Failed",
        description: error instanceof Error ? error.message : "Failed to decrypt PDF",
        variant: "destructive",
      });
    } finally {
      setIsDecrypting(false);
      setDecryptionStep('idle');
    }
  };

  const renderProgress = () => {
    if (decryptionStep === 'idle' || !isDecrypting) return null;
    
    const steps = {
      'preparing': 'Preparing decryption...',
      'authorizing': 'Authorizing ephemeral key...',
      'signing': 'Signing with ephemeral key...',
      'fetching-keys': 'Fetching decryption keys...',
      'downloading': 'Downloading encrypted PDF...',
      'decrypting': 'Decrypting PDF data...',
      'complete': 'Decryption complete!',
      'cache-hit': 'Using cached encrypted PDF...'
    };
    
    return (
      <div className="mt-2 text-sm text-gray-600">
        {steps[decryptionStep as keyof typeof steps]}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Button
        onClick={decryptAndView}
        disabled={isDecrypting || !ephemeralAddress}
        className="w-full flex items-center justify-center gap-2"
      >
        {isDecrypting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="capitalize">{decryptionStep.replace('-', ' ')}</span>
          </>
        ) : (
          <>
            <FileText className="h-4 w-4" />
            Decrypt & View PDF
          </>
        )}
      </Button>
      
      {renderProgress()}
      
      {isDecrypting && (
        <div className="text-xs text-gray-600 text-center">
          Decryption happens entirely on your device - the file never leaves encrypted
        </div>
      )}
    </div>
  );
} 