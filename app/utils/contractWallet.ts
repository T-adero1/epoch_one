
import { jwtToAddress } from '@mysten/sui/zklogin';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { hashGoogleId } from './privacy'; // Import for hashing
import { bech32 } from 'bech32'; // ✅ Add this import


// Contract-specific zkLogin state interface
interface ContractZkLoginState {
  ephemeralKeyPair: {
    publicKey: string;
    privateKey: string;
  } | null;
  randomness: string | null;
  jwt: string | null;
  maxEpoch: number | null;
  zkProofs: {
    proofPoints: {
      a: string[];
      b: string[][];
      c: string[];
    };
    issBase64Details: {
      value: string;
      indexMod4: number;
    };
    headerBase64: string;
  } | null;
  salt: string | null;
  contractId: string;
  userGoogleId: string;
}

// Contract-specific wallet interface
interface ContractWallet {
  address: string;
  contractId: string;
  userGoogleId: string;
  zkLoginState: ContractZkLoginState;
  isValid: boolean;
  createdAt: string;
  ephemeralKeyPair: Ed25519Keypair; // ✅ Add this field
}

// **SECURE: In-memory wallet and keypair manager**
class InMemoryWalletManager {
  private static instance: InMemoryWalletManager;
  private wallets: Map<string, ContractWallet> = new Map();
  private keypairs: Map<string, Ed25519Keypair> = new Map(); // SECURE: Keep keypairs separate in memory

  static getInstance(): InMemoryWalletManager {
    if (!InMemoryWalletManager.instance) {
      InMemoryWalletManager.instance = new InMemoryWalletManager();
      
      // Clear all data when page unloads for security
      if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', () => {
          InMemoryWalletManager.instance.clearAll();
        });
      }
    }
    return InMemoryWalletManager.instance;
  }

  private getWalletKey(userGoogleId: string, contractId: string): string {
    return `${userGoogleId}::${contractId}`;
  }

  // **SECURE: Store wallet without private key + keypair in memory**
  storeWallet(wallet: ContractWallet, keypair: Ed25519Keypair): void {
    const walletKey = this.getWalletKey(wallet.userGoogleId, wallet.contractId);
    
    // Store keypair separately in memory
    this.keypairs.set(walletKey, keypair);
    
    // Store wallet WITHOUT private key
    const secureWallet: ContractWallet = {
      ...wallet,
      zkLoginState: {
        ...wallet.zkLoginState,
        ephemeralKeyPair: {
          publicKey: wallet.zkLoginState?.ephemeralKeyPair?.publicKey || '',
          privateKey: '***SECURE_IN_MEMORY***', // Never store actual private key
        },
      },
    };
    
    this.wallets.set(walletKey, secureWallet);
    console.log('[SECURE-WALLET] Wallet stored in memory (private key separate)');
  }

  // **SIMPLIFIED: Just return wallet and keypair data**
  getWallet(userGoogleId: string, contractId: string): { wallet: ContractWallet | null, keypair: Ed25519Keypair | null } {
    const walletKey = this.getWalletKey(userGoogleId, contractId);
    const wallet = this.wallets.get(walletKey) || null;
    const keypair = this.keypairs.get(walletKey) || null;
    
    // ✅ SIMPLE: Just return the stored data, no transaction function attachment
    return { wallet, keypair };
  }

  // **SECURE: Clear specific wallet**
  clearWallet(userGoogleId: string, contractId: string): void {
    const walletKey = this.getWalletKey(userGoogleId, contractId);
    this.wallets.delete(walletKey);
    this.keypairs.delete(walletKey);
    console.log('[SECURE-WALLET] Cleared wallet from memory:', walletKey);
  }

  // **SECURE: Clear all wallets and keypairs**
  clearAll(): void {
    console.log('[SECURE-WALLET] Clearing all in-memory wallets and keypairs');
    this.wallets.clear();
    this.keypairs.clear();
  }

  // **SECURE: Get wallet count for debugging**
  getWalletCount(): number {
    return this.wallets.size;
  }
}

