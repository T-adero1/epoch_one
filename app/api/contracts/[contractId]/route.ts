import { NextResponse } from 'next/server';
import { prisma } from '@/app/utils/db';
import { log } from '@/app/utils/logger';

// GET /api/contracts/[contractId] - Get a single contract by ID
export async function GET(
  request: Request,
  { params }: { params: { contractId: string } }
) {
  try {
    const contractId = params.contractId;
    
    log.info('Fetching contract by ID', { 
      contractId,
      requestUrl: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries())
    });
    
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        owner: true,
        signatures: {
          include: {
            user: true,
          },
        },
      },
    });
    
    if (!contract) {
      log.warn('Contract not found for detailed info', { 
        contractId,
        requestPath: new URL(request.url).pathname
      });
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }
    
    log.info('Successfully fetched contract details', { 
      contractId,
      title: contract.title,
      status: contract.status,
      ownerEmail: contract.owner.email,
      signatureCount: contract.signatures.length,
      signers: contract.metadata?.signers || []
    });
    
    log.debug('Detailed contract data', {
      contractId,
      content: contract.content ? `${contract.content.substring(0, 50)}...` : 'No content',
      signatures: contract.signatures.map(sig => ({
        id: sig.id,
        userEmail: sig.user.email,
        status: sig.status,
        signedAt: sig.signedAt
      }))
    });
    
    return NextResponse.json(contract);
  } catch (error) {
    log.error('Error fetching contract details', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      contractId: params.contractId,
      requestPath: request.url
    });
    return NextResponse.json(
      { error: 'Failed to fetch contract' },
      { status: 500 }
    );
  }
}

// PATCH /api/contracts/[contractId] - Update a contract
export async function PATCH(
  request: Request,
  { params }: { params: { contractId: string } }
) {
  try {
    const contractId = params.contractId;
    const body = await request.json();
    
    log.info('Updating contract', { 
      contractId, 
      updates: { ...body, content: body.content ? 'Content available but not logged' : undefined },
      requestUrl: request.url,
      method: request.method
    });
    
    // Validate contract exists
    const existingContract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        signatures: {
          include: {
            user: true,
          },
        },
      }
    });
    
    if (!existingContract) {
      log.error('Contract not found for update', { 
        contractId,
        requestPath: new URL(request.url).pathname
      });
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }
    
    log.debug('Existing contract data before update', {
      contractId,
      title: existingContract.title,
      status: existingContract.status,
      signatureCount: existingContract.signatures.length,
      signers: existingContract.metadata?.signers || []
    });
    
    // Special handling for status updates
    if (body.status && body.status !== existingContract.status) {
      log.info('Contract status change detected', { 
        contractId, 
        oldStatus: existingContract.status, 
        newStatus: body.status 
      });
      
      // If changing from DRAFT to PENDING, make sure it has signers
      if (body.status === 'PENDING' && existingContract.status === 'DRAFT') {
        const signers = existingContract.metadata?.signers || [];
        if (signers.length === 0) {
          log.warn('Cannot set contract to PENDING without signers', { 
            contractId,
            signers
          });
          return NextResponse.json(
            { error: 'Cannot send contract for signatures without adding signers' },
            { status: 400 }
          );
        }
        log.debug('Contract has signers, status change allowed', {
          contractId,
          signerCount: signers.length,
          signers
        });
      }
    }
    
    const updatedContract = await prisma.contract.update({
      where: { id: contractId },
      data: body,
      include: {
        owner: true,
        signatures: {
          include: {
            user: true,
          },
        },
      },
    });
    
    log.info('Contract updated successfully', { 
      contractId,
      title: updatedContract.title,
      newStatus: updatedContract.status
    });
    
    return NextResponse.json(updatedContract);
  } catch (error) {
    log.error('Error updating contract', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      contractId: params.contractId,
      requestPath: request.url
    });
    return NextResponse.json(
      { error: 'Failed to update contract' },
      { status: 500 }
    );
  }
} 