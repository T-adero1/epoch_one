import { NextResponse } from 'next/server';
import { prisma, withTransaction } from '@/app/utils/db';
import { ContractStatus } from '@prisma/client';

// GET /api/contracts - Get all contracts with their owners and signatures
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userGoogleIdHash = searchParams.get('userGoogleIdHash'); // Only hashed Google ID
    const status = searchParams.get('status');

    if (!userGoogleIdHash) {
      return NextResponse.json(
        { error: 'Hashed Google ID is required' },
        { status: 400 }
      );
    }

    // ✅ FIX: Properly type the status parameter
    const statusFilter = status ? status as ContractStatus : undefined;

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
      // ✅ FIX: Apply status filter with proper typing
      ...(statusFilter && { status: statusFilter })
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
    
    return NextResponse.json(contracts);
  } catch (error) {
    console.error('Error fetching contracts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch contracts' },
      { status: 500 }
    );
  }
}

// POST /api/contracts - Create a new contract
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, description, content, ownerGoogleIdHash, metadata } = body;

    if (!title || !ownerGoogleIdHash) {
      return NextResponse.json(
        { error: 'Title and hashed Google ID are required' },
        { status: 400 }
      );
    }

    // Create the contract
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
      
    return NextResponse.json(contract);
  } catch (error) {
    console.error('Contract creation failed:', error);
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
    const { id, title, description, content, status, metadata } = body;

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
        },
        include: {
          signatures: true
        },
      });
    });

    return NextResponse.json(contract);
  } catch (error) {
    console.error('Error updating contract:', error); // ✅ FIX: Use simple console.error
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
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    // Delete PDF from S3 if it exists
    if (contract.s3FileKey) {
      try {
        const { deleteFromS3 } = await import('@/app/utils/s3');
        await deleteFromS3(contract.s3FileKey);
      } catch (s3Error) {
        // Log the error but don't fail the entire operation
        console.error('Failed to delete S3 file, continuing with contract deletion:', s3Error);
      }
    }

    // Use a transaction to delete signatures first, then the contract
    await withTransaction(async (tx) => {
      // First delete all associated signatures
      await tx.signature.deleteMany({
        where: { contractId: id }
      });

      // Then delete the contract
      await tx.contract.delete({
        where: { id }
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting contract:', error);
    return NextResponse.json(
      { error: 'Failed to delete contract' },
      { status: 500 }
    );
  }
} 