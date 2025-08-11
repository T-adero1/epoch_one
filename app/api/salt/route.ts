import { NextResponse } from 'next/server';
import crypto from 'crypto';

// This should be a secure, randomly generated value stored as an environment variable
// CRITICAL: If this changes, all users will get new wallet addresses!
const MASTER_SEED = process.env.ZKLOGIN_MASTER_SEED;

console.log('[SALT API] Starting up with master seed:', MASTER_SEED ? 'Exists (not shown for security)' : 'MISSING');

export async function POST(request: Request) {
  console.log('[SALT API] Received salt derivation request');
  
  try {
    const body = await request.json();
    console.log('[SALT API] Successfully parsed request body');
    
    const { token, contractId, userGoogleId } = body;
    
    // **NEW: Detect operation mode**
    const isContractSpecific = !!(contractId && userGoogleId);
    const mode = isContractSpecific ? 'contract-specific' : 'regular-zklogin';
    
    console.log('[SALT API] Operation mode:', mode);
    console.log('[SALT API] Request parameters:', {
      hasToken: !!token,
      hasContractId: !!contractId,
      hasUserGoogleId: !!userGoogleId
    });
    
    // **CONTRACT-SPECIFIC MODE**
    if (isContractSpecific) {
      console.log('[SALT API] Processing contract-specific salt request');
      
      if (!contractId || typeof contractId !== 'string') {
        return NextResponse.json({ error: 'Valid contract ID is required for contract-specific mode' }, { status: 400 });
      }
      
      if (!userGoogleId || typeof userGoogleId !== 'string') {
        return NextResponse.json({ error: 'Valid user Google ID is required for contract-specific mode' }, { status: 400 });
      }
      
      // Check master seed
      if (!MASTER_SEED) {
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
      }
      
      // **Contract-specific HKDF inputs**
      console.log('[SALT API] Generating contract-specific salt with HKDF...');
      
      // Create contract-specific subject (this becomes the info parameter for HKDF)
      const contractSpecificSubject = `${userGoogleId}::${contractId}`;
      const info = Buffer.from(contractSpecificSubject);
      
      // Create contract-specific salt input (this becomes the salt parameter for HKDF)
      const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      if (!CLIENT_ID) {
        return NextResponse.json({ error: 'Google Client ID not configured' }, { status: 500 });
      }
      
      const GOOGLE_ISSUER = 'https://accounts.google.com';
      const saltInput = `${GOOGLE_ISSUER}:${CLIENT_ID}:${contractId}`;
      const salt = Buffer.from(saltInput);
      
      // Use master seed as the key material
      const masterSeedBuffer = Buffer.from(MASTER_SEED);
      
      // Generate the derived salt using HKDF (same method as regular zkLogin but contract-specific)
      const derivedSaltBuffer = crypto.hkdfSync(
        'sha256',
        masterSeedBuffer,
        salt,
        info,
        16 // 16 bytes = 128 bits
      );
      
      // Convert the buffer to hex string properly
      const hexString = Buffer.from(derivedSaltBuffer).toString('hex');
      console.log('[SALT API] Derived contract-specific salt in hex format (first few chars):', hexString.substring(0, 8) + '...');
      
      // Convert hex to BigInt (same format as regular zkLogin)
      const saltAsBigInt = BigInt('0x' + hexString).toString();
      console.log('[SALT API] Contract-specific salt converted to BigInt successfully, length:', saltAsBigInt.length);
      
      // Return the contract-specific salt
      return NextResponse.json({ 
        salt: saltAsBigInt,
        mode: 'contract-specific',
        contractId,
        method: 'server-side-hkdf-contract-specific'
      });
    }
    
    // **REGULAR ZKLOGIN MODE (Original implementation - backwards compatible)**
    console.log('[SALT API] Processing regular zkLogin salt request');
    
    if (!token) {
      return NextResponse.json({ error: 'Token is required for regular zkLogin mode' }, { status: 400 });
    }
    
    // Split JWT
    const jwtParts = token.split('.');
    console.log('[SALT API] JWT parts count:', jwtParts.length);
    
    if (jwtParts.length !== 3) {
      return NextResponse.json({ error: 'Invalid JWT format' }, { status: 400 });
    }
    
    // Decode payload
    console.log('[SALT API] Attempting to decode JWT payload...');
    let payload;
    try {
      const payloadBase64 = jwtParts[1];
      // Handle base64url format (replace - with + and _ with /)
      const normalized = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
      // Add padding if needed
      const padding = '='.repeat((4 - normalized.length % 4) % 4);
      const base64 = normalized + padding;
      
      const payloadJson = Buffer.from(base64, 'base64').toString();
      payload = JSON.parse(payloadJson);
      console.log('[SALT API] Successfully parsed JWT payload');
    } catch (e) {
      console.error('[SALT API] Failed to parse JWT payload:', e);
      return NextResponse.json({ error: 'Invalid JWT payload' }, { status: 400 });
    }
    
    // Extract claims
    const sub = payload.sub;
    const iss = payload.iss;
    const aud = payload.aud;
    
    if (!sub || !iss || !aud) {
      return NextResponse.json({ error: 'Missing required JWT claims' }, { status: 400 });
    }
    
    // Check master seed
    if (!MASTER_SEED) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }
    
    // **Original HKDF inputs (unchanged for backwards compatibility)**
    const info = Buffer.from(sub);
    const audValue = typeof aud === 'string' ? aud : Array.isArray(aud) ? aud[0] : '';
    const salt = Buffer.from(`${iss}:${audValue}`);
    
    // Compute the salt
    console.log('[SALT API] Running regular zkLogin HKDF...');
    
    // Create a buffer from the master seed
    const masterSeedBuffer = Buffer.from(MASTER_SEED);
    
    // Generate the derived salt using HKDF (original implementation)
    const derivedSaltBuffer = crypto.hkdfSync(
      'sha256',
      masterSeedBuffer,
      salt,
      info,
      16 // 16 bytes = 128 bits
    );
    
    // Convert the buffer to hex string properly
    const hexString = Buffer.from(derivedSaltBuffer).toString('hex');
    console.log('[SALT API] Derived regular salt in hex format (first few chars):', hexString.substring(0, 8) + '...');
    
    // Convert hex to BigInt
    const saltAsBigInt = BigInt('0x' + hexString).toString();
    console.log('[SALT API] Regular salt converted to BigInt successfully, length:', saltAsBigInt.length);
    
    // Return the regular salt (original format for backwards compatibility)
    return NextResponse.json({ 
      salt: saltAsBigInt,
      mode: 'regular-zklogin'
    });
    
  } catch (error) {
    console.error('[SALT API] Unhandled error in salt derivation:', error);
    return NextResponse.json(
      { error: 'Failed to derive salt: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
