import React, { useState, useEffect } from 'react';
import { SuiClient } from '@mysten/sui/client';
import { useCurrentAccount, useSignPersonalMessage } from '@mysten/dapp-kit';
import { SealClient, SessionKey } from '@mysten/seal';
import { Transaction } from '@mysten/sui/transactions';
import { fromHEX } from '@mysten/sui/utils';
import axios from 'axios';

// Configuration constants
const SEAL_PACKAGE_ID = process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID;
const ALLOWLIST_PACKAGE_ID = process.env.NEXT_PUBLIC_ALLOWLIST_PACKAGE_ID || SEAL_PACKAGE_ID;
const MODULE_NAME = 'allowlist';
const NETWORK = process.env.NEXT_PUBLIC_NETWORK || 'testnet';

interface DecryptionProps {
  blobId: string;
  allowlistId: string; 
  documentId: string;
  onComplete: (decryptedData: Uint8Array) => void;
}

const DocumentDecrypter: React.FC<DecryptionProps> = ({ 
  blobId,
  allowlistId,
  documentId,
  onComplete
}) => {
  const [status, setStatus] = useState<string>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  
  // Get the current zkLogin account from dapp-kit
  const currentAccount = useCurrentAccount();
  const { mutate: signPersonalMessage } = useSignPersonalMessage();
  
  // Initialize SUI client
  const suiClient = new SuiClient({
    url: getNetworkUrl(NETWORK),
  });

  const decryptDocument = async () => {
    if (!currentAccount) {
      setError('No wallet connected. Please connect your zkLogin wallet first.');
      return;
    }

    try {
      setStatus('downloading');
      setProgress(10);
      
      // Step 1: Download encrypted document from Walrus
      const encryptedData = await downloadFromWalrus(blobId);
      setProgress(30);
      
      // Step 2: Initialize SEAL client
      const sealClient = new SealClient({
        suiClient,
        serverObjectIds: await getKeyServerIds(),
        verifyKeyServers: false,
      });
      setProgress(40);
      
      // Step 3: Create session key with zkLogin
      console.log("[DecryptButton] Using zkLogin address:", currentAccount.address);

      // Log all local storage data related to keys and zkLogin
      console.log("[DEBUG] Checking local storage for keys and zkLogin data");

      // Get all localStorage contents related to zkLogin
      const localStorage = window.localStorage;
      const relevantKeys = [];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.includes('zk') || 
          key.includes('login') || 
          key.includes('session') || 
          key.includes('wallet') || 
          key.includes('key') || 
          key.includes('contract')
        )) {
          try {
            const value = localStorage.getItem(key);
            // Try to parse JSON values
            try {
              const parsedValue = JSON.parse(value);
              console.log(`[LocalStorage] Key: ${key}, Parsed Value:`, parsedValue);
              
              // Check specifically for ephemeralKeyPair
              if (parsedValue.zkLoginState?.ephemeralKeyPair) {
                console.log("[IMPORTANT] Found ephemeralKeyPair in", key);
                console.log("Private Key:", parsedValue.zkLoginState.ephemeralKeyPair.privateKey);
                console.log("Public Key:", parsedValue.zkLoginState.ephemeralKeyPair.publicKey);
              }
              
              relevantKeys.push({
                key,
                valueType: 'json',
                value: parsedValue
              });
            } catch {
              // If not JSON, store as string
              console.log(`[LocalStorage] Key: ${key}, String Value:`, value);
              relevantKeys.push({
                key,
                valueType: 'string',
                value
              });
            }
          } catch (error) {
            console.error(`[LocalStorage] Error reading key ${key}:`, error);
          }
        }
      }

      console.log("[DEBUG] All relevant localStorage keys:", relevantKeys);

      // Get the zkLogin session from localStorage
      console.log("[DEBUG] Getting epochone_session from localStorage");
      const sessionData = localStorage.getItem('epochone_session');

      if (!sessionData) {
        console.error("[DEBUG] No epochone_session found in localStorage!");
        // Continue with other logic...
      } else {
        try {
          const parsedSession = JSON.parse(sessionData);
          console.log("[DEBUG] Found session data:", {
            hasUser: !!parsedSession.user,
            userAddress: parsedSession.user?.address,
            hasEphemeralKeyPair: !!parsedSession.zkLoginState?.ephemeralKeyPair
          });
          
          if (parsedSession.zkLoginState?.ephemeralKeyPair?.privateKey) {
            // Extract the private key
            const privateKey = parsedSession.zkLoginState.ephemeralKeyPair.privateKey;
            const publicKey = parsedSession.zkLoginState.ephemeralKeyPair.publicKey;
            
            console.log("[DEBUG] Found ephemeral keypair:");
            console.log("Private Key:", privateKey);
            console.log("Public Key:", publicKey);
            
            // Now try to create a keypair using this private key
            try {
              const { Ed25519Keypair } = await import('@mysten/sui/keypairs/ed25519');
              const { suiPrivkeyToKeypair } = await import('@/api/upload_encrypt_download_decrypt/sui_key_utils');
              
              console.log("[DEBUG] Creating keypair from localStorage private key");
              const keypair = suiPrivkeyToKeypair(privateKey);
              
              // Log the keypair details
              const keypairAddress = keypair.getPublicKey().toSuiAddress();
              console.log("[DEBUG] Created keypair with address:", keypairAddress);
              console.log("[DEBUG] Created keypair public key (base64):", keypair.getPublicKey().toBase64());
              console.log("[DEBUG] User wallet address from session:", parsedSession.user?.address);
              console.log("[DEBUG] Do addresses match?", keypairAddress === parsedSession.user?.address);
              
              // Now use this keypair for the rest of the decryption process
              
              // Create session key with the user's wallet address from the session
              const sessionKey = new SessionKey({
                address: parsedSession.user.address, // Use the user's wallet address from the session
                packageId: fromHEX(ALLOWLIST_PACKAGE_ID),
                ttlMin: 10,
              });
              
              // Get personal message for signing
              const personalMessage = sessionKey.getPersonalMessage();
              console.log("[DEBUG] Personal message length:", personalMessage.length);
              console.log("[DEBUG] Personal message hex:", Buffer.from(personalMessage).toString('hex'));
              
              // Sign with the keypair from localStorage
              console.log("[DEBUG] Signing personal message with keypair from localStorage");
              const { signature } = await keypair.signPersonalMessage(personalMessage);
              console.log("[DEBUG] Signature received:", 
                typeof signature === 'string' ? signature : 'Binary signature');
              
              // Set the signature on the session key
              console.log("[DEBUG] Setting signature on session key");
              await sessionKey.setPersonalMessageSignature(signature);
              console.log("[DEBUG] Signature successfully set on session key");
              
              // Create transaction for approval
              console.log("[DEBUG] Creating transaction for approval");
              const tx = new Transaction();
              tx.setSender(parsedSession.user.address); // Use the user's wallet address from the session
              
              // Add the seal_approve move call
              tx.moveCall({
                target: `${ALLOWLIST_PACKAGE_ID}::${MODULE_NAME}::seal_approve`,
                arguments: [
                  tx.pure.vector("u8", Array.from(fromHEX(documentId))),
                  tx.object(allowlistId)
                ]
              });
              
              // Build ONLY the transaction kind
              const txKindBytes = await tx.build({ 
                client: suiClient, 
                onlyTransactionKind: true
              });
              setProgress(70);
              
              // Step 5: Fetch keys from SEAL servers
              const rawId = documentId.startsWith('0x') ? documentId.substring(2) : documentId;
              
              await sealClient.fetchKeys({
                ids: [rawId],
                txBytes: txKindBytes,
                sessionKey,
                threshold: 1,
              });
              setProgress(80);
              
              // Step 6: Decrypt the document
              setStatus('decrypting');
              const decryptedData = await sealClient.decrypt({
                data: encryptedData,
                sessionKey,
                txBytes: txKindBytes,
              });
              setProgress(100);
              
              // Pass decrypted data to the callback
              onComplete(decryptedData);
              setStatus('complete');
              
            } catch (error) {
              console.error("[DEBUG] Failed to create keypair from localStorage private key:", error);
              // Fall back to your existing logic...
            }
          } else {
            console.error("[DEBUG] No ephemeral keypair found in session data");
            // Fall back to your existing logic...
          }
        } catch (error) {
          console.error("[DEBUG] Error parsing session data:", error);
          // Fall back to your existing logic...
        }
      }
    } catch (error) {
      console.error('Decryption error:', error);
      setStatus('error');
      setError(error instanceof Error ? error.message : 'An unknown error occurred');
    }
  };
  
  // Helper function to download from Walrus
  const downloadFromWalrus = async (blobId: string): Promise<Uint8Array> => {
    const response = await axios.get(`/api/walrus/download/${blobId}`, {
      responseType: 'arraybuffer',
    });
    
    return new Uint8Array(response.data);
  };
  
  // Get key server object IDs
  const getKeyServerIds = async (): Promise<string[]> => {
    try {
      const response = await axios.get(`/api/keyservers/${NETWORK}`);
      return response.data.keyServerIds;
    } catch (error) {
      // Fallback to hardcoded IDs for demonstration
      console.warn('Failed to fetch key server IDs, using defaults');
      return [
        '0x5e64247ebc1ee97d06a51e868b6ca48911bc2d27669f7fed5b8c5266436778a3',
        '0x26140455bcee04ef81e294e091c7498d0497a451c456be2e5e4e2f85ad615cad'
      ];
    }
  };
  
  // Get network URL based on environment
  const getNetworkUrl = (network: string): string => {
    switch (network.toLowerCase()) {
      case 'mainnet':
        return 'https://fullnode.mainnet.sui.io:443';
      case 'testnet':
        return 'https://fullnode.testnet.sui.io:443';
      case 'devnet':
        return 'https://fullnode.devnet.sui.io:443';
      default:
        return 'https://fullnode.testnet.sui.io:443';
    }
  };

  return (
    <div className="decryption-container">
      <h2>Document Decryption</h2>
      <div className="progress-bar">
        <div 
          className="progress-fill" 
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="status-display">
        {status === 'idle' && (
          <button 
            onClick={decryptDocument} 
            disabled={!currentAccount}
            className="decrypt-button"
          >
            Decrypt Document
          </button>
        )}
        {status === 'downloading' && <p>Downloading encrypted document...</p>}
        {status === 'signing' && <p>Please sign with your zkLogin wallet...</p>}
        {status === 'approving' && <p>Preparing approval transaction...</p>}
        {status === 'decrypting' && <p>Decrypting document...</p>}
        {status === 'complete' && <p>Document decrypted successfully!</p>}
        {status === 'error' && (
          <div className="error-message">
            <p>Error: {error}</p>
            <button onClick={decryptDocument}>Retry</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentDecrypter;
