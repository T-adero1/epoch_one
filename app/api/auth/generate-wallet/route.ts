import { NextRequest, NextResponse } from 'next/server';
import { generatePredeterminedWalletForAllowlist } from '@/app/utils/predeterminedWallet';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { hashedEmail, contractId, context } = body;
    
    if (!hashedEmail || !contractId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    // Validate context
    if (context !== 'signing-verification') {
      return NextResponse.json({ error: 'Invalid context' }, { status: 400 });
    }
    
    console.log('[AUTH-API] Generating predetermined wallet for signing verification:', {
      hashedEmailPreview: hashedEmail.substring(0, 8) + '...',
      contractId,
      context
    });
    
    // Generate predetermined wallet using the same method as allowlist creation
    const predeterminedResult = generatePredeterminedWalletForAllowlist(
      hashedEmail, // Use the already hashed email
      contractId, 
      'allowlist-creation' // Use same context as original allowlist creation
    );
    
    console.log('[AUTH-API] Generated predetermined wallet:', {
      walletPreview: predeterminedResult.predeterminedAddress.substring(0, 8) + '...',
      method: predeterminedResult.method
    });
    
    return NextResponse.json({
      success: true,
      predeterminedAddress: predeterminedResult.predeterminedAddress,
      method: predeterminedResult.method,
      contractId: predeterminedResult.contractId
    });
    
  } catch (error: any) {
    console.error('[AUTH-API] Error generating predetermined wallet:', error);
    return NextResponse.json(
      { error: `Failed to generate wallet: ${error.message}` },
      { status: 500 }
    );
  }
} 