import { NextRequest, NextResponse } from 'next/server';

// Get the site password from environment variables
// Fallback to a default for development or if not set
const SITE_PASSWORD = process.env.SITE_PASSWORD || 'eslb6ssJ[3a4&9Hg;hK%i4u2vPKI8b.J4M,T]3:|iBk}b70J<';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json(
        { message: 'Password is required' },
        { status: 400 }
      );
    }

    // Check if the password matches
    if (password === SITE_PASSWORD) {
      return NextResponse.json({ success: true }, { status: 200 });
    }

    // Password doesn't match
    return NextResponse.json(
      { message: 'Invalid password' },
      { status: 401 }
    );
  } catch (error) {
    console.error('Error verifying password:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
} 