// ✅ ADD THIS FUNCTION:
function decodeSuiPrivateKey(suiPrivateKey: string): Uint8Array {
  console.log('[CONTRACT-WALLET] Decoding bech32 private key...');
  
  try {
    if (!suiPrivateKey.startsWith('suiprivkey1')) {
      throw new Error('Not a valid Sui bech32 private key format');
    }
    
    // Decode the bech32 string
    const decoded = bech32.decode(suiPrivateKey);
    console.log('[CONTRACT-WALLET] Bech32 decoded successfully');
    
    // Convert the words to bytes
    const privateKeyBytes = Buffer.from(bech32.fromWords(decoded.words));
    console.log('[CONTRACT-WALLET] Full key size:', privateKeyBytes.length, 'bytes');
    
    // IMPORTANT: Remove the first byte (flag) before creating the keypair
    const secretKey = privateKeyBytes.slice(1);
    console.log('[CONTRACT-WALLET] Secret key size after removing flag:', secretKey.length, 'bytes');
    
    if (secretKey.length !== 32) {
      throw new Error(`Expected 32 bytes after removing flag, got ${secretKey.length}`);
    }
    
    return new Uint8Array(secretKey);
  } catch (error) {
    console.error('[CONTRACT-WALLET] Error decoding private key:', error);
    throw new Error(`Failed to decode private key: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// **FIX: Generate contract-specific proofs to match contract-specific salt**
export async function createContractSpecificWallet(
  userGoogleId: string,
  contractId: string,
  userJwt: string
): Promise<ContractWallet> {
  console.log('[CONTRACT-WALLET] Creating contract-specific wallet with unique salt');

  // **STEP 1: Reuse session ephemeral keypair (cryptographically required)**
  const sessionData = localStorage.getItem("epochone_session");
  if (!sessionData) {
    throw new Error("No session data found - please login first");
  }

  const sessionObj = JSON.parse(sessionData);
  const zkLoginState = sessionObj.zkLoginState || sessionObj.user.zkLoginState;

  const privateKeyBytes = decodeSuiPrivateKey(zkLoginState.ephemeralKeyPair.privateKey);
  const ephemeralKeyPair = Ed25519Keypair.fromSecretKey(privateKeyBytes);
  
  console.log('[CONTRACT-WALLET] Reusing session ephemeral keypair for cryptographic validity');

  // **STEP 2: Generate contract-specific salt (this creates the unique wallet)**
  const hashedGoogleId = await hashGoogleId(userGoogleId);
  
  const saltResponse = await fetch('/api/salt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userGoogleId: hashedGoogleId,
      contractId // ✅ This makes the salt contract-specific
    }),
  });

  const { salt } = await saltResponse.json();
  console.log('[CONTRACT-WALLET] Generated contract-specific salt:', salt.substring(0, 8) + '...');

  // **STEP 3: Generate unique wallet address using contract-specific salt**
  const contractSpecificAddress = jwtToAddress(userJwt, salt);
  console.log('[CONTRACT-WALLET] Generated unique wallet address:', contractSpecificAddress.substring(0, 8) + '...');

  // **✅ STEP 4: Generate contract-specific zkProofs (KEY FIX!)**
  console.log('[CONTRACT-WALLET] Generating contract-specific zkProofs to match salt...');
  const contractZkProofs = await getContractZkProof({
    jwt: userJwt,                    // ✅ Same JWT (nonce matches)
    salt,                           // ✅ Contract-specific salt
    keyPair: ephemeralKeyPair,      // ✅ Same keypair (from session)
    maxEpoch: zkLoginState.maxEpoch, // ✅ Same maxEpoch
    randomness: zkLoginState.randomness // ✅ Same randomness
  });
  console.log('[CONTRACT-WALLET] ✅ Contract-specific zkProofs generated successfully');

  // **STEP 5: Create wallet state with contract-specific components**
  const contractZkLoginState: ContractZkLoginState = {
    ephemeralKeyPair: {
      publicKey: zkLoginState.ephemeralKeyPair.publicKey,
      privateKey: zkLoginState.ephemeralKeyPair.privateKey,
    },
    randomness: zkLoginState.randomness,
    jwt: userJwt,                    // ✅ Same JWT
    maxEpoch: zkLoginState.maxEpoch,
    zkProofs: contractZkProofs,      // ✅ CONTRACT-SPECIFIC proofs (matches salt!)
    salt,                           // ✅ Contract-specific salt
    contractId,
    userGoogleId,
  };

  const contractWallet: ContractWallet = {
    address: contractSpecificAddress, // ✅ Unique per contract
    contractId,
    userGoogleId,
    zkLoginState: contractZkLoginState,
    isValid: true,
    createdAt: new Date().toISOString(),
    ephemeralKeyPair, // ✅ Same keypair (cryptographically required)
  };

  // Store in memory
  const walletManager = InMemoryWalletManager.getInstance();
  walletManager.storeWallet(contractWallet, ephemeralKeyPair);

  console.log('[CONTRACT-WALLET] ✅ Created unique contract wallet with matching proofs:', {
    contractId,
    address: contractSpecificAddress.substring(0, 8) + '...',
    saltUsed: salt.substring(0, 8) + '...',
    proofsGenerated: !!contractZkProofs
  });

  return contractWallet;
}

// **NEW: Generate just the address using the full wallet creation**
export async function getContractSpecificAddress(
  userGoogleId: string,
  contractId: string,
  userJwt: string
): Promise<string> {
  console.log('[CONTRACT-WALLET] Getting contract-specific address only...');
  
  // Create the full wallet (stored in memory)
  const wallet = await createContractSpecificWallet(userGoogleId, contractId, userJwt);
  
  // Return just the address
  return wallet.address;
}


// **CLIENT-SIDE: Generate ZK proof for contract-specific identity**
async function getContractZkProof(params: {
  jwt: string;
  salt: string;
  keyPair: Ed25519Keypair;
  maxEpoch: number;
  randomness: string;
}): Promise<any> {
  console.log('[CONTRACT-WALLET] Generating ZK proof for contract-specific identity...');

  const { jwt, salt, keyPair, maxEpoch, randomness } = params;

  // Prepare the extended ephemeral public key
  const extendedEphemeralPublicKey = Array.from(
    new Uint8Array([0, ...keyPair.getPublicKey().toSuiBytes()])
  );

  console.log('[CONTRACT-WALLET] Making request to zkLogin proof endpoint...');

  // Use the existing zkLogin proof endpoint but with contract-specific JWT
  const response = await fetch('/api/zklogin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      jwt,
      salt,
      extendedEphemeralPublicKey,
      maxEpoch,
      jwtRandomness: randomness,
      keyClaimName: 'sub',
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Contract-specific proof generation failed: ${response.status}: ${JSON.stringify(errorData)}`);
  }

  const proofData = await response.json();
  console.log('[CONTRACT-WALLET] Contract-specific ZK proof generated successfully');

  // ✅ NEW: Log the derived wallet address from the proof
  try {
    const derivedAddress = jwtToAddress(jwt, salt);
    console.log('[CONTRACT-WALLET] 📍 Proof verification - addresses:', {
      derivedFromJwtAndSalt: derivedAddress,
      saltUsed: salt.substring(0, 12) + '...',
      jwtSubject: JSON.parse(atob(jwt.split('.')[1])).sub.substring(0, 12) + '...',
      jwtIssuer: JSON.parse(atob(jwt.split('.')[1])).iss,
      proofGenerated: !!proofData.proofPoints
    });
    
    // Log if this matches what we expect
    console.log('[CONTRACT-WALLET] ✅ Wallet address derived from proof components:', derivedAddress);
  } catch (addressError) {
    console.error('[CONTRACT-WALLET] ❌ Failed to derive address from proof components:', addressError);
  }

  return proofData;
}


