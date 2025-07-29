import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// This should be a secure, randomly generated value stored as an environment variable
// CRITICAL: If this changes, all users will get new wallet addresses!
const MASTER_SEED = process.env.ZKLOGIN_MASTER_SEED;

export async function POST(req: NextRequest) {
  try {
    const { userGoogleId, contractId, emailBased } = await req.json();
    
    console.log('[SALT-API] Generating salt:', {
      mode: emailBased ? 'email-based' : 'google-id-based',
      contractId,
      userIdPreview: userGoogleId.substring(0, 8) + '...'
    });

    // Validate inputs
    if (!userGoogleId || !contractId) {
      return NextResponse.json({ error: 'Missing userGoogleId or contractId' }, { status: 400 });
    }

    const contractSpecificSubject = emailBased 
      ? `${userGoogleId}::${contractId}::email-based`  // ✅ Email-based mode
      : `${userGoogleId}::${contractId}`;               // Regular mode

    const info = Buffer.from(contractSpecificSubject);

    if (!MASTER_SEED) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const GOOGLE_ISSUER = 'https://accounts.google.com';

    const saltInput = emailBased
      ? `${GOOGLE_ISSUER}:${CLIENT_ID}:${contractId}:email-based:${userGoogleId}`  // ✅ Email-based
      : `${GOOGLE_ISSUER}:${CLIENT_ID}:${contractId}`;                            // Regular

    const salt = Buffer.from(saltInput);
    const masterSeedBuffer = Buffer.from(MASTER_SEED);

    const derivedSaltBuffer = crypto.hkdfSync('sha256', masterSeedBuffer, salt, info, 16);
    const hexString = Buffer.from(derivedSaltBuffer).toString('hex');
    const saltAsBigInt = BigInt('0x' + hexString).toString();

    console.log('[SALT-API] Generated salt:', {
      mode: emailBased ? 'email-based' : 'google-id-based',
      preview: saltAsBigInt.substring(0, 8) + '...'
    });

    return NextResponse.json({ salt: saltAsBigInt });

  } catch (error) {
    console.error('[SALT-API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
