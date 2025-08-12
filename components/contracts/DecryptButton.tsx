'use client';

import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { useZkLogin } from '@/app/contexts/ZkLoginContext';
import { Transaction } from '@mysten/sui/transactions';
import { toast } from '@/components/ui/use-toast';
import { SealClient, SessionKey, getAllowlistedKeyServers } from '@mysten/seal';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromB64, fromHEX, } from '@mysten/sui/utils';
import { bech32 } from 'bech32';
import { genAddressSeed, getZkLoginSignature} from '@mysten/sui/zklogin';


// Utility function to decode a Sui bech32 private key
function decodeSuiPrivateKey(suiPrivateKey: string): Uint8Array {
  console.log('[DecryptButton] Decoding bech32 private key...');
  
  try {
    if (!suiPrivateKey.startsWith('suiprivkey1')) {
      throw new Error('Not a valid Sui bech32 private key format');
    }
    
    // Decode the bech32 string
    const decoded = bech32.decode(suiPrivateKey);
    console.log('[DecryptButton] Bech32 decoded successfully');
    
    // Convert the words to bytes
    const privateKeyBytes = Buffer.from(bech32.fromWords(decoded.words));
    console.log('[DecryptButton] Full key size:', privateKeyBytes.length, 'bytes');
    
    // IMPORTANT: Remove the first byte (flag) before creating the keypair
    const secretKey = privateKeyBytes.slice(1);
    console.log('[DecryptButton] Secret key size after removing flag:', secretKey.length, 'bytes');
    
    if (secretKey.length !== 32) {
      throw new Error(`Expected 32 bytes after removing flag, got ${secretKey.length}`);
    }
    
    return new Uint8Array(secretKey);
  } catch (error) {
    console.error('[DecryptButton] Error decoding private key:', error);
    throw new Error(`Failed to decode private key: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Debug function to safely display object structure without circular references
function safeStringify(obj: any, depth = 0, maxDepth = 3): string {
  if (depth > maxDepth) return '[Max Depth Reached]';
  
  try {
    if (obj === null) return 'null';
    if (obj === undefined) return 'undefined';
    if (typeof obj !== 'object') return String(obj);
    
    const isArray = Array.isArray(obj);
    const result: string[] = [];
    
    if (isArray) {
      result.push('[');
      for (let i = 0; i < Math.min(obj.length, 5); i++) {
        if (i > 0) result.push(', ');
        result.push(safeStringify(obj[i], depth + 1, maxDepth));
      }
      if (obj.length > 5) result.push(', ...');
      result.push(']');
    } else {
      result.push('{');
      const keys = Object.keys(obj);
      for (let i = 0; i < Math.min(keys.length, 10); i++) {
        if (i > 0) result.push(', ');
        result.push(`"${keys[i]}": ${safeStringify(obj[keys[i]], depth + 1, maxDepth)}`);
      }
      if (keys.length > 10) result.push(', ...');
      result.push('}');
    }
    
    return result.join('');
  } catch (e) {
    return '[Error Stringifying]';
  }
}

// Interface for the session structure
interface EphemeralSession {
  user: {
    zkLoginState: {
      ephemeralKeyPair: {
        privateKey: string; // Bech32 format
        publicKey: string;  // Base64 format
      }
    },
    address: string; // zkLogin address
  },
  expiry: number;
}

// Define Decrypt Button props
interface DecryptButtonProps {
  contractId: string;
  blobId: string;
  documentIdHex: string;
  allowlistId: string;
  status: string;
}

// Time to live for session key in minutes
const TTL_MIN = 30;

// Local storage key for ephemeral wallet
const EPHEMERAL_STORAGE_KEY = "epochone_session";

// Ephemeral key validity (1 hour in milliseconds)
const EPHEMERAL_KEY_VALIDITY_MS = 60 * 60 * 1000;

const DecryptButton = forwardRef<{ handleDecrypt: () => Promise<void> }, DecryptButtonProps>(({
  contractId,
  blobId,
  documentIdHex,
  allowlistId,
  status
}, ref) => {
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptionStep, setDecryptionStep] = useState<string>('idle');
  const { user, zkLoginState } = useZkLogin();
  const [contractDetails, setContractDetails] = useState<any>(null);
  const [ephemeralKeypair, setEphemeralKeypair] = useState<Ed25519Keypair | null>(null);
  const [ephemeralAddress, setEphemeralAddress] = useState<string | null>(null);

  useEffect(() => {
    // Extract ephemeral keypair from session
    const loadEphemeralKeypair = async () => {
      console.log("[DecryptButton] Loading ephemeral keypair...");
      try {
        const sessionData = localStorage.getItem(EPHEMERAL_STORAGE_KEY);
        if (!sessionData) {
          console.error("[DecryptButton] No session data found in localStorage");
          return;
        }
        
        console.log("[DecryptButton] Raw session data from localStorage (first 100 chars):", 
          sessionData.substring(0, 100) + (sessionData.length > 100 ? '...' : ''));
        
        const sessionObj = JSON.parse(sessionData);
        console.log("[DecryptButton] Session structure:", safeStringify(sessionObj));
        console.log("[DecryptButton] Session keys:", Object.keys(sessionObj));
        
        // Get zkLoginState from the parsed session data
        const zkLoginState = sessionObj.zkLoginState || sessionObj.user.zkLoginState;
        
        if (!zkLoginState) {
          console.error("[DecryptButton] No ephemeral key private key found in session data");
          return;
        }
        
        // Try to find private key in different potential locations
        let privateKey: string | undefined;
        
        // Check root level zkLoginState first (matches the log pattern)
        if (zkLoginState.ephemeralKeyPair?.privateKey) {
          privateKey = zkLoginState.ephemeralKeyPair.privateKey;
          console.log("[DecryptButton] Found privateKey at zkLoginState.ephemeralKeyPair.privateKey");
        } 
        // Fallback to user.zkLoginState if needed
        else if (sessionObj.user?.zkLoginState?.ephemeralKeyPair?.privateKey) {
          privateKey = sessionObj.user.zkLoginState.ephemeralKeyPair.privateKey;
          console.log("[DecryptButton] Found privateKey at sessionObj.user.zkLoginState.ephemeralKeyPair.privateKey");
        }
        
        if (!privateKey) {
          console.error("[DecryptButton] No ephemeral key private key found in session data");
          return;
        }
        
        // Convert Bech32 private key to bytes
        console.log("[DecryptButton] Got private key format:", 
          privateKey.substring(0, 10) + "... (length: " + privateKey.length + ")");
        
        // Check if it's a bech32 format
        if (!privateKey.startsWith('suiprivkey1')) {
          console.error("[DecryptButton] Private key is not in bech32 format:", 
            privateKey.substring(0, 10) + "...");
          return;
        }
        
        // Decode the private key
        const privateKeyBytes = decodeSuiPrivateKey(privateKey);
        
        // Create keypair from private key bytes
        const keypair = Ed25519Keypair.fromSecretKey(privateKeyBytes);
        const address = keypair.getPublicKey().toSuiAddress();
        
        console.log("[DecryptButton] Derived ephemeral wallet address:", address);
        
        setEphemeralKeypair(keypair);
        setEphemeralAddress(address);
      } catch (error) {
        console.error("[DecryptButton] Error loading ephemeral keypair:", error);
      }
    };

    loadEphemeralKeypair();
  }, [zkLoginState]);

  useEffect(() => {
    console.log("[DecryptButton] Current decryption step:", decryptionStep);
  }, [decryptionStep]);

  useImperativeHandle(ref, () => ({
    handleDecrypt
  }));

  // Fetch detailed contract data when needed
  const fetchContractDetails = async () => {
    console.log("[DecryptButton] Fetching contract details from database");
    try {
      const response = await fetch(`/api/contracts/${contractId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch contract: ${response.status}`);
      }
      const data = await response.json();
      console.log("[DecryptButton] Contract details retrieved:", data);
      setContractDetails(data);
      return data;
    } catch (error) {
      console.error("[DecryptButton] Failed to fetch contract details:", error);
      toast({
        title: "Error",
        description: "Failed to retrieve contract details",
        variant: "destructive"
      });
      throw error;
    }
  };

  const authorizeEphemeralKey = async (suiClient: SuiClient, packageId: string, docId: string): Promise<void> => {
    if (!user?.address || !ephemeralAddress || !ephemeralKeypair) {
      throw new Error('User or ephemeral wallet not available');
    }

    console.log("[DecryptButton] Setting up sponsored transaction");
    console.log("[DecryptButton] User (zkLogin) address:", user.address);
    console.log("[DecryptButton] Ephemeral key address:", ephemeralAddress);
    console.log("[DecryptButton] Document ID (hex):", docId);
    setDecryptionStep('authorizing');
    
    try {
      // Format docId correctly - ensure no 0x prefix
      const docIdFormatted = docId.startsWith('0x') ? docId.substring(2) : docId;
      
      // STEP 1: Create transaction with user address as sender
      const tx = new Transaction();
      tx.setSender(user.address);
      
      // Add the Move call
      console.log("[DecryptButton] Adding Move call to authorize ephemeral key:", ephemeralAddress);
      
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
      
      // STEP 2: Build transaction kind bytes (no gas info)
      const txKindBytes = await tx.build({ 
        client: suiClient, 
        onlyTransactionKind: true 
      });
      console.log("[DecryptButton] Transaction kind bytes built");
      
      // STEP 3: Request sponsorship from server
      console.log("[DecryptButton] Requesting transaction sponsorship from server");
      console.log("[DecryptButton] Sponsor request params:", {
        sender: user.address,
        allowlistId,
        ephemeralAddress,
        documentId: docIdFormatted,
        validityMs: EPHEMERAL_KEY_VALIDITY_MS
      });

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
        } catch (e) {
          errorText = await sponsorResponse.text();
        }
        console.error("[DecryptButton] Sponsorship failed:", {
          status: sponsorResponse.status,
          error: errorText
        });
        throw new Error(`Sponsorship failed: ${sponsorResponse.status} ${errorText}`);
      }
      
      const { sponsoredTxBytes } = await sponsorResponse.json();
      
      // STEP 4: Sign the sponsored bytes with ephemeral key
      console.log("[DecryptButton] Signing sponsored transaction with ephemeral keypair");
      const txBlock = Transaction.from(fromB64(sponsoredTxBytes));
      const { signature: userSignature } = await txBlock.sign({
        client: suiClient,
        signer: ephemeralKeypair
      });
      
      // STEP 5: Get session data and create zkLogin signature
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
      console.log("[DecryptButton] Creating zkLogin signature");
      const zkLoginSignature = getZkLoginSignature({
        inputs: {
          ...zkLoginState.zkProofs,
          addressSeed,
        },
        maxEpoch: zkLoginState.maxEpoch,
        userSignature,
      });
      
      // STEP 6: Send to server for execution
      console.log("[DecryptButton] Sending to server for execution");
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
      console.log("[DecryptButton] Transaction executed, digest:", digest);
      
      // Wait for transaction confirmation
      await suiClient.waitForTransaction({
        digest: digest,
        options: { showEffects: true }
      });
      
      console.log("[DecryptButton] Ephemeral key authorization complete");
      
      return;
    } catch (error) {
      console.error("[DecryptButton] Error authorizing ephemeral key:", error);
      throw new Error(`Failed to authorize ephemeral key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleDecrypt = async () => {
    console.log("[DecryptButton] Starting decryption process");
    
    if (!user?.address) {
      console.log("[DecryptButton] user.address:", user?.address); // null or undefined
      console.error("[DecryptButton] No user address found");
      toast({
        title: "Authentication required",
        description: "Please login to decrypt this contract",
        variant: "destructive"
      });
      return;
    }

    if (!ephemeralKeypair || !ephemeralAddress) {
      console.log("[DecryptButton] ephemeralKeypair:", ephemeralKeypair); // null or undefined
      console.log("[DecryptButton] ephemeralAddress:", ephemeralAddress); // null or undefined
      console.error("[DecryptButton] No ephemeral wallet available");
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
      toast({ title: "Starting decryption process..." });
      
      // Fetch contract details
      const contractData = contractDetails || await fetchContractDetails();
      console.log("[DecryptButton] contractData:", contractData);
      
      // Extract blockchain metadata
      const walrusData = contractData.metadata?.walrus;
      console.log("[DecryptButton] walrusData:", walrusData);
      
      const effectiveBlobId = walrusData?.storage?.blobId || blobId;
      const effectiveDocumentId = walrusData?.encryption?.documentId || documentIdHex;
      const effectiveAllowlistId = walrusData?.encryption?.allowlistId || allowlistId;
      
      console.log("[DecryptButton] Using blockchain metadata:", {
        effectiveBlobId,
        effectiveDocumentId,
        effectiveAllowlistId
      });
      
      // Initialize clients
      console.log("[DecryptButton] Initializing Sui client");
      const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });

      

      // Create SealClient with properly formatted parameters
      const sealClient = new SealClient({
        suiClient: suiClient as any,
        serverConfigs: getAllowlistedKeyServers('testnet').map((id) => ({
          objectId: id,
          weight: 1,
        })),
        verifyKeyServers: true
      });
      console.log("[DecryptButton] sealClient:", sealClient);

      // Format document ID correctly
      const docId = effectiveDocumentId.startsWith('0x') ? 
        effectiveDocumentId.substring(2) : effectiveDocumentId;
      console.log("[DecryptButton] docId:", docId);
      
      const packageId = process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID || '';
      console.log("[DecryptButton] packageId:", packageId);
      
      // Authorize ephemeral key
      await authorizeEphemeralKey(suiClient, packageId, docId);
      
      // Create a SessionKey with the ephemeral address
      console.log("[DecryptButton] Creating session key with ephemeral address:", ephemeralAddress);
      
      const sessionKey = new SessionKey({
        address: ephemeralAddress,
        packageId: packageId,
        ttlMin: TTL_MIN,
        signer: ephemeralKeypair,
        suiClient: suiClient as any
      });
      console.log("[DecryptButton] sessionKey:", sessionKey);
      
      // Get personal message and sign it with ephemeral key
      const personalMessage = sessionKey.getPersonalMessage();
      console.log("[DecryptButton] personalMessage:", personalMessage);
      console.log("[DecryptButton] Personal message length:", personalMessage.length);
      
      // Use the ephemeral key to sign the personal message
      setDecryptionStep('signingMessage');
      const signature = await ephemeralKeypair.signPersonalMessage(personalMessage);
      console.log("[DecryptButton] signature:", signature);
      
      // Set the signature on the session key
      console.log("[DecryptButton] Setting signature on session key");
      await sessionKey.setPersonalMessageSignature(signature.signature);
      console.log("[DecryptButton] Signature successfully set on session key");
      
      // Create seal_approve transaction with ephemeral key
      console.log("[DecryptButton] Creating transaction for approval");
      const tx = new Transaction();
      tx.setSender(ephemeralAddress);
      console.log("[DecryptButton] transaction:", tx);
      
      // First, ensure consistent Document ID format
      const rawId = docId.startsWith('0x') ? docId.substring(2) : docId;
      console.log("[DecryptButton] rawId:", rawId);

      // Convert to bytes EXACTLY like in fixed_seal.js
      const documentIdBytes = fromHEX(rawId);
      console.log("[DecryptButton] documentIdBytes:", documentIdBytes);
      console.log("[DecryptButton] Document ID byte length:", documentIdBytes.length);
      console.log("[DecryptButton] First few bytes:", Array.from(documentIdBytes.slice(0, 5)));

      // Then use documentIdBytes in transaction
      tx.moveCall({
        target: `${packageId}::allowlist::seal_approve`,
        arguments: [
          tx.pure.vector('u8', Array.from(documentIdBytes)),
          tx.object(effectiveAllowlistId),
          tx.object('0x6')
        ]
      });
      
      // Build transaction bytes
      const txKindBytes = await tx.build({ 
        client: suiClient, 
        onlyTransactionKind: true
      });
      console.log("[DecryptButton] txKindBytes:", txKindBytes);
      
      // Store this transaction bytes for later use in decryption
      const fetchTxBytes = txKindBytes;
      console.log("[DecryptButton] fetchTxBytes:", fetchTxBytes);

      // Fetch keys with the properly formatted ID
      await sealClient.fetchKeys({
        ids: [rawId], // No 0x prefix
        txBytes: fetchTxBytes,
        sessionKey,
        threshold: 1
      });

      // Log session key info for debugging
      console.log("[DecryptButton] Keys fetched successfully");
      
      // Continue with key fetching and decryption
      setDecryptionStep('fetchingKeys');
      console.log("[DecryptButton] Fetching decryption keys");
      try {
        console.log("[DecryptButton] Keys fetched successfully!");
        // Log session key details
        console.log("[DecryptButton] Session key log:", {
          sessionKey
        });
      } catch (error) {
        console.error("[DecryptButton] Key fetching failed:", error);
        throw error;
      }
      
      // Download encrypted data
      setDecryptionStep('downloading');
      console.log("[DecryptButton] Downloading encrypted contract");
      toast({ title: "Downloading encrypted contract..." });
      const response = await fetch(`/api/contracts/${contractId}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          blobId: effectiveBlobId, 
          allowlistId: effectiveAllowlistId,
          documentIdHex: effectiveDocumentId
        })
      });
      console.log("[DecryptButton] download response:", response);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[DecryptButton] Download failed:", {
          status: response.status,
          text: errorText
        });
        throw new Error(`Failed to download encrypted contract: ${response.status} ${errorText}`);
      }

      const encryptedData = await response.arrayBuffer();
      console.log("[DecryptButton] encryptedData:", encryptedData);
      console.log("[DecryptButton] Encrypted data downloaded, size:", encryptedData.byteLength);
      
      // Decrypt the data
      let decryptedData;
      try {
        setDecryptionStep('decrypting');
        console.log("[DecryptButton] Decrypting document");
        toast({ title: "Decrypting contract..." });
        
        decryptedData = await sealClient.decrypt({
          data: new Uint8Array(encryptedData),
          sessionKey: sessionKey,
          txBytes: fetchTxBytes // Use the exact same bytes from fetching
        });
        console.log("[DecryptButton] decryptedData:", decryptedData);
        console.log("[DecryptButton] Document decrypted successfully, size:", decryptedData.length);
      } catch (error) {
        console.error("[DecryptButton] Failed to decrypt data:", error);
        throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Create blob from decrypted data
      let blob;
      let url;
      try {
        setDecryptionStep('savingFile'); 
        console.log("[DecryptButton] Creating download");
        blob = new Blob([new Uint8Array(decryptedData)], { type: 'application/pdf' });
        console.log("[DecryptButton] blob:", blob);
        url = URL.createObjectURL(blob);
        console.log("[DecryptButton] url:", url);
      } catch (error) {
        console.error("[DecryptButton] Failed to create blob:", error);
        throw new Error(`Failed to create download: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Trigger download
      try {
        const a = document.createElement('a');
        a.href = url;
        a.download = `Contract-${contractId}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log("[DecryptButton] PDF download triggered");
        toast({
          title: "Contract PDF downloaded successfully",
          variant: "success"
        });
        
        setDecryptionStep('complete');
      } catch (error) {
        console.error("[DecryptButton] Failed to trigger download:", error);
        throw new Error(`Failed to download file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } catch (error) {
      console.error("[DecryptButton] Decryption error:", error);
      console.error("[DecryptButton] Error traceback:", error instanceof Error ? error.stack : "No stack trace available");
      
      toast({
        title: "Decryption failed", 
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive"
      });
      
      setDecryptionStep('error');
    } finally {
      setIsDecrypting(false);
    }
  };

  // Show progress details if decrypting
  const renderProgress = () => {
    if (decryptionStep === 'idle' || !isDecrypting) return null;
    
    const steps = {
      'preparing': 'Preparing decryption...',
      'authorizing': 'Authorizing ephemeral key...',
      'signingAuthorization': 'Please sign the authorization transaction...',
      'processingAuthorization': 'Processing authorization...',
      'signingMessage': 'Signing with ephemeral key...',
      'fetchingKeys': 'Fetching decryption keys...',
      'downloading': 'Downloading encrypted contract...',
      'decrypting': 'Decrypting contract data...',
      'savingFile': 'Saving decrypted file...',
      'complete': 'Decryption complete!',
      'error': 'Decryption failed'
    };
    console.log("[DecryptButton] decryptionStep:", decryptionStep);
    console.log("[DecryptButton] steps:", steps);
    
    return (
      <div className="mt-2 text-sm text-gray-600">
        {steps[decryptionStep as keyof typeof steps]}
      </div>
    );
  };

  // Only show for completed contracts
  if (status !== 'COMPLETED') {
    console.log("[DecryptButton] Not rendering - status is not COMPLETED:", status);
    return null;
  }

  console.log("[DecryptButton] Rendering decrypt button", {
    hasEphemeralAddress: !!ephemeralAddress,
    ephemeralAddress
  });
  
  return (
    <div className="flex flex-col gap-2">
      <Button
        onClick={handleDecrypt}
        disabled={isDecrypting || !ephemeralAddress}
        variant="outline"
        size="sm"
        className="flex items-center gap-1"
      >
        {isDecrypting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-1" />
            Decrypting...
          </>
        ) : (
          <>
            <Download className="h-4 w-4 mr-1" />
            Download
          </>
        )}
      </Button>
      
      {renderProgress()}
    </div>
  );
});

DecryptButton.displayName = 'DecryptButton';

export default DecryptButton;