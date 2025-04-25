import { NextResponse } from 'next/server';
import { prisma, withTransaction } from '@/app/utils/db';
import { log } from '@/app/utils/logger';

// GET /api/contracts - Get all contracts with their owners and signatures
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userEmail = searchParams.get('userId'); // This is actually the email
    const status = searchParams.get('status');

    log.info('Fetching contracts', { userEmail, status });

    // First find the user by email
    let userId;
    if (userEmail) {
      const user = await prisma.user.findUnique({
        where: { email: userEmail },
        select: { id: true }
      });

      log.info('User lookup result:', {
        email: userEmail,
        found: !!user
      });

      if (!user) {
        return NextResponse.json([]);  // Return empty array if user not found
      }
      userId = user.id;
    }

    const where = {
      ...(userId && { ownerId: userId }),
      ...(status && { status: status }),
    };

    const contracts = await prisma.contract.findMany({
      where,
      include: {
        owner: true,
        signatures: {
          include: {
            user: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    log.info('Successfully fetched contracts', { 
      count: contracts.length,
      userEmail,
      userId 
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
    const { title, description, content, ownerId: ownerEmail, metadata } = body;

    log.info('Contracts API: Request payload', {
      title,
      ownerEmail,
      hasDescription: !!description,
      hasContent: !!content,
      hasMetadata: !!metadata,
      metadataKeys: metadata ? Object.keys(metadata) : []
    });

    if (!title || !ownerEmail) {
      log.warn('Contracts API: Missing required fields', {
        hasTitle: !!title,
        hasOwnerEmail: !!ownerEmail
      });
      return NextResponse.json(
        { error: 'Title and owner email are required' },
        { status: 400 }
      );
    }

    // Detailed user lookup with timing
    const startLookup = Date.now();
    log.info('Contracts API: Looking up user', { email: ownerEmail });
    
    const user = await prisma.user.findUnique({
      where: { email: ownerEmail },
      select: { id: true, email: true, walletAddress: true }
    });
    
    const lookupDuration = Date.now() - startLookup;
    log.info('Contracts API: User lookup completed', {
      email: ownerEmail,
      found: !!user,
      lookupDurationMs: lookupDuration,
      userData: user ? {
        id: user.id,
        hasWalletAddress: !!user.walletAddress
      } : null
    });

    if (!user) {
      log.error('Contracts API: User not found in database', {
        email: ownerEmail,
        action: 'Attempting to create user automatically'
      });
      
      // Try to create the user automatically
      try {
        const createUserResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: ownerEmail,
            walletAddress: 'placeholder-' + Date.now(), // Temporary placeholder
            name: ownerEmail.split('@')[0] // Simple name from email
          })
        });
        
        if (createUserResponse.ok) {
          const newUser = await createUserResponse.json();
          log.info('Contracts API: Created missing user automatically', {
            id: newUser.id,
            email: newUser.email
          });
          
          // Use the newly created user
          user = newUser;
        } else {
          const errorData = await createUserResponse.json();
          log.error('Contracts API: Failed to create user automatically', {
            statusCode: createUserResponse.status,
            error: errorData
          });
          
          return NextResponse.json(
            { error: 'Owner not found and could not be created automatically' },
            { status: 404 }
          );
        }
      } catch (userCreateError) {
        log.error('Contracts API: Error during automatic user creation', {
          error: userCreateError instanceof Error ? userCreateError.message : String(userCreateError)
        });
        
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        );
      }
    }

    log.info('Contracts API: Creating contract', {
      title,
      ownerId: user.id,
      ownerEmail
    });

    // Now create the contract
    const startContractCreate = Date.now();
    try {
      const contract = await withTransaction(async (tx) => {
        const result = await tx.contract.create({
          data: {
            title,
            description,
            content,
            ownerId: user.id,
            status: 'DRAFT',
            metadata,
          },
          include: {
            owner: true,
            signatures: true,
          },
        });
        
        return result;
      });
      
      const createDuration = Date.now() - startContractCreate;
      log.info('Contracts API: Contract created successfully', {
        contractId: contract.id,
        title: contract.title,
        ownerId: contract.ownerId,
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
    const { id, title, description, content, status, metadata } = body;

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
        },
        include: {
          owner: true,
          signatures: {
            include: {
              user: true,
            },
          },
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

    // Check if the contract exists
    const contractExists = await prisma.contract.findUnique({
      where: { id },
      select: { id: true }
    });

    if (!contractExists) {
      log.warn('Contract not found for deletion', { contractId: id });
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
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