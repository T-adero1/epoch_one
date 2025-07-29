
import { jwtToAddress } from '@mysten/sui/zklogin';
import crypto from 'crypto';

// Environment variables
const MASTER_SEED = process.env.ZKLOGIN_MASTER_SEED;
const GOOGLE_ISSUER = 'https://accounts.google.com';
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;


// **SERVER-SIDE ONLY: Contract-specific predetermined wallet generation**
export async function generatePredeterminedWalletServerSide(hashedEmail: string, contractId: string): Promise<PredeterminedWallet> {
  console.log('[PREDETERMINED-WALLET] 🚀 STARTING WALLET GENERATION');
  console.log('[PREDETERMINED-WALLET] 📥 INPUT PARAMETERS:', {
    hashedEmail: hashedEmail,
    contractId: contractId,
    timestamp: new Date().toISOString()
  });
  
  // ✅ Use the EXACT same salt as contract wallet process
  const salt = await getContractSpecificSalt(hashedEmail, contractId);
  console.log('[PREDETERMINED-WALLET] 🧂 SALT GENERATED:', {
    saltValue: salt,
    saltLength: salt.length,
    saltType: typeof salt
  });
  
  // Create mock JWT with hashed email as subject
  const mockJwtPayload = {
    sub: hashedEmail,  // Use hashed email as subject
    iss: 'https://accounts.google.com',
    aud: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
  };
  
  console.log('[PREDETERMINED-WALLET] 🎫 MOCK JWT PAYLOAD CREATED:', {
    sub: mockJwtPayload.sub,
    iss: mockJwtPayload.iss,
    aud: mockJwtPayload.aud,
    exp: mockJwtPayload.exp,
    iat: mockJwtPayload.iat
  });

  const mockJwt = createMockJwt(mockJwtPayload);
  console.log('[PREDETERMINED-WALLET] 🎫 MOCK JWT FULL:', {
    jwt: mockJwt,
    jwtLength: mockJwt.length,
    jwtParts: mockJwt.split('.').length
  });
  
  // Parse and log the JWT payload for verification
  try {
    const jwtParts = mockJwt.split('.');
    const decodedPayload = JSON.parse(Buffer.from(jwtParts[1], 'base64url').toString());
    console.log('[PREDETERMINED-WALLET] 🔍 DECODED JWT PAYLOAD:', decodedPayload);
  } catch (e) {
    console.error('[PREDETERMINED-WALLET] ❌ Failed to decode JWT:', e);
  }
  
  // Generate address - now guaranteed to match contract wallet
  console.log('[PREDETERMINED-WALLET] 🏠 CALLING jwtToAddress with:', {
    jwtSubject: mockJwtPayload.sub,
    saltValue: salt
  });
  
  const predeterminedAddress = jwtToAddress(mockJwt, salt);
  
  console.log('[PREDETERMINED-WALLET] ✅ ADDRESS GENERATED:', {
    predeterminedAddress: predeterminedAddress,
    addressLength: predeterminedAddress.length,
    generationMethod: 'jwtToAddress(mockJwt, salt)'
  });
  
  const result = {
    success: true,
    email: hashedEmail,
    contractId,
    predeterminedAddress,
    timestamp: new Date().toISOString(),
    method: 'server-side-api-consistent'
  };
  
  console.log('[PREDETERMINED-WALLET] 🎯 FINAL RESULT:', result);
  
  return result;
}
// **SERVER-SIDE ONLY: Enhanced version with context validation**
export async function generatePredeterminedWalletForAllowlist(
  email: string, 
  contractId: string, 
  context: 'allowlist-creation'
): Promise<PredeterminedWallet> {
  console.log(`[PREDETERMINED-WALLET] Server-side generation for ${context}:`, { email, contractId });
  
  // Validate context
  if (context !== 'allowlist-creation') {
    throw new Error('Invalid context for predetermined wallet generation');
  }
  
  // Validate inputs
  if (!contractId || typeof contractId !== 'string') {
    throw new Error('Contract ID is required for allowlist creation');
  }
  
  // ✅ FIX: Await the async function
  const result = await generatePredeterminedWalletServerSide(email, contractId);
  
  // Add context information
  return {
    ...result,
    method: `server-side-${context}`,
    context: context
  };
}

