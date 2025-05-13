'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { useZkLogin } from '@/app/contexts/ZkLoginContext';
import { Transaction } from '@mysten/sui/transactions';
import { toast } from '@/components/ui/use-toast';
import { SealClient, SessionKey, getAllowlistedKeyServers } from '@mysten/seal';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromB64, toHEX, fromHEX, toB64 } from '@mysten/sui/utils';
import { bech32 } from 'bech32';
import { genAddressSeed, getZkLoginSignature, jwtToAddress } from '@mysten/sui/zklogin';

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

const DecryptButton: React.FC<DecryptButtonProps> = ({
  contractId,
  blobId,
  documentIdHex,
  allowlistId,
  status
}) => {
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
      // Get admin private key from environment (sponsor)
      const adminPrivateKeyBech32 = process.env.NEXT_PUBLIC_ADMIN_PRIVATE_KEY;
      if (!adminPrivateKeyBech32) {
        throw new Error('Admin private key not available in environment variables');
      }
      
      // Use the same function to decode bech32 private key
      const adminPrivateKeyBytes = decodeSuiPrivateKey(adminPrivateKeyBech32);
      const adminKeypair = Ed25519Keypair.fromSecretKey(adminPrivateKeyBytes);
      
      const adminAddress = adminKeypair.getPublicKey().toSuiAddress();
      console.log("[DecryptButton] Admin wallet address (sponsor):", adminAddress);
      
      // Format docId correctly - ensure no 0x prefix
      const docIdFormatted = docId.startsWith('0x') ? docId.substring(2) : docId;
      
      // STEP 1: Create transaction with ADMIN ADDRESS as sender
      const tx = new Transaction();
      tx.setSender(user.address); // User address is the sender for gas payment
      
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
      
      // STEP 2: Find a gas coin owned by the admin/sponsor
      console.log("[DecryptButton] Finding gas payment coins for sponsor");
      const coins = await suiClient.getCoins({
        owner: adminAddress,
        coinType: '0x2::sui::SUI',
      });

      if (coins.data.length === 0) {
        throw new Error('Sponsor has no SUI coins to pay for gas');
      }

      // Use the first coin as gas payment
      const gasCoin = coins.data[0];
      
      // STEP 3: Set gas configuration
      tx.setGasPayment([{
        objectId: gasCoin.coinObjectId,
        version: gasCoin.version,
        digest: gasCoin.digest
      }]);
      tx.setGasOwner(adminAddress);
      tx.setGasBudget(30000000);
      
      // STEP 4: Build transaction bytes
      const txBytes = await tx.build({ client: suiClient });
      console.log("[DecryptButton] Transaction bytes built with sender:", adminAddress);
      
      // STEP 5: Sign with ephemeral key
      console.log("[DecryptButton] Signing transaction with ephemeral keypair...");
      const { signature: userSignature } = await tx.sign({ client: suiClient, signer: ephemeralKeypair });
      console.log("[DecryptButton] Ephemeral signature:", 
        typeof userSignature === 'string' 
          ? `string (length: ${userSignature.length})` 
          : `binary (${typeof userSignature})`);
      
      // STEP 6: Get session data and create zkLogin signature - USING SAME APPROACH AS TEST
      const sessionData = localStorage.getItem(EPHEMERAL_STORAGE_KEY);
      if (!sessionData) {
        throw new Error("No session data found in localStorage");
      }
      
      const sessionObj = JSON.parse(sessionData);
      const zkLoginState = sessionObj.zkLoginState || sessionObj.user.zkLoginState;
      
      if (!zkLoginState || !zkLoginState.jwt || !zkLoginState.zkProofs) {
        throw new Error("Missing zkLogin state, jwt, or proofs in the session");
      }
      
      // Get salt from current session (match test function approach)
      const salt = zkLoginState.salt;
      if (!salt) {
        throw new Error("No salt found in zkLoginState!");
      }
      
      console.log("[DecryptButton] Using salt from zkLoginState:", salt);
      
      // Parse JWT and create address seed (exactly as in test function)
      const jwt = zkLoginState.jwt;
      const jwtBody = JSON.parse(atob(jwt.split('.')[1]));
      const addressSeed = genAddressSeed(
        BigInt(salt),
        'sub',
        jwtBody.sub,
        jwtBody.aud
      ).toString();
      
      // Verify address matches expected
      const expectedAddress = jwtToAddress(jwt, salt);
      console.log("[DecryptButton] Expected address with salt:", expectedAddress);
      console.log("[DecryptButton] Actual user address:", user.address);
      console.log("[DecryptButton] Address match:", expectedAddress === user.address);
      
      // Create zkLogin signature - USING SAME APPROACH AS TEST
      console.log("[DecryptButton] Creating zkLogin signature");
      const zkLoginSignature = getZkLoginSignature({
        inputs: {
          ...zkLoginState.zkProofs,
          addressSeed,
        },
        maxEpoch: zkLoginState.maxEpoch,
        userSignature,
      });
      
      // STEP 7: Sign with admin key (as the sender)
      console.log("[DecryptButton] Signing transaction with admin/sponsor key...");
      const { signature: sponsorSignature } = await Transaction.from(txBytes).sign({
        client: suiClient,
        signer: adminKeypair,
      });
      
      // STEP 8: Submit transaction with signatures in correct order
      console.log("[DecryptButton] Submitting transaction with signatures");
      console.log('[DecryptButton] zkLoginSignature type:', typeof zkLoginSignature);
      console.log('[DecryptButton] sponsorSignature type:', typeof sponsorSignature);
      
      const result = await suiClient.executeTransactionBlock({
        transactionBlock: txBytes,
        signature: [zkLoginSignature, sponsorSignature],
        options: { showEffects: true, showEvents: true }
      });
      
      console.log("[DecryptButton] Transaction executed, digest:", result.digest);
      
      // Wait for transaction confirmation
      await suiClient.waitForTransaction({
        digest: result.digest,
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
      console.error("[DecryptButton] No user address found");
      toast({
        title: "Authentication required",
        description: "Please login to decrypt this contract",
        variant: "destructive"
      });
      return;
    }

    if (!ephemeralKeypair || !ephemeralAddress) {
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
      
      // Extract blockchain metadata
      const walrusData = contractData.metadata?.walrus;
      const effectiveBlobId = walrusData?.storage?.blobId || blobId;
      const effectiveDocumentId = walrusData?.encryption?.documentId || documentIdHex;
      const effectiveAllowlistId = walrusData?.encryption?.allowlistId || allowlistId;
      
      console.log("[DecryptButton] Using blockchain metadata:", {
        blobId: effectiveBlobId,
        documentId: effectiveDocumentId,
        allowlistId: effectiveAllowlistId
      });
      
      // Initialize clients
      console.log("[DecryptButton] Initializing Sui client");
      const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
      const keyServerIds = await getAllowlistedKeyServers('testnet');
      console.log("[DecryptButton] Key servers:", keyServerIds);
      
      const sealClient = new SealClient({
        suiClient,
        serverObjectIds: keyServerIds,
        verifyKeyServers: true
      });

      // Format document ID correctly
      const docId = effectiveDocumentId.startsWith('0x') ? 
        effectiveDocumentId.substring(2) : effectiveDocumentId;
      
      const packageId = process.env.NEXT_PUBLIC_ALLOWLIST_PACKAGE_ID || '';
      
      // Authorize ephemeral key
      await authorizeEphemeralKey(suiClient, packageId, docId);
      
      // Create a SessionKey with the ephemeral address
      console.log("[DecryptButton] Creating session key with ephemeral address:", ephemeralAddress);
      const sessionKey = new SessionKey({
        address: ephemeralAddress,
        packageId,
        ttlMin: TTL_MIN
      });
      
      // Get personal message and sign it with ephemeral key
      const personalMessage = sessionKey.getPersonalMessage();
      console.log("[DecryptButton] Personal message length:", personalMessage.length);
      
      // Use the ephemeral key to sign the personal message
      setDecryptionStep('signingMessage');
      const signature = await ephemeralKeypair.signPersonalMessage(personalMessage);
      
      // Set the signature on the session key
      console.log("[DecryptButton] Setting signature on session key");
      await sessionKey.setPersonalMessageSignature(signature.signature);
      console.log("[DecryptButton] Signature successfully set on session key");
      
      // Create seal_approve transaction with ephemeral key
      console.log("[DecryptButton] Creating transaction for approval");
      const tx = new Transaction();
      tx.setSender(ephemeralAddress);
      
      // Add the seal_approve move call
      tx.moveCall({
        target: `${packageId}::allowlist::seal_approve`,
        arguments: [
          tx.pure.vector('u8', Array.from(fromHEX(docId))),
          tx.object(effectiveAllowlistId),
          tx.object('0x6') // Clock object ID
        ]
      });
      
      // Build transaction bytes
      const txKindBytes = await tx.build({ 
        client: suiClient, 
        onlyTransactionKind: true
      });
      
      // Continue with key fetching and decryption
      setDecryptionStep('fetchingKeys');
      console.log("[DecryptButton] Fetching decryption keys");
      await sealClient.fetchKeys({
        ids: [docId],
        txBytes: txKindBytes,
        sessionKey,
        threshold: 1
      });
      
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

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[DecryptButton] Download failed:", {
          status: response.status,
          text: errorText
        });
        throw new Error(`Failed to download encrypted contract: ${response.status} ${errorText}`);
      }

      const encryptedData = await response.arrayBuffer();
      console.log("[DecryptButton] Encrypted data downloaded, size:", encryptedData.byteLength);
      
      // Decrypt the data
      setDecryptionStep('decrypting');
      console.log("[DecryptButton] Decrypting document");
      toast({ title: "Decrypting contract..." });
      const decryptedData = await sealClient.decrypt({
        data: new Uint8Array(encryptedData),
        sessionKey: sessionKey,
        txBytes: txKindBytes
      });
      console.log("[DecryptButton] Document decrypted successfully, size:", decryptedData.length);

      // Create download for user
      setDecryptionStep('savingFile');
      console.log("[DecryptButton] Creating download");
      const blob = new Blob([decryptedData], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `Contract-${contractId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log("[DecryptButton] Download triggered");
      toast({
        title: "Contract downloaded successfully",
        variant: "success"
      });
      
      setDecryptionStep('complete');
    } catch (error) {
      console.error("[DecryptButton] Decryption error:", error);
      
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
  


  // Modified testZkLoginTransaction - Send SUI from zkLogin wallet to admin wallet
  const testZkLoginTransaction = async () => {
    try {
      const adminAddress = "0xb21f25e47d081017776083518f8d8b0d2138107299edb20883468f5d85194d03";
      
      if (!user?.address || !ephemeralKeypair) {
        console.error("[TEST] Missing zkLogin wallet data");
        return false;
      }
      
      console.log("[TEST] Starting user-to-admin transaction test");
      console.log("[TEST] User zkLogin address:", user.address);
      console.log("[TEST] Sending to admin address:", adminAddress);
      
      // Create SuiClient
      const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
      
      // Get session data and JWT from current session
      const sessionData = localStorage.getItem(EPHEMERAL_STORAGE_KEY);
      if (!sessionData) {
        console.error("[TEST] No session data found in localStorage");
        return false;
      }
      
      const sessionObj = JSON.parse(sessionData);
      const zkLoginState = sessionObj.zkLoginState || sessionObj.user.zkLoginState;
      
      if (!zkLoginState || !zkLoginState.jwt) {
        console.error("[TEST] Missing zkLoginState or JWT in session");
        return false;
      }
      
      // Verify zkLogin session integrity
      const jwt = zkLoginState.jwt;
      const jwtHeader = jwt.split('.')[0];
      const zkProofHeader = zkLoginState.zkProofs.headerBase64;
      
      console.log("[TEST] JWT header:", jwtHeader);
      console.log("[TEST] ZK proof header:", zkProofHeader);
      console.log("[TEST] Headers match:", jwtHeader === zkProofHeader);
      
      if (jwtHeader !== zkProofHeader) {
        console.error("[TEST] ZK proof was generated with a different JWT than the one in the session!");
        return false;
      }
      
      // Get salt from current session
      const salt = zkLoginState.salt;
      if (!salt) {
        console.error("[TEST] No salt found in zkLoginState!");
        return false;
      }
      
      console.log("[TEST] Using salt from zkLoginState:", salt);
      
      // Build transaction to send minimum SUI to admin
      const tx = new Transaction();
      tx.setSender(user.address);
      
      // Split 1 MIST (minimum amount) and send to admin
      const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(1)]);
      tx.transferObjects([coin], tx.pure.address(adminAddress));
      
      tx.setGasBudget(10000000);
      
      // Sign with ephemeral key
      console.log("[TEST] Signing with ephemeral key");
      const { bytes: txBytes, signature: userSignature } = 
        await tx.sign({ client: suiClient, signer: ephemeralKeypair });
      
      // Parse JWT and create address seed
      const jwtBody = JSON.parse(atob(jwt.split('.')[1]));
      const addressSeed = genAddressSeed(
        BigInt(salt),
        'sub',
        jwtBody.sub,
        jwtBody.aud
      ).toString();
      
      // Verify address
      const expectedAddress = jwtToAddress(jwt, salt);
      console.log("[TEST] Expected address with salt:", expectedAddress);
      console.log("[TEST] Actual user address:", user.address);
      console.log("[TEST] Address match:", expectedAddress === user.address);
      
      // Create zkLogin signature using current session's proofs
      console.log("[TEST] Creating zkLogin signature");
      const zkLoginSignature = getZkLoginSignature({
        inputs: {
          ...zkLoginState.zkProofs,
          addressSeed,
        },
        maxEpoch: zkLoginState.maxEpoch,
        userSignature,
      });
      
      // Execute transaction
      console.log("[TEST] Executing user-to-admin transaction");
      const result = await suiClient.executeTransactionBlock({
        transactionBlock: txBytes,
        signature: zkLoginSignature, 
        options: { showEffects: true },
      });
      
      console.log("[TEST] User-to-admin transaction success:", result.digest);
      toast({
        title: "Success",
        description: `You sent 1 MIST to admin wallet: ${adminAddress.substring(0, 10)}...`,
        variant: "success",
      });
      return true;
    } catch (error) {
      console.error("[TEST] zkLogin transaction failed:", error);
      // Enhanced error reporting
      if (error instanceof Error) {
        console.error("[TEST] Error name:", error.name);
        console.error("[TEST] Error message:", error.message);
        toast({
          title: "Failed",
          description: error.message,
        variant: "destructive",
      });
        if ('stack' in error) {
          console.error("[TEST] Error stack:", error.stack);
        }
      } else {
        console.error("[TEST] Unknown error type:", typeof error);
        toast({
          title: "Failed",
          description: "Unknown error during transaction",
          variant: "destructive",
        });
      }
      return false;
    }
  };


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
      
      
      
      <Button
        onClick={testZkLoginTransaction}
        disabled={isDecrypting || !ephemeralAddress}
        variant="secondary"
        size="sm"
        className="flex items-center gap-1"
      >
        Test zkLogin TX
      </Button>
      

      
     
      
     
      
      
      
      {renderProgress()}
    </div>
  );
};


export default DecryptButton;
