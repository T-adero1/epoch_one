import { NextResponse } from 'next/server';
import { prisma, withTransaction } from '@/app/utils/db';
import { log } from '@/app/utils/logger';

// GET /api/contracts - Get all contracts with their owners and signatures
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userGoogleIdHash = searchParams.get('userGoogleIdHash'); // Only hashed Google ID
    const status = searchParams.get('status');

    log.info('Fetching contracts', { 
      userGoogleIdHash: userGoogleIdHash?.substring(0, 8) + '...', 
      status 
    });

    if (!userGoogleIdHash) {
      log.warn('Missing required parameters', { 
        hasUserGoogleIdHash: Boolean(userGoogleIdHash)
      });
      return NextResponse.json(
        { error: 'Hashed Google ID is required' },
        { status: 400 }
      );
    }

    // Build the where clause to include:
    // 1. Contracts owned by the user (by hashed Google ID)
    // 2. Contracts where user has already signed (by hashed Google ID in signatures)
    // 3. Contracts where user's hashed Google ID is in metadata signers
    const where = {
      OR: [
        // User's own contracts - match by ownerGoogleIdHash
        { ownerGoogleIdHash: userGoogleIdHash },
        // Contracts where user has already signed
        {
          signatures: {
            some: {
              userGoogleIdHash: userGoogleIdHash
            }
          }
        },
        // Contracts where user is invited (hashed Google ID in signers)
        {
          metadata: {
            path: ['signers'],
            array_contains: userGoogleIdHash
          }
        }
      ],
      // Apply status filter if provided
      ...(status && { status: status })
    };

    const contracts = await prisma.contract.findMany({
      where,
      include: {
        signatures: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    log.info('Successfully fetched contracts', { 
      count: contracts.length,
      userGoogleIdHash: userGoogleIdHash.substring(0, 8) + '...'
    });
    
    return NextResponse.json(contracts);
  } catch (error) {
    log.error('Error fetching contracts', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: 'Failed to fetch contracts' },
      { status: 500 }
    );
  }
}

// POST /api/contracts - Create a new contract
export async function POST(request: Request) {
  try {
    log.info('Contracts API: Starting contract creation request');
    
    const body = await request.json();
    const { title, description, content, ownerGoogleIdHash, metadata } = body;

    log.info('Contracts API: Request payload', {
      title,
      ownerGoogleIdHash: ownerGoogleIdHash?.substring(0, 8) + '...',
      hasDescription: !!description,
      hasContent: !!content,
      hasMetadata: !!metadata,
      metadataKeys: metadata ? Object.keys(metadata) : [],
      // ✅ ADD: Log encrypted email info
      hasEncryptedEmails: !!(metadata?.encryptedSignerEmails),
      encryptedEmailCount: metadata?.encryptedSignerEmails?.length || 0,
      signerCount: metadata?.signers?.length || 0
    });

    if (!title || !ownerGoogleIdHash) {
      log.warn('Contracts API: Missing required fields', {
        hasTitle: !!title,
        hasOwnerGoogleIdHash: !!ownerGoogleIdHash
      });
      return NextResponse.json(
        { error: 'Title and hashed Google ID are required' },
        { status: 400 }
      );
    }

    log.info('Contracts API: Creating contract', {
      title,
      ownerGoogleIdHash: ownerGoogleIdHash.substring(0, 8) + '...',
      hasSigners: !!(metadata?.signers?.length)
    });

    // Create the contract
    const startContractCreate = Date.now();
    try {
      const contract = await withTransaction(async (tx) => {
        const result = await tx.contract.create({
          data: {
            title,
            description,
            content,
            ownerGoogleIdHash,
            status: 'DRAFT',
            metadata,
          },
          include: {
            signatures: true
          },
        });
        
        return result;
      });
      
      const createDuration = Date.now() - startContractCreate;
      log.info('Contracts API: Contract created successfully', {
        contractId: contract.id,
        title: contract.title,
        ownerGoogleIdHash: ownerGoogleIdHash.substring(0, 8) + '...',
        signerCount: metadata?.signers?.length || 0,
        createDurationMs: createDuration
      });
      
      return NextResponse.json(contract);
    } catch (contractError) {
      log.error('Contracts API: Error creating contract in database', {
        error: contractError instanceof Error ? contractError.message : String(contractError),
        stack: contractError instanceof Error ? contractError.stack : undefined
      });
      throw contractError;
    }
  } catch (error) {
    log.error('Contracts API: Contract creation failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.json(
      { error: 'Failed to create contract' },
      { status: 500 }
    );
  }
}

// PUT /api/contracts - Update a contract
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    //  ADD: Extract signaturePositions from request body
    const { id, title, description, content, status, metadata, signaturePositions } = body;

    log.info('Updating contract', { id, status });

    if (!id) {
      return NextResponse.json(
        { error: 'Contract ID is required' },
        { status: 400 }
      );
    }

    const contract = await withTransaction(async (tx) => {
      return tx.contract.update({
        where: { id },
        data: {
          title,
          description,
          content,
          status,
          metadata,
          signaturePositions,  // ADD: Include signaturePositions in update
        },
        include: {
          signatures: true
        },
      });
    });

    log.info('Successfully updated contract', { contractId: contract.id });
    return NextResponse.json(contract);
  } catch (error) {
    log.error('Error updating contract', error);
    return NextResponse.json(
      { error: 'Failed to update contract' },
      { status: 500 }
    );
  }
}

// DELETE /api/contracts - Delete a contract  
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    log.info('Deleting contract', { id });

    if (!id) {
      return NextResponse.json(
        { error: 'Contract ID is required' },
        { status: 400 }
      );
    }

    // Check if the contract exists and get S3 file info
    const contract = await prisma.contract.findUnique({
      where: { id },
      select: { 
        id: true,
        s3FileKey: true,
        s3FileName: true
      }
    });

    if (!contract) {
      log.warn('Contract not found for deletion', { contractId: id });
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    // Delete PDF from S3 if it exists
    if (contract.s3FileKey) {
      try {
        log.info('Deleting S3 file for contract', { 
          contractId: id, 
          s3FileKey: contract.s3FileKey,
          fileName: contract.s3FileName
        });
        
        const { deleteFromS3 } = await import('@/app/utils/s3');
        await deleteFromS3(contract.s3FileKey);
        
        log.info('Successfully deleted S3 file', { 
          contractId: id, 
          s3FileKey: contract.s3FileKey 
        });
      } catch (s3Error) {
        // Log the error but don't fail the entire operation
        log.error('Failed to delete S3 file, continuing with contract deletion', {
          contractId: id,
          s3FileKey: contract.s3FileKey,
          error: s3Error instanceof Error ? s3Error.message : String(s3Error)
        });
      }
    } else {
      log.info('No S3 file to delete for contract', { contractId: id });
    }

    // Use a transaction to delete signatures first, then the contract
    await withTransaction(async (tx) => {
      // First delete all associated signatures
      log.info('Deleting associated signatures for contract', { contractId: id });
      const deleteSignatures = await tx.signature.deleteMany({
        where: { contractId: id }
      });
      
      log.info('Deleted signatures', { 
        contractId: id, 
        count: deleteSignatures.count 
      });

      // Then delete the contract
      await tx.contract.delete({
        where: { id }
      });
    });

    log.info('Successfully deleted contract and associated signatures', { contractId: id });
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('Error deleting contract', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      contractId: searchParams.get('id')
    });
    return NextResponse.json(
      { error: 'Failed to delete contract' },
      { status: 500 }
    );
  }
} 