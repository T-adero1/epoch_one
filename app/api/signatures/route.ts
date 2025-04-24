import { NextResponse } from 'next/server';
import { prisma } from '@/app/utils/db';
import { log } from '@/app/utils/logger';

// Define types for contract metadata and signature with user
interface ContractMetadata {
  signers?: string[];
  [key: string]: unknown;
}

interface SignatureWithUser {
  id: string;
  userId: string;
  contractId: string;
  walletAddress: string;
  signature: string | null;
  status: string;
  signedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    email: string;
    name?: string | null;
    walletAddress?: string | null;
  };
}

// POST /api/signatures - Add a signature to a contract
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { contractId, userEmail, walletAddress, signature } = body;

    log.info('Creating signature', { 
      contractId, 
      userEmail,
      hasWalletAddress: !!walletAddress,
      hasSignature: !!signature,
      requestUrl: request.url,
      method: request.method
    });

    if (!contractId || !userEmail || !walletAddress || !signature) {
      log.warn('Missing required fields for signature creation', { 
        hasContractId: !!contractId, 
        hasUserEmail: !!userEmail,
        hasWalletAddress: !!walletAddress,
        hasSignature: !!signature
      });
      return NextResponse.json(
        { error: 'Contract ID, user email, wallet address, and signature are required' },
        { status: 400 }
      );
    }

    // Find contract
    log.debug('Finding contract for signature', { contractId });
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
      log.error('Contract not found for signature', { contractId });
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    log.debug('Contract found for signature', { 
      contractId, 
      title: contract.title,
      status: contract.status,
      ownerEmail: contract.ownerId,
      existingSignatures: contract.signatures.length
    });

    // Parse metadata and check if user is allowed to sign (in signers list)
    const metadata = contract.metadata as ContractMetadata;
    const signers = metadata?.signers || [];
    log.debug('Contract signers for authorization check', { 
      contractId, 
      signers,
      userEmail: userEmail.toLowerCase()  
    });
    
    if (!signers.includes(userEmail.toLowerCase())) {
      log.error('User not authorized to sign contract', { 
        userEmail, 
        contractId,
        authorizedSigners: signers
      });
      return NextResponse.json(
        { error: 'User not authorized to sign this contract' },
        { status: 403 }
      );
    }

    // Find or create user
    log.debug('Looking up user for signature', { userEmail });
    let user = await prisma.user.findUnique({
      where: { email: userEmail }
    });

    if (!user) {
      log.info('Creating new user for signature', { 
        userEmail,
        walletAddress
      });
      user = await prisma.user.create({
        data: {
          email: userEmail,
          walletAddress: walletAddress
        }
      });
      log.debug('Created new user for signature', { 
        userId: user.id,
        userEmail: user.email  
      });
    } else {
      log.debug('Found existing user for signature', { 
        userId: user.id,
        userEmail: user.email,
        existingWalletAddress: user.walletAddress
      });
    }

    // Check if user already signed
    log.debug('Checking for existing signature', { 
      contractId, 
      userId: user.id
    });
    
    const existingSignature = await prisma.signature.findFirst({
      where: {
        contractId,
        userId: user.id
      }
    });

    if (existingSignature) {
      log.warn('User already signed this contract', { 
        userEmail, 
        contractId,
        signatureId: existingSignature.id,
        signedAt: existingSignature.signedAt
      });
      return NextResponse.json(
        { error: 'User has already signed this contract' },
        { status: 400 }
      );
    }

    // Create signature
    log.debug('Creating new signature record', { 
      contractId, 
      userId: user.id,
      walletAddress
    });
    
    const newSignature = await prisma.signature.create({
      data: {
        contractId,
        userId: user.id,
        walletAddress,
        signature,
        status: 'SIGNED',
        signedAt: new Date(),
      },
      include: {
        user: true,
        contract: true,
      },
    });

    log.info('Signature created successfully', { 
      signatureId: newSignature.id, 
      contractId, 
      userEmail,
      signedAt: newSignature.signedAt
    });

    // Update contract status if needed
    const allSignatures = [...contract.signatures, newSignature] as SignatureWithUser[];
    log.debug('Checking if all signatures are collected', {
      contractId,
      requiredSigners: signers.length,
      currentSignatures: allSignatures.length,
      signers,
      signerEmails: allSignatures.map(sig => sig.user.email)
    });
    
    const allSignersSigned = signers.every(signer => 
      allSignatures.some(sig => 
        sig.user.email.toLowerCase() === signer.toLowerCase() && 
        sig.status === 'SIGNED'
      )
    );

    if (allSignersSigned) {
      log.info('All signatures collected, updating contract status to COMPLETED', { 
        contractId,
        previousStatus: contract.status,
        newStatus: 'COMPLETED'
      });
      
      await prisma.contract.update({
        where: { id: contractId },
        data: { status: 'COMPLETED' },
      });
    } else if (contract.status === 'DRAFT') {
      log.info('First signature collected, updating contract status to PENDING', {
        contractId,
        previousStatus: contract.status,
        newStatus: 'PENDING'
      });
      
      await prisma.contract.update({
        where: { id: contractId },
        data: { status: 'PENDING' },
      });
    } else {
      log.debug('Contract status remains unchanged', {
        contractId,
        status: contract.status,
        signersRemaining: signers.filter(signer => 
          !allSignatures.some(sig => 
            sig.user.email.toLowerCase() === signer.toLowerCase() && 
            sig.status === 'SIGNED'
          )
        )
      });
    }

    return NextResponse.json(newSignature);
  } catch (error) {
    log.error('Error creating signature', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      requestBody: request.body ? '(request body available but not logged)' : undefined
    });
    return NextResponse.json(
      { error: 'Failed to create signature' },
      { status: 500 }
    );
  }
}

// GET /api/signatures - Get signatures for a contract
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const contractId = searchParams.get('contractId');
    
    if (!contractId) {
      log.warn('Missing contractId parameter for GET signatures', {
        url: request.url,
        parameters: Object.fromEntries(searchParams.entries())
      });
      return NextResponse.json(
        { error: 'Contract ID is required' },
        { status: 400 }
      );
    }
    
    log.info('Fetching signatures for contract', { 
      contractId,
      requestUrl: request.url,
      method: request.method
    });
    
    const signatures = await prisma.signature.findMany({
      where: { contractId },
      include: {
        user: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    log.info('Successfully fetched signatures', { 
      contractId, 
      count: signatures.length,
      signerEmails: signatures.map((sig: SignatureWithUser) => sig.user.email)
    });
    
    return NextResponse.json(signatures);
  } catch (error) {
    log.error('Error fetching signatures', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      contractId: new URL(request.url).searchParams.get('contractId')
    });
    return NextResponse.json(
      { error: 'Failed to fetch signatures' },
      { status: 500 }
    );
  }
} 