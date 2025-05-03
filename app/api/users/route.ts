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
        url: request.url,
        parameters: Object.fromEntries(searchParams.entries())
      });
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }
    
    log.info('Fetching user by email', { 
      email,
      requestUrl: request.url,
      method: request.method
    });
    
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        walletAddress: true,
        createdAt: true
      }
    });
    
    if (!user) {
      log.info('User not found', { email });
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }
    
    log.info('Successfully fetched user', { 
      email, 
      userId: user.id,
      hasWalletAddress: !!user.walletAddress
    });
    
    return NextResponse.json(user);
  } catch (error) {
    log.error('Error fetching user', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      email: new URL(request.url).searchParams.get('email')
    });
    return NextResponse.json(
      { error: 'Failed to fetch user' },
      { status: 500 }
    );
  }
}

// POST /api/users - Create a new user
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, name, walletAddress } = body;
    
    log.info('Creating new user', { 
      email, 
      hasName: !!name,
      hasWalletAddress: !!walletAddress 
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
      log.info('User already exists', { 
        email, 
        userId: existingUser.id 
      });
      
      // Update existing user if new data is provided
      if (name || walletAddress) {
        const updatedUser = await prisma.user.update({
          where: { email },
          data: {
            ...(name && { name }),
            ...(walletAddress && { walletAddress })
          }
        });
        
        log.info('Updated existing user', { 
          userId: updatedUser.id,
          email: updatedUser.email,
          fieldsUpdated: {
            name: !!name,
            walletAddress: !!walletAddress
          }
        });
        
        return NextResponse.json(updatedUser);
      }
      
      return NextResponse.json(existingUser);
    }
    
    // Create new user
    const newUser = await prisma.user.create({
      data: {
        email,
        name,
        walletAddress
      }
    });
    
    log.info('User created successfully', { 
      userId: newUser.id,
      email: newUser.email
    });
    
    return NextResponse.json(newUser);
  } catch (error) {
    log.error('Error creating user', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    );
  }
} 