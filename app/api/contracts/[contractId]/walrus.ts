import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/utils/db';

export async function POST(
  req: NextRequest,
  { params }: { params: { contractId: string } }
) {
  try {
    const contractId = params.contractId;
    const walrusData = await req.json();
    
    console.log('Updating contract with Walrus data:', {
      contractId, 
      walrusDataKeys: Object.keys(walrusData)
    });

    // Find the contract
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: { 
        signatures: true
      }
    });

    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    // Get existing metadata or initialize empty object
    const existingMetadata = contract.metadata as Record<string, any> || {};

    // Create updated metadata object
    const updatedMetadata = {
      ...existingMetadata,
      walrus: walrusData,
      walrusUploaded: true,
      authorizedWallets: contract.signatures
        .map((sig: any) => sig.walletAddress)
        .filter(Boolean)
    };

    // Update the contract
    const updatedContract = await prisma.contract.update({
      where: { id: contractId },
      data: { metadata: updatedMetadata }
    });

    console.log('Contract updated with Walrus data:', {
      contractId,
      blobId: walrusData.blobId
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating contract with Walrus data:', error);
    return NextResponse.json({ error: 'Failed to update contract' }, { status: 500 });
  }
}
