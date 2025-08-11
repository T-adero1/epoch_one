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
      } as any);
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }
    
    log.info('Fetching user by email', { 
      email: email || '',
      requestUrl: request.url || '',
      method: request.method || ''
    } as any);
    
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        walletAddress: true,
        email: true,
        name: true,
        createdAt: true
      }
    });
    
    if (!user) {
      log.info('User not found', { email: email || '' } as any);
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }
    
    log.info('Successfully fetched user', { 
      walletAddress: user.walletAddress || '',
      email: user.email || ''
    } as any);
    
    return NextResponse.json(user);
  } catch (error) {
    log.error('Error fetching user', {
      errorMessage: error instanceof Error ? error.message : String(error),
      email: new URL(request.url).searchParams.get('email') || ''
    } as any);
    return NextResponse.json(
      { error: 'Failed to fetch user' },
      { status: 500 }
    );
  }
}

// POST /api/users - Create or update a user
export async function POST(request: Request) {
  let body: any = {};
  
  try {
    body = await request.json();
    const { email, name, walletAddress } = body;
    
    log.info('Creating/updating user', { 
      email: email || '',
      name: name || '',
      hasName: Boolean(name),
      hasWalletAddress: Boolean(walletAddress)
    } as any);
    
    if (!email || !walletAddress) {
      log.warn('Missing required fields', { 
        hasEmail: Boolean(email),
        hasWalletAddress: Boolean(walletAddress)
      } as any);
      return NextResponse.json(
        { error: 'Email and wallet address are required' },
        { status: 400 }
      );
    }
    
    // Check if user already exists by email
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });
    
    if (existingUser) {
      log.info('Updating existing user', { 
        email: email || '', 
        currentWalletAddress: existingUser.walletAddress || '',
        newWalletAddress: walletAddress || '',
        // ✅ FIX: Cast the updates object to any for logging
        updates: {
          name: name || 'unchanged',
          walletAddress: walletAddress || 'unchanged'
        }
      } as any); // ✅ FIX: Cast entire object to any
      
      // Update existing user if new data is provided
      const updatedUser = await prisma.user.update({
        where: { email },
        data: {
          ...(name && { name }),
          ...(walletAddress && { walletAddress })
        },
        select: {
          walletAddress: true,
          email: true,
          name: true,
          createdAt: true
        }
      });
      
      log.info('Successfully updated user', { 
        walletAddress: updatedUser.walletAddress || '',
        email: updatedUser.email || '',
        updatedName: Boolean(name),
        updatedWalletAddress: Boolean(walletAddress)
      } as any);
      
      return NextResponse.json(updatedUser);
    }
    
    // Create new user
    log.info('Creating new user', {
      email,
      walletAddress,
      hasName: Boolean(name)
    } as any);
    
    const newUser = await prisma.user.create({
      data: {
        email,
        name,
        walletAddress
      },
      select: {
        walletAddress: true,
        email: true,
        name: true,
        createdAt: true
      }
    });
    
    log.info('Successfully created new user', { 
      walletAddress: newUser.walletAddress || '',
      email: newUser.email || ''
    } as any);
    
    return NextResponse.json(newUser);
  } catch (error) {
    log.error('Error creating/updating user', {
      errorMessage: error instanceof Error ? error.message : String(error),
      email: body?.email || ''
    } as any);
    return NextResponse.json(
      { error: 'Failed to create/update user' },
      { status: 500 }
    );
  }
}