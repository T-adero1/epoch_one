import { NextResponse } from 'next/server';
import { prisma } from '@/app/utils/db';

// Define types for contract metadata and signature with user
interface ContractMetadata {
  signers?: string[];
  [key: string]: unknown;
}

interface SignatureWithUser {
  id: string;
  userGoogleIdHash: string; // Updated to match current schema
  contractId: string;
  walletAddress: string;
  signature: string | null;
  status: string;
  signedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  email: string | null;
}

// POST /api/signatures - Add a signature to a contract
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      contractId, 
      userEmail, 
      walletAddress, 
      signature,
      zkLoginData  // NEW: zkLogin signature data
    } = body;

    if (!contractId || !userEmail || !walletAddress || !signature) {
      return NextResponse.json(
        { error: 'Contract ID, user email, wallet address, and signature are required' },
        { status: 400 }
      );
    }

    // Find contract
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        signatures: true
      }
    });

    if (!contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    // Parse metadata and check if user is allowed to sign (in signers list)
    const metadata = contract.metadata as ContractMetadata;
    const signers = metadata?.signers || [];
    
    // Allow signing if user is a designated signer
    const isInSignersList = signers.some(signer => 
      signer.toLowerCase() === userEmail.toLowerCase()
    );
    
    if (!isInSignersList) {
      return NextResponse.json(
        { error: 'User not authorized to sign this contract' },
        { status: 403 }
      );
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: {
        email: true,
        name: true,
        walletAddress: true,
        createdAt: true
      }
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: userEmail,
          walletAddress: walletAddress
        },
        select: {
          email: true,
          name: true,
          walletAddress: true,
          createdAt: true
        }
      });
    }

    // Check if user already signed - using userGoogleIdHash instead of userId
    const { hashGoogleId } = await import('@/app/utils/privacy');
    const userGoogleIdHash = await hashGoogleId(`email_${userEmail}`);
    
    const existingSignature = await prisma.signature.findFirst({
      where: {
        contractId,
        userGoogleIdHash: userGoogleIdHash
      }
    });

    if (existingSignature) {
      return NextResponse.json(
        { error: 'User has already signed this contract' },
        { status: 400 }
      );
    }

    // Create signature with userGoogleIdHash instead of userId
    const newSignature = await prisma.signature.create({
      data: {
        contractId,
        userGoogleIdHash,
        walletAddress,
        signature,
        zkLoginData,  // NEW: Store zkLogin signatures
        status: 'SIGNED',
        signedAt: new Date(),
        email: userEmail,
      }
    });

    // Update contract status if needed
    const allSignatures = [...contract.signatures, newSignature] as SignatureWithUser[];
    
    const allSignersSigned = signers.every(signer => 
      allSignatures.some(sig => 
        sig.email?.toLowerCase() === signer.toLowerCase() && 
        sig.status === 'SIGNED'
      )
    );

    if (allSignersSigned && contract.status !== 'COMPLETED') {
      await prisma.contract.update({
        where: { id: contractId },
        data: {
          status: 'COMPLETED',
        },
      });
    } else if (contract.status === 'DRAFT') {
      await prisma.contract.update({
        where: { id: contractId },
        data: { status: 'PENDING' },
      });
    }

    return NextResponse.json(newSignature);
  } catch (error) {
    console.error('Error creating signature:', error);
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
      return NextResponse.json({ error: 'Contract ID required' }, { status: 400 });
    }
    
    const signatures = await prisma.signature.findMany({
      where: { contractId }
    });
    
    return NextResponse.json({ signatures });
  } catch (error) {
    console.error('Error fetching signatures:', error);
    return NextResponse.json(
      { error: 'Failed to fetch signatures' },
      { status: 500 }
    );
  }
} 