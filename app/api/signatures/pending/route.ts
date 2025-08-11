import { NextResponse } from 'next/server';
import { prisma } from '@/app/utils/db';

// GET /api/signatures/pending - Get contracts that need to be signed by a specific email
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json(
        { error: 'Email parameter is required' },
        { status: 400 }
      );
    }
    
    // Normalize email to lowercase for case-insensitive comparison
    const normalizedEmail = email.toLowerCase();

    // Hash the email to match the schema
    const { hashGoogleId } = await import('@/app/utils/privacy');
    const userGoogleIdHash = await hashGoogleId(`email_${normalizedEmail}`);

    // Find PENDING contracts where the user's email is in the signers array
    const contractsToSign = await prisma.contract.findMany({
      where: {
        status: 'PENDING', // Only include contracts with PENDING status
        // Check for user's email in the signers array within metadata
        metadata: {
          path: ['signers'],
          array_contains: normalizedEmail,
        },
        // Exclude contracts that the user has already signed
        NOT: {
          signatures: {
            some: {
              userGoogleIdHash: userGoogleIdHash, // Use userGoogleIdHash instead of user relation
              status: 'SIGNED'
            }
          }
        }
      },
      include: {
        signatures: true // Remove the problematic user include
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    // Transform the response to include useful information
    const contractsWithDetails = contractsToSign.map(contract => {
      const metadata = contract.metadata as any;
      return {
        ...contract,
        signerCount: metadata?.signers?.length || 0,
        signatureCount: contract.signatures?.length || 0
      };
    });

    return NextResponse.json(contractsWithDetails);
  } catch (error) {
    console.error('Error fetching contracts to sign:', error);
    return NextResponse.json(
      { error: 'Failed to fetch contracts' },
      { status: 500 }
    );
  }
} 