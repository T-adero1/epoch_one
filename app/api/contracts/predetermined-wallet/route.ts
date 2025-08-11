import { NextRequest, NextResponse } from 'next/server';
import { generatePredeterminedWalletServerSide } from '@/app/utils/predeterminedWallet';

export async function POST(request: NextRequest) {
  try {
    const { emailHash, contractId, context } = await request.json();
    
    console.log('[API] Predetermined wallet request:', { 
      emailHash: emailHash.substring(0, 8) + '...', 
      contractId, 
      context 
    });

    // Validate inputs
    if (!emailHash || !contractId) {
      return NextResponse.json(
        { error: 'Email hash and contract ID are required' },
        { status: 400 }
      );
    }

    // Generate the predetermined wallet using server-side function
    const result = generatePredeterminedWalletServerSide(emailHash, contractId);
    
    console.log('[API] Predetermined wallet generated:', {
      address: result.predeterminedAddress.substring(0, 8) + '...',
      contractId,
      method: result.method
    });

    return NextResponse.json(result);
    
  } catch (error) {
    console.error('[API] Predetermined wallet generation failed:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to generate predetermined wallet',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 