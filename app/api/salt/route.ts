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
    
    const { token } = body;
    console.log('[SALT API] Token present in request:', !!token);
    
    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
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
    
    // Prepare HKDF inputs
    const info = Buffer.from(sub);
    const audValue = typeof aud === 'string' ? aud : Array.isArray(aud) ? aud[0] : '';
    const salt = Buffer.from(`${iss}:${audValue}`);
    
    // Compute the salt - FIX HERE
    console.log('[SALT API] Running HKDF...');
    
    // Create a buffer from the master seed
    const masterSeedBuffer = Buffer.from(MASTER_SEED);
    
    // Generate the derived salt using HKDF
    const derivedSaltBuffer = crypto.hkdfSync(
      'sha256',
      masterSeedBuffer,
      salt,
      info,
      16 // 16 bytes = 128 bits
    );
    
    // Convert the buffer to hex string properly
    const hexString = Buffer.from(derivedSaltBuffer).toString('hex');
    console.log('[SALT API] Derived salt in hex format (first few chars):', hexString.substring(0, 8) + '...');
    
    // Convert hex to BigInt
    const saltAsBigInt = BigInt('0x' + hexString).toString();
    console.log('[SALT API] Converted to BigInt successfully, length:', saltAsBigInt.length);
    
    // Return the salt
    return NextResponse.json({ salt: saltAsBigInt });
  } catch (error) {
    console.error('[SALT API] Unhandled error in salt derivation:', error);
    return NextResponse.json(
      { error: 'Failed to derive salt: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
