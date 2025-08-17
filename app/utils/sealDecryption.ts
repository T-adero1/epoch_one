'use client';

import { SealClient, SessionKey, getAllowlistedKeyServers } from '@mysten/seal';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { fromHEX } from '@mysten/sui/utils';
import { genAddressSeed, getZkLoginSignature } from '@mysten/sui/zklogin';

interface DecryptionParams {
  contract: any;
  cachedSessionKey?: SessionKey;
  onProgress?: (progress: number) => void;
  onStepChange?: (step: string) => void;
}

interface DecryptionResult {
  decryptedData: Uint8Array;
  sessionKey: SessionKey;
  wasFromCache: boolean;
}

/**
 * COMPLETE SEAL Decryption Utility
 * Handles everything: metadata, download, auth, decryption
 * Optimized with SessionKey caching for fast re-decryption
 */
export async function decryptContractPDF(params: DecryptionParams): Promise<DecryptionResult> {
  const { contract, cachedSessionKey, onProgress, onStepChange } = params;

  console.log('[SEAL_DECRYPT] Starting complete decryption flow for contract:', contract.id);
  
  try {
    // **CONSTANTS**
    const SEAL_PACKAGE_ID = process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID || 
      '0xb5c84864a69cb0b495caf548fa2bf0d23f6b69b131fa987d6f896d069de64429';
    const TTL_MIN = 30;

    onProgress?.(10);
    onStepChange?.('loading-metadata');

    // **STEP 1: Load encryption metadata**
    console.log('[SEAL_DECRYPT] Loading encryption metadata...');
    let allowlistId = contract.sealAllowlistId || contract.metadata?.walrus?.encryption?.allowlistId;
    let documentId = contract.sealDocumentId || contract.metadata?.walrus?.encryption?.documentId;
    let capId = contract.sealCapId || contract.metadata?.walrus?.encryption?.capId;

    // If missing, fetch fresh data from database
    if (!allowlistId) {
      console.log('[SEAL_DECRYPT] Fetching fresh contract data...');
      const response = await fetch(`/api/contracts/${contract.id}`);
      if (response.ok) {
        const freshData = await response.json();
        allowlistId = freshData.sealAllowlistId || freshData.metadata?.walrus?.encryption?.allowlistId;
        documentId = freshData.sealDocumentId || freshData.metadata?.walrus?.encryption?.documentId;
        capId = freshData.sealCapId || freshData.metadata?.walrus?.encryption?.capId;
      }
    }

    if (!allowlistId || !documentId) {
      throw new Error('Encryption metadata not found. The file may still be processing.');
    }

    onProgress?.(20);
    onStepChange?.('downloading');

    // **STEP 2: Download encrypted data (with caching)**
    console.log('[SEAL_DECRYPT] Getting encrypted data...');
    let encryptedData: ArrayBuffer;
    
    try {
      const { pdfCache } = await import('@/app/utils/pdfCache');
      const cachedPDF = await pdfCache.getEncryptedPDF(contract.id);
      
      if (cachedPDF) {
        console.log('[SEAL_DECRYPT] Using cached encrypted PDF');
        encryptedData = cachedPDF.encryptedData.buffer as ArrayBuffer;
      } else {
        throw new Error('Not in cache');
      }
      } catch (cacheError) {
        // Fallback to AWS download
        console.log('[SEAL_DECRYPT] Cache miss, downloading from AWS', cacheError);
        const response = await fetch(`/api/contracts/download-pdf/${contract.id}?view=inline`);
      
      if (!response.ok) {
        throw new Error('Failed to download encrypted PDF from AWS');
      }

      encryptedData = await response.arrayBuffer();
      
      // Cache the downloaded encrypted data for next time
      try {
        const { pdfCache } = await import('@/app/utils/pdfCache');
        await pdfCache.storeEncryptedPDF(
          contract.id,
          new Uint8Array(encryptedData),
          contract.s3FileName || 'encrypted-contract.pdf',
          {
            allowlistId,
            documentId,
            capId: capId || '',
            isEncrypted: true
          }
        );
        console.log('[SEAL_DECRYPT] Cached downloaded encrypted PDF');
      } catch (cacheError) {
        console.warn('[SEAL_DECRYPT] Failed to cache downloaded PDF:', cacheError);
      }
    }

    onProgress?.(40);
    onStepChange?.('initializing-seal');

    // **STEP 3: Initialize SEAL client**
    console.log('[SEAL_DECRYPT] Initializing SEAL client...');
    const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
    const sealClient = new SealClient({
      suiClient: suiClient as any,
      serverConfigs: getAllowlistedKeyServers('testnet').map((id) => ({
        objectId: id,
        weight: 1,
      })),
      verifyKeyServers: true
    });

    // **STEP 4: OPTIMAL SessionKey handling**
    let sessionKeyToUse: SessionKey;
    let wasFromCache = false;

    // **SIMPLE IF/ELSE: Check cached SessionKey FIRST**
    if (cachedSessionKey && !cachedSessionKey.isExpired()) {
      console.log('[SEAL_DECRYPT] ✅ FAST PATH: Using cached SessionKey - SKIPPING ALL AUTH!');
      sessionKeyToUse = cachedSessionKey;
      wasFromCache = true;
      
      // Jump directly to decryption
      onProgress?.(80);
      onStepChange?.('fetching-keys');
      
    } else {
      console.log('[SEAL_DECRYPT] ❌ SLOW PATH: Creating new SessionKey with full auth...');
      
      onProgress?.(50);
      onStepChange?.('authorizing');

      // **FULL AUTHORIZATION FLOW ONLY WHEN NEEDED**
      sessionKeyToUse = await createNewSessionKey({
        suiClient,
        allowlistId,
        documentId,
        contractId: contract.id,
        sealPackageId: SEAL_PACKAGE_ID,
        ttlMin: TTL_MIN,
        onProgress,
        onStepChange
      });
      
      wasFromCache = false;
      onProgress?.(70);
      onStepChange?.('fetching-keys');
    }

    // **STEP 5: SHARED DECRYPTION LOGIC**
    console.log('[SEAL_DECRYPT] 🚀 Starting decryption with SessionKey:', {
      address: sessionKeyToUse.getAddress(),
      isExpired: sessionKeyToUse.isExpired(),
      fromCache: wasFromCache
    });

    // Create seal_approve transaction (local - no network calls)
    const tx = new Transaction();
    tx.setSender(sessionKeyToUse.getAddress());
    
    const rawId = documentId.startsWith('0x') ? documentId.substring(2) : documentId;
    const documentIdBytes = fromHEX(rawId);

    tx.moveCall({
      target: `${SEAL_PACKAGE_ID}::allowlist::seal_approve`,
      arguments: [
        tx.pure.vector('u8', Array.from(documentIdBytes)),
        tx.object(allowlistId),
        tx.object('0x6')
      ]
    });

    const txKindBytes = await tx.build({ 
      client: suiClient, 
      onlyTransactionKind: true
    });

    // Fetch keys from SEAL servers
    console.log('[SEAL_DECRYPT] Fetching decryption keys from SEAL servers...');
    await sealClient.fetchKeys({
      ids: [rawId],
      txBytes: txKindBytes,
      sessionKey: sessionKeyToUse,
      threshold: 1
    });

    onProgress?.(90);
    onStepChange?.('decrypting');

    // Decrypt data
    console.log('[SEAL_DECRYPT] Decrypting data locally...');
    const decryptedData = await sealClient.decrypt({
      data: new Uint8Array(encryptedData),
      sessionKey: sessionKeyToUse,
      txBytes: txKindBytes
    });

    onProgress?.(100);
    onStepChange?.('complete');

    console.log('[SEAL_DECRYPT] ✅ Decryption complete!', {
      originalSize: encryptedData.byteLength,
      decryptedSize: decryptedData.length,
      fromCache: wasFromCache,
      timeSaved: wasFromCache ? 'Major (skipped auth)' : 'None (full flow)'
    });

    return {
      decryptedData,
      sessionKey: sessionKeyToUse,
      wasFromCache
    };

  } catch (error) {
    console.error('[SEAL_DECRYPT] Decryption failed:', error);
    throw error;
  }
}

