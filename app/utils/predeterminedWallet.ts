import crypto from 'crypto';
import { jwtToAddress } from '@mysten/sui/zklogin';

// Same master seed used in the actual salt generation
const MASTER_SEED = process.env.ZKLOGIN_MASTER_SEED;

// Known constants for Google OAuth
const GOOGLE_ISSUER = 'https://accounts.google.com';
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

// **SERVER-SIDE ONLY: Contract-specific predetermined wallet generation**
export function generatePredeterminedWalletServerSide(emailOrHash: string, contractId: string): PredeterminedWallet {
  console.log('[PREDETERMINED-WALLET] Generating contract-specific predetermined wallet server-side for hashed identifier:', { 
    hashedIdentifier: emailOrHash.substring(0, 8) + '...', 
    contractId 
  });
  
  if (!emailOrHash || typeof emailOrHash !== 'string') {
    throw new Error('Valid email or hashed email identifier is required');
  }

  if (!contractId || typeof contractId !== 'string') {
    throw new Error('Valid contract ID is required');
  }

  if (!MASTER_SEED) {
    throw new Error('Master seed not configured');
  }

  if (!CLIENT_ID) {
    throw new Error('Google Client ID not configured');
  }

  console.log('[PREDETERMINED-WALLET] Generating contract-specific salt for hashed identifier...');
  
  // **UPDATED: Generate salt using hashed email/identifier AND contract ID as the subject identifier**
  const salt = generateContractSpecificSaltFromEmail(emailOrHash, contractId);
  
  console.log('[PREDETERMINED-WALLET] Contract-specific salt generated successfully');
  
  // **UPDATED: Create a mock JWT payload with contract-specific subject using hashed identifier**
  const contractSpecificSubject = `${emailOrHash}::${contractId}`;
  const mockJwtPayload = {
    sub: contractSpecificSubject, // Contract-specific subject with hashed identifier
    iss: GOOGLE_ISSUER,
    aud: CLIENT_ID,
    email_hash: emailOrHash, // Store the hashed identifier
    email_verified: true,
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    iat: Math.floor(Date.now() / 1000),
    // **NEW: Add contract context to JWT**
    contract_id: contractId,
    address_type: 'contract-specific-predetermined-hashed'
  };

  // Create mock JWT (we only need the payload for address generation)
  const mockJwt = createMockJwt(mockJwtPayload);
  
  console.log('[PREDETERMINED-WALLET] Calculating contract-specific predetermined address...');
  
  // Generate the wallet address using the same function as the real flow
  const predeterminedAddress = jwtToAddress(mockJwt, salt);
  
  console.log('[PREDETERMINED-WALLET] Contract-specific address calculated successfully:', predeterminedAddress.substring(0, 8) + '...');

  // Return server-side data
  return {
    success: true,
    email: emailOrHash, // This is now a hashed identifier
    contractId,
    predeterminedAddress,
    timestamp: new Date().toISOString(),
    method: 'server-side-contract-specific-hashed'
  };
}
// **SERVER-SIDE ONLY: Enhanced version with context validation**
export function generatePredeterminedWalletForAllowlist(
  email: string, 
  contractId: string, 
  context: 'allowlist-creation'
): PredeterminedWallet {
  console.log(`[PREDETERMINED-WALLET] Server-side generation for ${context}:`, { email, contractId });
  
  // Validate context
  if (context !== 'allowlist-creation') {
    throw new Error('Invalid context for predetermined wallet generation');
  }
  
  // Validate inputs
  if (!contractId || typeof contractId !== 'string') {
    throw new Error('Contract ID is required for allowlist creation');
  }
  
  // **UPDATED: Generate the contract-specific predetermined wallet**
  const result = generatePredeterminedWalletServerSide(email, contractId);
  
  // Add context information
  return {
    ...result,
    method: `server-side-${context}`,
    context: context
  };
}

// **PRIVATE: Generate contract-specific salt using email AND contract ID (server-side only)**
function generateContractSpecificSaltFromEmail(email: string, contractId: string): string {
  if (!MASTER_SEED) {
    throw new Error('Master seed not configured');
  }

  console.log('[PREDETERMINED-WALLET] Generating contract-specific salt with HKDF...');

  // **UPDATED: Use email AND contract ID as the subject identifier**
  const contractSpecificSubject = `${email}::${contractId}`;
  const info = Buffer.from(contractSpecificSubject);
  
  // **UPDATED: Include contract ID in the salt derivation**
  const saltInput = `${GOOGLE_ISSUER}:${CLIENT_ID}:${contractId}`;
  const salt = Buffer.from(saltInput);
  const masterSeedBuffer = Buffer.from(MASTER_SEED);

  // Generate the derived salt using HKDF (same as original but contract-specific)
  const derivedSaltBuffer = crypto.hkdfSync(
    'sha256',
    masterSeedBuffer,
    salt,
    info,
    16 // 16 bytes = 128 bits
  );

  // Convert to BigInt string (same as original)
  const hexString = Buffer.from(derivedSaltBuffer).toString('hex');
  const saltAsBigInt = BigInt('0x' + hexString).toString();

  console.log('[PREDETERMINED-WALLET] Contract-specific salt generated, length:', saltAsBigInt.length);

  return saltAsBigInt;
}

// **PRIVATE: Create a mock JWT for address calculation (server-side only)**
function createMockJwt(payload: any): string {
  const header = {
    alg: 'RS256',
    typ: 'JWT',
    kid: 'predetermined-wallet-contract-key'
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = 'predetermined-wallet-contract-signature';

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

// **SERVER-SIDE ONLY: Interface for predetermined wallet data**
export interface PredeterminedWallet {
  success: boolean;
  email: string;
  contractId: string; // **UPDATED: Now required**
  predeterminedAddress: string;
  timestamp: string;
  method: string;
  context?: string; // Added for context tracking
}

// **SERVER-SIDE ONLY: Test function for development/testing**
export function testContractSpecificGeneration(email: string, contractId: string): {
  result: PredeterminedWallet;
  validation: {
    isDeterministic: boolean;
    isContractSpecific: boolean;
  };
} {
  console.log('[PREDETERMINED-WALLET] Running test generation for:', { email, contractId });
  
  // Generate address for this contract
  const result1 = generatePredeterminedWalletServerSide(email, contractId);
  const result2 = generatePredeterminedWalletServerSide(email, contractId);
  
  // Generate address for different contract to verify it's different
  const differentContract = contractId + '-different';
  const result3 = generatePredeterminedWalletServerSide(email, differentContract);
  
  const validation = {
    isDeterministic: result1.predeterminedAddress === result2.predeterminedAddress,
    isContractSpecific: result1.predeterminedAddress !== result3.predeterminedAddress
  };
  
  console.log('[PREDETERMINED-WALLET] Test validation:', validation);
  
  return {
    result: result1,
    validation
  };
}