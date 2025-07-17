
import { jwtToAddress } from '@mysten/sui/zklogin';
import { hashGoogleId } from './privacy';

// Known constants for Google OAuth (these are public)
const GOOGLE_ISSUER = 'https://accounts.google.com';
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

// **CLIENT-SIDE: Generate contract-specific wallet for current user**
export async function generateContractSpecificUserWallet(
  hashedUserGoogleId: string,
  contractId: string
): Promise<string> {
  console.log('[CONTRACT-WALLET] Generating contract-specific wallet for user:', {
    userGoogleId: hashedUserGoogleId.substring(0, 8) + '...',
    contractId
  });

  if (!hashedUserGoogleId || typeof hashedUserGoogleId !== 'string') {
    throw new Error('Valid user Google ID is required');
  }

  if (!contractId || typeof contractId !== 'string') {
    throw new Error('Valid contract ID is required');
  }

  if (!CLIENT_ID) {
    throw new Error('Google Client ID not configured');
  }

  // Hash the user's Google ID for privacy
  const hashedGoogleId = await hashGoogleId(hashedUserGoogleId);
  
  // Generate contract-specific salt using hashed Google ID and contract ID
  const salt = await generateContractSpecificSaltClientSide(hashedGoogleId, contractId);
  
  // Create a contract-specific subject using hashed Google ID
  const contractSpecificSubject = `${hashedGoogleId}::${contractId}`;
  
  // Create mock JWT payload for address generation
  const mockJwtPayload = {
    sub: contractSpecificSubject,
    iss: GOOGLE_ISSUER,
    aud: CLIENT_ID,
    email_hash: hashedGoogleId,
    email_verified: true,
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    contract_id: contractId,
    address_type: 'contract-specific-user-hashed'
  };

  // Create mock JWT
  const mockJwt = createMockJwtClientSide(mockJwtPayload);
  
  // Generate the wallet address
  const contractSpecificAddress = jwtToAddress(mockJwt, salt);
  
  console.log('[CONTRACT-WALLET] Contract-specific address generated:', 
    contractSpecificAddress.substring(0, 8) + '...');

  return contractSpecificAddress;
}

// **CLIENT-SIDE: Generate contract-specific salt using Web Crypto API**
async function generateContractSpecificSaltClientSide(
  hashedGoogleId: string, 
  contractId: string
): Promise<string> {
  console.log('[CONTRACT-WALLET] Generating contract-specific salt with Web Crypto API...');

  // Create contract-specific subject
  const contractSpecificSubject = `${hashedGoogleId}::${contractId}`;
  
  // Create salt input (similar to server-side but without master seed)
  const saltInput = `${GOOGLE_ISSUER}:${CLIENT_ID}:${contractId}`;
  
  // Use a deterministic approach with Web Crypto API
  // We'll use PBKDF2 with the contract-specific subject as password and salt input as salt
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(contractSpecificSubject),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(saltInput),
      iterations: 100000, // Standard number of iterations
      hash: 'SHA-256'
    },
    keyMaterial,
    128 // 16 bytes = 128 bits
  );

  // Convert to BigInt string (same format as server-side)
  const derivedArray = new Uint8Array(derivedBits);
  const hexString = Array.from(derivedArray)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  const saltAsBigInt = BigInt('0x' + hexString).toString();
  
  console.log('[CONTRACT-WALLET] Contract-specific salt generated, length:', saltAsBigInt.length);
  
  return saltAsBigInt;
}

// **CLIENT-SIDE: Create mock JWT for address calculation**
function createMockJwtClientSide(payload: any): string {
  const header = {
    alg: 'RS256',
    typ: 'JWT',
    kid: 'contract-specific-user-key'
  };

  const encodedHeader = btoa(JSON.stringify(header)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const signature = 'contract-specific-user-signature';

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

