import { NextResponse } from 'next/server';
import { prisma } from '@/app/utils/db';
import { log } from '@/app/utils/logger';

// GET /api/contracts/[contractId] - Get a single contract by ID
export async function GET(
  request: Request,
  { params }: { params: { contractId: string } }
) {
  try {
    const contractId = await Promise.resolve(params.contractId);
    
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
      contractId: await Promise.resolve(params.contractId),
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
    const contractId = await Promise.resolve(params.contractId);
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
      const errorResponse = { error: 'Contract not found' };
      log.error('Contract not found for update', { 
        contractId,
        requestPath: new URL(request.url).pathname,
        response: errorResponse
      });
      return NextResponse.json(
        errorResponse,
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
          const errorResponse = { error: 'Cannot send contract for signatures without adding signers' };
          log.warn('Cannot set contract to PENDING without signers', { 
            contractId,
            signers,
            response: errorResponse
          });
          return NextResponse.json(
            errorResponse,
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
    
    // Handle metadata field - preserve existing metadata fields not being updated
    let updateData: any = {};
    
    // Handle metadata field if present
    if (body.metadata) {
      // Merge with existing metadata to preserve fields
      updateData.metadata = {
        ...(existingContract.metadata || {}),
        ...body.metadata
      };
    }
    
    // Handle standard fields
    const standardFields = [
      'title', 'description', 'content', 'status', 
      'expiresAt', 'updatedAt'
    ];
    
    standardFields.forEach(field => {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    });
    
    // Only try to update Walrus fields if they exist in the schema
    // This is important because the Python script sends these fields
    const walrusFields = [
      'walrusBlobId', 'allowlistId', 'documentId', 'authorizedUsers', 'encryptionInfo'
    ];
    
    walrusFields.forEach(field => {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    });
    
    log.debug('Prepared update data', { 
      contractId,
      updateDataFields: Object.keys(updateData),
      hasMetadata: !!updateData.metadata,
      hasWalrusFields: walrusFields.some(f => f in updateData)
    });
    
    try {
    const updatedContract = await prisma.contract.update({
      where: { id: contractId },
        data: updateData,
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
    } catch (prismaError) {
      // If Prisma validation fails, try a fallback approach with just metadata
      log.warn('Prisma update failed, attempting fallback with metadata only', {
        contractId,
        error: prismaError instanceof Error ? prismaError.message : String(prismaError),
      });
      
      // Extract Walrus data from body and put it all in metadata
      const walrusMetadata = existingContract.metadata 
        ? typeof existingContract.metadata === 'object' 
          ? { ...existingContract.metadata as Record<string, any> } 
          : {}
        : {};
      
      if (body.metadata?.walrus) {
        walrusMetadata.walrus = body.metadata.walrus;
      }
      
      // Special handling for Walrus fields
      const walrusBlobId = body.walrusBlobId || body.metadata?.walrus?.storage?.blobId || null;
      const allowlistId = body.allowlistId || body.metadata?.walrus?.encryption?.allowlistId || null;
      const documentId = body.documentId || body.metadata?.walrus?.encryption?.documentId || null;
      const authorizedUsers = body.authorizedUsers || body.metadata?.walrus?.authorizedWallets || [];
      
      log.debug('Extracted Walrus fields for fallback update', {
        walrusBlobId,
        allowlistId,
        documentId,
        hasAuthorizedUsers: Array.isArray(authorizedUsers) && authorizedUsers.length > 0
      });
      
      // First try with just metadata which seems to work
      try {
        const metadataOnlyContract = await prisma.contract.update({
          where: { id: contractId },
          data: { metadata: walrusMetadata },
          include: {
            owner: true,
            signatures: {
              include: {
                user: true,
              },
            },
          },
        });
        
        log.info('Contract metadata updated successfully, now trying Walrus fields', { 
          contractId,
          walrusBlobId: walrusBlobId?.substring(0, 10) + '...'
        });
        
        // Now try to update each individual field one at a time
        if (walrusBlobId) {
          try {
            // Cast to any to bypass type checking since we know these fields exist in the actual database
            await prisma.$executeRaw`UPDATE "Contract" SET "walrusBlobId" = ${walrusBlobId} WHERE id = ${contractId}`;
            log.info('Updated walrusBlobId successfully via raw query', { contractId });
          } catch (walrusErr) {
            log.error('Failed to update walrusBlobId', { 
              error: walrusErr instanceof Error ? walrusErr.message : String(walrusErr),
              contractId
            });
          }
        }
        
        if (allowlistId) {
          try {
            await prisma.$executeRaw`UPDATE "Contract" SET "allowlistId" = ${allowlistId} WHERE id = ${contractId}`;
            log.info('Updated allowlistId successfully via raw query', { contractId });
          } catch (allowErr) {
            log.error('Failed to update allowlistId', { 
              error: allowErr instanceof Error ? allowErr.message : String(allowErr),
              contractId
            });
          }
        }
        
        if (documentId) {
          try {
            await prisma.$executeRaw`UPDATE "Contract" SET "documentId" = ${documentId} WHERE id = ${contractId}`;
            log.info('Updated documentId successfully via raw query', { contractId });
          } catch (docErr) {
            log.error('Failed to update documentId', { 
              error: docErr instanceof Error ? docErr.message : String(docErr),
              contractId
            });
          }
        }
        
        if (Array.isArray(authorizedUsers) && authorizedUsers.length > 0) {
          try {
            // For array types, we need to convert to JSON string
            const authorizedUsersJson = JSON.stringify(authorizedUsers);
            await prisma.$executeRaw`UPDATE "Contract" SET "authorizedUsers" = ${authorizedUsersJson}::jsonb WHERE id = ${contractId}`;
            log.info('Updated authorizedUsers successfully via raw query', { contractId });
          } catch (authErr) {
            log.error('Failed to update authorizedUsers', { 
              error: authErr instanceof Error ? authErr.message : String(authErr),
              contractId
            });
          }
        }
        
        // Get the updated contract with all fields to return
        try {
          const finalContract = await prisma.contract.findUnique({
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
          
          if (!finalContract) {
            throw new Error('Contract not found after update');
          }
          
          log.info('Retrieved final contract state after all updates', { 
            contractId,
            hasWalrusBlobId: !!(finalContract as any).walrusBlobId,
            hasAllowlistId: !!(finalContract as any).allowlistId,
            hasDocumentId: !!(finalContract as any).documentId,
            authorizedUsersCount: (finalContract as any).authorizedUsers?.length || 0
          });
          
          return NextResponse.json(finalContract);
        } catch (finalFetchErr) {
          log.warn('Failed to fetch final contract state, returning metadata-only contract', {
            error: finalFetchErr instanceof Error ? finalFetchErr.message : String(finalFetchErr),
            contractId
          });
          // Return the updated contract with just metadata for now
          return NextResponse.json(metadataOnlyContract);
        }
      } catch (metadataErr) {
        log.error('Failed to update even the metadata', {
          error: metadataErr instanceof Error ? metadataErr.message : String(metadataErr),
          contractId
        });
        
        const errorResponse = { error: 'Failed to update contract' };
        return NextResponse.json(
          errorResponse,
          { status: 500 }
        );
      }
    }
  } catch (error) {
    const errorResponse = { error: 'Failed to update contract' };
    log.error('Error updating contract', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      contractId: await Promise.resolve(params.contractId),
      requestPath: request.url,
      response: errorResponse
    });
    return NextResponse.json(
      errorResponse,
      { status: 500 }
    );
  }
} 