/**
 * Create new SessionKey with full authorization flow
 * Only called when no valid cached SessionKey exists
 */
async function createNewSessionKey(params: {
  suiClient: SuiClient;
  allowlistId: string;
  documentId: string;
  contractId: string;
  sealPackageId: string;
  ttlMin: number;
  onProgress?: (progress: number) => void;
  onStepChange?: (step: string) => void;
}): Promise<SessionKey> {
  
  const { suiClient, allowlistId, documentId, contractId, sealPackageId, ttlMin } = params;
  
  console.log('[SEAL_DECRYPT] Creating new SessionKey with full authorization...');

  // Get session data for JWT and user info
  const sessionData = localStorage.getItem("epochone_session");
  if (!sessionData) {
    throw new Error("No session data found in localStorage");
  }
  
  const sessionObj = JSON.parse(sessionData);
  const zkLoginState = sessionObj.zkLoginState || sessionObj.user.zkLoginState;
  
  if (!zkLoginState?.jwt) {
    throw new Error("No JWT found in session data");
  }

  // Get user info from session
  const userAddress = sessionObj.user?.address || sessionObj.userAddress;
  const userGoogleId = sessionObj.user?.googleId || sessionObj.userGoogleId;

  if (!userAddress || !userGoogleId) {
    throw new Error('User address or Google ID not found in session');
  }

  // Create contract-specific wallet
  const { getOrCreateContractWallet } = await import('@/app/utils/contractWallet');
  const contractWallet = await getOrCreateContractWallet(userGoogleId, contractId, zkLoginState.jwt);
  
  // Get ephemeral keypair and address
  const ephemeralKeypair = contractWallet.ephemeralKeyPair;
  const ephemeralPublicKeyAddress = ephemeralKeypair.getPublicKey().toSuiAddress();

  // Sponsor and execute authorization transaction
  const docId = documentId.startsWith('0x') ? documentId.substring(2) : documentId;

  // ✅ Extract JWT expiry from the JWT token
  const jwtExpiryMs = (() => {
    try {
      console.log('[SEAL_DECRYPT] Extracting JWT expiry from token...');
      const jwtParts = zkLoginState.jwt.split('.');
      
      if (jwtParts.length !== 3) {
        throw new Error('Invalid JWT format');
      }
      
      const jwtPayload = JSON.parse(atob(jwtParts[1]));
      console.log('[SEAL_DECRYPT] JWT payload extracted:', { 
        sub: jwtPayload.sub?.substring(0, 8) + '...', 
        exp: jwtPayload.exp,
        iat: jwtPayload.iat 
      });
      
      if (!jwtPayload.exp) {
        throw new Error('JWT missing expiry (exp) field');
      }
      
      const expiryMs = jwtPayload.exp * 1000;
      const timeUntilExpiry = expiryMs - Date.now();
      
      console.log('[SEAL_DECRYPT] JWT expires at:', new Date(expiryMs).toISOString());
      console.log('[SEAL_DECRYPT] Time until expiry:', Math.round(timeUntilExpiry / 1000 / 60), 'minutes');
      
      if (timeUntilExpiry <= 0) {
        console.warn('[SEAL_DECRYPT] JWT is already expired!');
      }
      
      return expiryMs;
      
    } catch (error) {
      console.warn('[SEAL_DECRYPT] Failed to parse JWT expiry, using 24h fallback:', error);
      return Date.now() + (24 * 60 * 60 * 1000);
    }
  })();

  const sponsorResponse = await fetch('/api/auth/sponsor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: contractWallet.address,
      allowlistId,
      ephemeralAddress: ephemeralPublicKeyAddress,
      documentId: docId,
      validityMs: 60 * 60 * 1000,
      encryptedJWT: zkLoginState.encryptedJWT, 
      jwtExpiryMs: jwtExpiryMs 
    })
  });

  if (!sponsorResponse.ok) {
    const errorText = await sponsorResponse.text();
    throw new Error(`Sponsorship failed: ${sponsorResponse.status} ${errorText}`);
  }
  
  const { sponsoredTxBytes } = await sponsorResponse.json();
  
  // Sign and execute
  const { fromB64 } = await import('@mysten/sui/utils');
  const txBlock = Transaction.from(fromB64(sponsoredTxBytes));
  const { signature: userSignature } = await txBlock.sign({
    client: suiClient,
    signer: ephemeralKeypair
  });

  const contractZkState = contractWallet.zkLoginState;
  const contractSalt = contractZkState.salt; 
  const contractZkProofs = contractZkState.zkProofs;
  const originalJwt = zkLoginState.jwt;
  const originalMaxEpoch = zkLoginState.maxEpoch;

  if (!contractSalt || !originalJwt || !contractZkProofs || !originalMaxEpoch) {
    throw new Error("Missing zkLogin state data");
  }
  
  const jwtBody = JSON.parse(atob(originalJwt.split('.')[1]));
  const addressSeed = genAddressSeed(
    BigInt(contractSalt),
    'sub',
    jwtBody.sub,
    jwtBody.aud
  ).toString();
  
  const zkLoginSignature = getZkLoginSignature({
    inputs: {
      ...contractZkProofs,
      addressSeed,
    },
    maxEpoch: originalMaxEpoch,
    userSignature,
  });
  
  // Execute authorization
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

  // Create new SessionKey
  const newSessionKey = new SessionKey({
    address: ephemeralPublicKeyAddress,
    packageId: sealPackageId,
    ttlMin: ttlMin,
    signer: ephemeralKeypair,
    suiClient: suiClient as any
  });

  // Sign personal message
  const personalMessage = newSessionKey.getPersonalMessage();
  const signature = await ephemeralKeypair.signPersonalMessage(personalMessage);
  await newSessionKey.setPersonalMessageSignature(signature.signature);

  console.log('[SEAL_DECRYPT] New SessionKey created and signed successfully');
  return newSessionKey;
}
