import { NextResponse } from 'next/server';
import { prisma } from '@/app/utils/db';
import { log } from '@/app/utils/logger';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, walletAddress, name, googleId } = body;

    log.info('Creating/updating user:', {
      email,
      walletAddress,
      hasName: !!name,
      hasGoogleId: !!googleId
    });

    // Upsert user (create if doesn't exist, update if exists)
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        walletAddress,
        name,
        googleId
      },
      create: {
        email,
        walletAddress,
        name,
        googleId
      },
    });

    log.info('User created/updated successfully:', {
      id: user.id,
      email: user.email,
      hasGoogleId: !!user.googleId
    });

    return NextResponse.json(user);
  } catch (error) {
    log.error('Failed to create/update user:', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Failed to create/update user' },
      { status: 500 }
    );
  }
} 