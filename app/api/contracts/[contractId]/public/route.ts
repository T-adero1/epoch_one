import { NextResponse } from 'next/server';
import { prisma } from '@/app/utils/db';
import { log } from '@/app/utils/logger';

// GET /api/contracts/[contractId]/public - Get basic public info about a contract
export async function GET(
  request: Request,
  { params }: { params: { contractId: string } }
) {
  try {
    const contractId = params.contractId;
    
    log.info('Fetching public contract info', { 
      contractId,
      requestUrl: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries())
    });
    
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        title: true,
        status: true,
        metadata: true,
      },
    });
    
    if (!contract) {
      log.warn('Contract not found for public info', { 
        contractId,
        requestPath: new URL(request.url).pathname
      });
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }
    
    // Only return the signers information for the public endpoint
    const signers = contract.metadata?.signers || [];
    
    log.info('Successfully fetched public contract info', { 
      contractId,
      title: contract.title,
      status: contract.status,
      signerCount: signers.length,
      signers
    });
    
    return NextResponse.json({ 
      id: contract.id,
      signers
    });
  } catch (error) {
    log.error('Error fetching public contract info', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      contractId: params.contractId,
      requestPath: request.url
    });
    return NextResponse.json(
      { error: 'Failed to fetch contract information' },
      { status: 500 }
    );
  }
} 