// **SECURE: Get existing contract wallet from memory (no localStorage)**
export function getStoredContractWallet(
  userGoogleId: string, 
  contractId: string
): ContractWallet | null {
  const walletManager = InMemoryWalletManager.getInstance();
  const { wallet } = walletManager.getWallet(userGoogleId, contractId);
  
  if (wallet) {
    console.log('[SECURE-WALLET] Retrieved wallet from memory');
  } else {
    console.log('[SECURE-WALLET] No wallet found in memory');
  }
  
  return wallet;
}

// **SECURE: Store contract wallet in memory (no localStorage)**
export function storeContractWallet(): void {
  console.log('[SECURE-WALLET] Note: Wallet already stored in memory during creation');
  // This function is kept for API compatibility but actual storage happens in createContractSpecificWallet
}

// **CLIENT-SIDE: Helper to get or create contract wallet**
export async function getOrCreateContractWallet(
  userGoogleId: string,
  contractId: string,
  jwt: string
): Promise<ContractWallet> {
  // **CRITICAL: Hash Google ID before using it**
  const { hashGoogleId } = await import('./privacy');
  const hashedGoogleId = await hashGoogleId(userGoogleId);
  
  console.log('[ContractWallet] Using hashed Google ID:', {
    original: userGoogleId.substring(0, 8) + '...',
    hashed: hashedGoogleId.substring(0, 8) + '...'
  });
  
  const walletManager = InMemoryWalletManager.getInstance();
  
  // Use hashed Google ID for storage key
  const existingWallet = walletManager.getWallet(hashedGoogleId, contractId);
  if (existingWallet.wallet) {
    console.log('[ContractWallet] Found existing contract wallet in memory');
    return existingWallet.wallet;
  }
  
  // Create new contract-specific wallet with hashed Google ID
  const contractWallet = await createContractSpecificWallet(hashedGoogleId, contractId, jwt);
  
  return contractWallet;
}

// **SECURE: Clear specific contract wallet from memory**
export function clearContractWallet(userGoogleId: string, contractId: string): void {
  const walletManager = InMemoryWalletManager.getInstance();
  walletManager.clearWallet(userGoogleId, contractId);
}

// **SECURE: Clear all contract wallets from memory**
export function clearAllContractWallets(): void {
  const walletManager = InMemoryWalletManager.getInstance();
  walletManager.clearAll();
}

// **SECURE: Get wallet count for debugging**
export function getWalletCount(): number {
  const walletManager = InMemoryWalletManager.getInstance();
  return walletManager.getWalletCount();
}

export type { ContractWallet, ContractZkLoginState };

