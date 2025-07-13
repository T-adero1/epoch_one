import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { jwtToAddress, genAddressSeed } from '@mysten/sui/zklogin';

// Same master seed used in the actual salt generation
const MASTER_SEED = process.env.ZKLOGIN_MASTER_SEED;

// Known constants for Google OAuth
const GOOGLE_ISSUER = 'https://accounts.google.com';
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

export async function POST(request: Request) {
  console.log('[PREDETERMINED-WALLET] API endpoint called');
  
  try {
    const body = await request.json();
    const { email } = body;

    console.log('[PREDETERMINED-WALLET] Processing request for email:', email ? 'provided' : 'missing');

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    if (!MASTER_SEED) {
      console.error('[PREDETERMINED-WALLET] Master seed not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    if (!CLIENT_ID) {
      console.error('[PREDETERMINED-WALLET] Google Client ID not configured');
      return NextResponse.json({ error: 'Google Client ID not configured' }, { status: 500 });
    }

    console.log('[PREDETERMINED-WALLET] Generating salt for email...');
    
    // Generate salt using email as the subject identifier
    const salt = generateSaltFromEmail(email);
    
    console.log('[PREDETERMINED-WALLET] Salt generated successfully');
    
    // Create a mock JWT payload for address calculation
    const mockJwtPayload = {
      sub: email, // Using email as subject
      iss: GOOGLE_ISSUER,
      aud: CLIENT_ID,
      email: email,
      email_verified: true,
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      iat: Math.floor(Date.now() / 1000)
    };

    // Create mock JWT (we only need the payload for address generation)
    const mockJwt = createMockJwt(mockJwtPayload);
    
    console.log('[PREDETERMINED-WALLET] Calculating predetermined address...');
    
    // Generate the wallet address using the same function as the real flow
    const predeterminedAddress = jwtToAddress(mockJwt, salt);
    
    // Calculate address seed for internal verification only (not returned to client)
    const addressSeed = genAddressSeed(
      BigInt(salt),
      'sub',
      email, // Using email as subject
      CLIENT_ID
    ).toString();

    console.log('[PREDETERMINED-WALLET] Address calculated successfully:', predeterminedAddress);
    // Log sensitive data server-side only
    console.log('[PREDETERMINED-WALLET] Internal verification - Address seed:', addressSeed.substring(0, 8) + '...');

    // Return ONLY client-safe data
    return NextResponse.json({
      success: true,
      email,
      predeterminedAddress,
      timestamp: new Date().toISOString(),
      method: 'email-based-predetermined'
      // REMOVED: addressSeed, salt (sensitive data)
    });

  } catch (error) {
    console.error('[PREDETERMINED-WALLET] Error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to generate predetermined wallet address: ' + (error instanceof Error ? error.message : String(error)) 
      },
      { status: 500 }
    );
  }
}

// Generate salt using email (mimicking the original salt generation)
function generateSaltFromEmail(email: string): string {
  if (!MASTER_SEED) {
    throw new Error('Master seed not configured');
  }

  console.log('[PREDETERMINED-WALLET] Generating salt with HKDF...');

  // Use email as the subject identifier
  const info = Buffer.from(email);
  const salt = Buffer.from(`${GOOGLE_ISSUER}:${CLIENT_ID}`);
  const masterSeedBuffer = Buffer.from(MASTER_SEED);

  // Generate the derived salt using HKDF (same as original)
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

  console.log('[PREDETERMINED-WALLET] Salt generated, length:', saltAsBigInt.length);

  return saltAsBigInt;
}

// Create a mock JWT for address calculation
function createMockJwt(payload: any): string {
  const header = {
    alg: 'RS256',
    typ: 'JWT',
    kid: 'predetermined-wallet-key'
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = 'predetermined-wallet-signature';

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

// Client-side interface - NO sensitive data
export interface PredeterminedWallet {
  success: boolean;
  email: string;
  predeterminedAddress: string;
  timestamp: string;
  method: string;
  // REMOVED: addressSeed, salt (sensitive data)
}

/**
 * Generate a predetermined wallet address for a given email
 * This uses the same deterministic process as zkLogin but with email as the identifier
 */
export async function generatePredeterminedWallet(email: string): Promise<PredeterminedWallet> {
  console.log('[PREDETERMINED-WALLET] Generating predetermined wallet for:', email);
  
  if (!email || !email.includes('@')) {
    throw new Error('Valid email address is required');
  }

  const response = await fetch('/api/predetermined-wallet', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: email.toLowerCase().trim() }),
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('[PREDETERMINED-WALLET] API Error:', error);
    throw new Error(`Failed to generate predetermined wallet: ${error.error || 'Unknown error'}`);
  }

  const result = await response.json();
  
  if (!result.success) {
    throw new Error(`Failed to generate predetermined wallet: ${result.error || 'Unknown error'}`);
  }

  console.log('[PREDETERMINED-WALLET] Generated successfully:', result.predeterminedAddress);
  
  return result;
}

/**
 * Generate predetermined wallets for multiple emails
 */
export async function generateMultiplePredeterminedWallets(emails: string[]): Promise<PredeterminedWallet[]> {
  console.log('[PREDETERMINED-WALLET] Generating predetermined wallets for', emails.length, 'emails');
  
  const promises = emails.map(email => generatePredeterminedWallet(email));
  const results = await Promise.allSettled(promises);
  
  const successful: PredeterminedWallet[] = [];
  const failed: string[] = [];
  
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      successful.push(result.value);
    } else {
      failed.push(emails[index]);
      console.error('[PREDETERMINED-WALLET] Failed for email:', emails[index], result.reason);
    }
  });

  if (failed.length > 0) {
    console.warn('[PREDETERMINED-WALLET] Some emails failed:', failed);
  }

  return successful;
}

// Simple in-memory cache for predetermined wallets
const predeterminedWalletCache = new Map<string, PredeterminedWallet>();

/**
 * Generate predetermined wallet with caching
 */
export async function generatePredeterminedWalletWithCache(email: string): Promise<PredeterminedWallet> {
  const cacheKey = email.toLowerCase().trim();
  
  // Check cache first
  if (predeterminedWalletCache.has(cacheKey)) {
    console.log('[PREDETERMINED-WALLET] Using cached result for:', email);
    return predeterminedWalletCache.get(cacheKey)!;
  }
  
  // Generate new result
  const result = await generatePredeterminedWallet(email);
  
  // Cache the result
  predeterminedWalletCache.set(cacheKey, result);
  
  return result;
}

/**
 * Clear the predetermined wallet cache
 */
export function clearPredeterminedWalletCache(): void {
  predeterminedWalletCache.clear();
  console.log('[PREDETERMINED-WALLET] Cache cleared');
}

/**
 * Get predetermined wallet cache statistics
 */
export function getPredeterminedWalletCacheStats(): { size: number; keys: string[] } {
  return {
    size: predeterminedWalletCache.size,
    keys: Array.from(predeterminedWalletCache.keys())
  };
}
