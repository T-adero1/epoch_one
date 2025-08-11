import { NextResponse } from 'next/server';
import { prisma } from '@/app/utils/db';
import { log } from '@/app/utils/logger';

// GET /api/contracts/[contractId] - Get a single contract by ID
export async function GET(
  request: Request,
  { params }: { params: Promise<{ contractId: string }> }
) {
  try {
    const { contractId } = await params;
    
    log.info('Fetching contract by ID', { 
      contractId,
      requestUrl: request.url,
      method: request.method,
      headers: JSON.stringify(Object.fromEntries(request.headers.entries()))
    });
    
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        // ✅ REMOVED: owner relation (doesn't exist in privacy schema)
        signatures: true, // ✅ SIMPLIFIED: no user relation needed
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
      ownerGoogleIdHash: contract.ownerGoogleIdHash?.substring(0, 8) + '...', // ✅ UPDATED
      signatureCount: contract.signatures.length,
      // ✅ ADD: Log encrypted email info
      hasEncryptedEmails: !!(contract.metadata as any)?.encryptedSignerEmails,
      encryptedEmailCount: (contract.metadata as any)?.encryptedSignerEmails?.length || 0,
      signers: (contract.metadata as any)?.signers || []
    });
    
    log.debug('Detailed contract data', {
      contractId,
      content: contract.content ? `${contract.content.substring(0, 50)}...` : 'No content',
      metadata: contract.metadata as any, // ✅ FIX: Cast JsonValue to any for logging
      signatures: contract.signatures.map(sig => ({
        id: sig.id,
        userGoogleIdHash: sig.userGoogleIdHash?.substring(0, 8) + '...', // ✅ UPDATED
        email: sig.email, // This might be null in privacy schema
        status: sig.status,
        signedAt: sig.signedAt
      })) as any
    });
    
    return NextResponse.json(contract);
  } catch (error) {
    const cid = (await params).contractId;
    log.error('Error fetching contract details', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      contractId: cid,
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
  { params }: { params: Promise<{ contractId: string }> }
) {
  try {
    const { contractId } = await params;
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
        signatures: true, // ✅ SIMPLIFIED: removed user relation
      }
    });
    
    if (!existingContract) {
      const errorResponse = { error: 'Contract not found' };
      log.error('Contract not found for update', { 
        contractId,
        requestPath: new URL(request.url).pathname,
        response: errorResponse as any // ✅ FIX: Cast errorResponse to any for logging
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
      // ✅ UPDATED: Log encrypted email info
      hasEncryptedEmails: !!(existingContract.metadata as any)?.encryptedSignerEmails,
      encryptedEmailCount: (existingContract.metadata as any)?.encryptedSignerEmails?.length || 0,
      signers: ((existingContract.metadata as any)?.signers || []) as any // ✅ FIX: Cast signers array to any
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
        const signers = (existingContract.metadata as any)?.signers || [];
        const encryptedEmails = (existingContract.metadata as any)?.encryptedSignerEmails || [];
        
        if (signers.length === 0 && encryptedEmails.length === 0) {
          const errorResponse = { error: 'Cannot send contract for signatures without adding signers' };
          log.warn('Cannot set contract to PENDING without signers', { 
            contractId,
            signers: signers as any, // ✅ FIX: Cast signers to any for logging
            encryptedEmails: encryptedEmails.length,
            response: errorResponse as any // ✅ FIX: Cast errorResponse to any for logging
          });
          return NextResponse.json(
            errorResponse,
            { status: 400 }
          );
        }
        log.debug('Contract has signers, status change allowed', {
          contractId,
          signerCount: signers.length,
          encryptedEmailCount: encryptedEmails.length
        });
      }
    }
    
    // Handle metadata field - preserve existing metadata fields not being updated
    const updateData: any = {};
    
    // Handle metadata field if present
    if (body.metadata) {
      // Merge with existing metadata to preserve fields (including encrypted emails)
      updateData.metadata = {
        ...(existingContract.metadata as Record<string, any> || {}),
        ...body.metadata
      };
      
      // ✅ ADD: Log metadata update
      log.debug('Updating metadata', {
        contractId,
        existingMetadataKeys: Object.keys(existingContract.metadata as Record<string, any> || {}) as any, // ✅ FIX: Cast array to any
        newMetadataKeys: Object.keys(body.metadata) as any, // ✅ FIX: Cast array to any
        mergedMetadataKeys: Object.keys(updateData.metadata) as any, // ✅ FIX: Cast array to any
        hasEncryptedEmails: !!updateData.metadata.encryptedSignerEmails
      });
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
    
    // Handle additional schema fields
    const additionalFields = [
      'walrusBlobId', 'allowlistId', 'documentId', 'authorizedUsers', 
      'encryptionInfo', 'sealAllowlistId', 'sealDocumentId', 'sealCapId', 
      'isEncrypted', 'originalFileName'
    ];
    
    additionalFields.forEach(field => {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    });
    
    log.debug('Prepared update data', { 
      contractId,
      updateDataFields: Object.keys(updateData) as any, // ✅ FIX: Cast array to any
      hasMetadata: !!updateData.metadata,
      hasEncryptedEmails: !!(updateData.metadata?.encryptedSignerEmails)
    });
    
    const updatedContract = await prisma.contract.update({
      where: { id: contractId },
      data: updateData,
      include: {
        signatures: true, // ✅ SIMPLIFIED: removed user relation
      },
    });
    
    log.info('Contract updated successfully', { 
      contractId,
      title: updatedContract.title,
      newStatus: updatedContract.status,
      // ✅ ADD: Log encrypted email info
      hasEncryptedEmails: !!(updatedContract.metadata as any)?.encryptedSignerEmails,
      encryptedEmailCount: (updatedContract.metadata as any)?.encryptedSignerEmails?.length || 0
    });
    
    return NextResponse.json(updatedContract);
  } catch (error) {
    const cid = (await params).contractId;
    const errorResponse = { error: 'Failed to update contract' };
    log.error('Error updating contract', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      contractId: cid,
      requestPath: request.url,
      response: errorResponse as any // ✅ FIX: Cast errorResponse to any for logging
    });
    return NextResponse.json(
      errorResponse,
      { status: 500 }
    );
  }
} 