import { NextResponse } from 'next/server';
import { prisma } from '@/app/utils/db';
import { log } from '@/app/utils/logger';

// GET /api/signatures/pending - Get contracts that need to be signed by a specific email
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email) {
      log.warn('Missing email parameter for pending signatures', {
        url: request.url,
        headers: Object.fromEntries(request.headers.entries())
      });
      return NextResponse.json(
        { error: 'Email parameter is required' },
        { status: 400 }
      );
    }

    log.info('Fetching contracts to sign', { 
      email,
      requestUrl: request.url,
      method: request.method
    });
    
    // Normalize email to lowercase for case-insensitive comparison
    const normalizedEmail = email.toLowerCase();
    log.debug('Normalized email for signature search', { originalEmail: email, normalizedEmail });

    // Find PENDING contracts where the user's email is in the signers array
    log.debug('Executing Prisma query for pending signatures', {
      status: 'PENDING',
      signerEmail: normalizedEmail
    });
    
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
              user: {
                email: {
                  equals: normalizedEmail,
                  mode: 'insensitive'
                }
              },
              status: 'SIGNED'
            }
          }
        }
      },
      include: {
        owner: {
          select: {
            name: true,
            email: true
          }
        },
        signatures: {
          include: {
            user: true
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    log.info('Found contracts to sign', { 
      email: normalizedEmail, 
      count: contractsToSign.length,
      contractIds: contractsToSign.map(c => c.id)
    });
    
    if (contractsToSign.length === 0) {
      log.debug('No contracts found for signing', {
        email: normalizedEmail,
        query: {
          status: 'PENDING',
          signerEmail: normalizedEmail
        }
      });
    } else {
      log.debug('Contract signatures details', {
        contractsWithSignatures: contractsToSign.map(c => ({
          id: c.id,
          title: c.title,
          signers: c.metadata?.signers || [],
          signatureCount: c.signatures?.length || 0
        }))
      });
    }

    return NextResponse.json(contractsToSign);
  } catch (error) {
    log.error('Error fetching contracts to sign', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      email: searchParams?.get('email')
    });
    return NextResponse.json(
      { error: 'Failed to fetch contracts' },
      { status: 500 }
    );
  }
} 