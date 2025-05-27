import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export async function POST(
  req: NextRequest,
  { params }: { params: { contractId: string } }
) {
  try {
    const contractId = params.contractId;
    const walrusData = await req.json();
    
    logger.info('Updating contract with Walrus data', {
      contractId, 
      walrusDataKeys: Object.keys(walrusData)
    });

    // Find the contract
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: { 
        signatures: {
          include: {
            user: true
          }
        } 
      }
    });

    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    // Get existing metadata or initialize empty object
    const existingMetadata = contract.metadata || {};

    // Create updated metadata object
    const updatedMetadata = {
      ...existingMetadata,
      walrus: walrusData,
      walrusUploaded: true,
      authorizedWallets: contract.signatures
        .map(sig => sig.walletAddress)
        .filter(Boolean)
    };

    // Update the contract
    const updatedContract = await prisma.contract.update({
      where: { id: contractId },
      data: { metadata: updatedMetadata }
    });

    logger.info('Contract updated with Walrus data', {
      contractId,
      blobId: walrusData.blobId
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error updating contract with Walrus data', {
      error: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json({ error: 'Failed to update contract' }, { status: 500 });
  }
}
