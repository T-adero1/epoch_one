import { NextResponse } from 'next/server';
import { prisma } from '@/app/utils/db';
import { log } from '@/app/utils/logger';

// GET /api/users - Get a user by email
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    
    if (!email) {
      log.warn('Missing email parameter for GET user', {
        url: request.url || '',
        method: request.method || ''
      });
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }
    
    log.info('Fetching user by email', { 
      email: email || '',
      requestUrl: request.url || '',
      method: request.method || ''
    });
    
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        walletAddress: true,
        googleId: true,
        createdAt: true
      }
    });
    
    if (!user) {
      log.info('User not found', { email: email || '' });
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }
    
    log.info('Successfully fetched user', { 
      userId: user.id || '',
      hasWalletAddress: Boolean(user.walletAddress),
      hasGoogleId: Boolean(user.googleId)
    });
    
    return NextResponse.json(user);
  } catch (error) {
    log.error('Error fetching user', {
      errorMessage: error instanceof Error ? error.message : String(error),
      email: new URL(request.url).searchParams.get('email') || ''
    });
    return NextResponse.json(
      { error: 'Failed to fetch user' },
      { status: 500 }
    );
  }
}

// POST /api/users - Create or update a user
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, name, walletAddress, googleId } = body;
    
    log.info('Creating/updating user', { 
      email: email || '',
      name: name || '',
      hasName: Boolean(name),
      hasWalletAddress: Boolean(walletAddress),
      hasGoogleId: Boolean(googleId)
    });
    
    if (!email) {
      log.warn('Missing required field', { 
        missingField: 'email' 
      });
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }
    
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });
    
    if (existingUser) {
      log.info('Updating existing user', { 
        email: email || '', 
        userId: existingUser.id || '',
        updates: {
          name: name || undefined,
          walletAddress: walletAddress || undefined,
          googleId: googleId || undefined
        }
      });
      
      // Update existing user if new data is provided
      const updatedUser = await prisma.user.update({
        where: { email },
        data: {
          ...(name && { name }),
          ...(walletAddress && { walletAddress }),
          ...(googleId && { googleId })
        },
        select: {
          id: true,
          email: true,
          name: true,
          walletAddress: true,
          googleId: true,
          createdAt: true,
          updatedAt: true
        }
      });
      
      log.info('Successfully updated user', { 
        userId: updatedUser.id || '',
        email: updatedUser.email || '',
        updatedName: Boolean(name),
        updatedWalletAddress: Boolean(walletAddress),
        updatedGoogleId: Boolean(googleId)
      });
      
      return NextResponse.json(updatedUser);
    }
    
    // Create new user
    log.info('Creating new user', {
      email,
      hasName: Boolean(name),
      hasWalletAddress: Boolean(walletAddress),
      hasGoogleId: Boolean(googleId)
    });
    
    const newUser = await prisma.user.create({
      data: {
        email,
        name,
        walletAddress: walletAddress || `placeholder-${Date.now()}`,
        googleId
      },
      select: {
        id: true,
        email: true,
        name: true,
        walletAddress: true,
        googleId: true,
        createdAt: true,
        updatedAt: true
      }
    });
    
    log.info('Successfully created new user', { 
      userId: newUser.id || '',
      email: newUser.email || ''
    });
    
    return NextResponse.json(newUser);
  } catch (error) {
    log.error('Error creating/updating user', {
      errorMessage: error instanceof Error ? error.message : String(error),
      email: body?.email || ''
    });
    return NextResponse.json(
      { error: 'Failed to create/update user' },
      { status: 500 }
    );
  }
} 