// **PRIVATE: Generate contract-specific salt using email AND contract ID (server-side only)**
async function getContractSpecificSalt(hashedEmail: string, contractId: string): Promise<string> {
  console.log('[PREDETERMINED-WALLET] 🧂 SALT GENERATION STARTING');
  console.log('[PREDETERMINED-WALLET] 🧂 SALT INPUT PARAMS:', {
    hashedEmail: hashedEmail,
    contractId: contractId
  });
  
  // ✅ NEW: Email-based salt generation
  const emailBasedSubject = `${hashedEmail}::${contractId}::email-based`;
  const info = Buffer.from(emailBasedSubject);
  
  console.log('[PREDETERMINED-WALLET] 🧂 EMAIL-BASED SUBJECT:', {
    emailBasedSubject: emailBasedSubject,
    infoBuffer: info.toString('hex'),
    infoLength: info.length
  });
  
  if (!CLIENT_ID || !MASTER_SEED) {
    throw new Error('Missing environment variables');
  }
  
  console.log('[PREDETERMINED-WALLET] 🧂 ENVIRONMENT CHECK:', {
    hasClientId: !!CLIENT_ID,
    hasMasterSeed: !!MASTER_SEED,
    clientId: CLIENT_ID,
    masterSeedLength: MASTER_SEED?.length
  });
  
  // ✅ CHANGE: Include 'email-based' in salt input for uniqueness
  const saltInput = `${GOOGLE_ISSUER}:${CLIENT_ID}:${contractId}:email-based:${hashedEmail}`;
  const salt = Buffer.from(saltInput);
  const masterSeedBuffer = Buffer.from(MASTER_SEED);
  
  console.log('[PREDETERMINED-WALLET] 🧂 SALT INPUT STRING:', {
    saltInput: saltInput,
    saltInputLength: saltInput.length,
    saltBuffer: salt.toString('hex'),
    masterSeedBuffer: masterSeedBuffer.toString('hex')
  });
  
  // Generate the derived salt using HKDF (same method, different input)
  const derivedSaltBuffer = crypto.hkdfSync('sha256', masterSeedBuffer, salt, info, 16);
  const hexString = Buffer.from(derivedSaltBuffer).toString('hex');
  const saltAsBigInt = BigInt('0x' + hexString).toString();
  
  console.log('[PREDETERMINED-WALLET] 🧂 HKDF DERIVATION:', {
    derivedSaltBuffer: derivedSaltBuffer.toString('hex'),
    hexString: hexString,
    saltAsBigInt: saltAsBigInt
  });
  
  return saltAsBigInt;
}

// **PRIVATE: Create a mock JWT for address calculation (server-side only)**
function createMockJwt(payload: any): string {
  const header = {
    alg: 'RS256',
    typ: 'JWT',
    kid: 'predetermined-wallet-contract-key'
  };

  console.log('[PREDETERMINED-WALLET] 🎫 CREATING MOCK JWT:', {
    header: header,
    payload: payload
  });

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = 'predetermined-wallet-contract-signature';

  console.log('[PREDETERMINED-WALLET] 🎫 JWT ENCODING:', {
    encodedHeader: encodedHeader,
    encodedPayload: encodedPayload,
    signature: signature
  });

  const jwt = `${encodedHeader}.${encodedPayload}.${signature}`;
  console.log('[PREDETERMINED-WALLET] 🎫 FINAL JWT:', jwt);
  
  return jwt;
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
export async function testContractSpecificGeneration(email: string, contractId: string): Promise<{
  result: PredeterminedWallet;
  validation: {
    isDeterministic: boolean;
    isContractSpecific: boolean;
  };
}> {
  console.log('[PREDETERMINED-WALLET] Running test generation for:', { email, contractId });
  
  // ✅ FIX: Await all async calls
  const result1 = await generatePredeterminedWalletServerSide(email, contractId);
  const result2 = await generatePredeterminedWalletServerSide(email, contractId);
  
  // Generate address for different contract to verify it's different
  const differentContract = contractId + '-different';
  const result3 = await generatePredeterminedWalletServerSide(email, differentContract);
  
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