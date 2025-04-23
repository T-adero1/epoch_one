import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { uploadJSON } from '@/utils/walrusClient';
import { performance } from 'perf_hooks';

export async function POST(request: NextRequest) {
  const requestStartTime = performance.now();
  console.log(`[${new Date().toISOString()}] POST /api/invite/create - Starting request`);
  
  const timings = {
    total: 0,
    parseBody: 0,
    generateInvite: 0,
    uploadToWalrus: 0
  };
  
  try {
    console.log(`[${new Date().toISOString()}] POST /api/invite/create - Received invite creation request`);
    
    // Verify WALRUS_CAPACITY_ID is set
    if (!process.env.WALRUS_CAPACITY_ID) {
      console.error(`[${new Date().toISOString()}] POST /api/invite/create - ERROR: WALRUS_CAPACITY_ID is not set in environment variables`);
      return NextResponse.json(
        { error: 'Walrus storage configuration error' },
        { status: 500 }
      );
    }
    
    // Parse request body
    const parseStartTime = performance.now();
    let body;
    
    try {
      body = await request.json();
      timings.parseBody = performance.now() - parseStartTime;
      console.log(`[${new Date().toISOString()}] POST /api/invite/create - Successfully parsed request body (${timings.parseBody.toFixed(2)}ms)`);
    } catch (parseError: any) {
      timings.parseBody = performance.now() - parseStartTime;
      console.error(`[${new Date().toISOString()}] POST /api/invite/create - ERROR parsing request JSON (${timings.parseBody.toFixed(2)}ms):`, parseError);
      
      return NextResponse.json(
        { 
          error: 'Invalid request data format',
          details: parseError.message,
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      );
    }
    
    const { 
      contractId, 
      contractTitle, 
      recipientEmail, 
      recipientName, 
      expiresIn,
      message,
      isPublic 
    } = body;

    console.log(`[${new Date().toISOString()}] POST /api/invite/create - Creating invite for contract: ${contractId}, recipient: ${recipientEmail}`);
    
    // Validate required parameters
    if (!contractId) {
      console.warn(`[${new Date().toISOString()}] POST /api/invite/create - Missing contractId in invite creation request`);
      return NextResponse.json(
        { error: 'Contract ID is required' },
        { status: 400 }
      );
    }

    if (!contractTitle) {
      console.warn(`[${new Date().toISOString()}] POST /api/invite/create - Missing contractTitle in invite creation request`);
      return NextResponse.json(
        { error: 'Contract title is required' },
        { status: 400 }
      );
    }

    if (!recipientEmail) {
      console.warn(`[${new Date().toISOString()}] POST /api/invite/create - Missing recipientEmail in invite creation request`);
      return NextResponse.json(
        { error: 'Recipient email is required' },
        { status: 400 }
      );
    }

    if (!recipientName) {
      console.warn(`[${new Date().toISOString()}] POST /api/invite/create - Missing recipientName in invite creation request`);
      return NextResponse.json(
        { error: 'Recipient name is required' },
        { status: 400 }
      );
    }

    // Generate invite data
    const generateStartTime = performance.now();
    
    // Generate a unique ID for the invite
    const inviteId = uuidv4();
    console.log(`[${new Date().toISOString()}] POST /api/invite/create - Generated invite ID: ${inviteId}`);
    
    // Calculate expiration date (default: 7 days)
    const daysToExpire = expiresIn || 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + daysToExpire);
    console.log(`[${new Date().toISOString()}] POST /api/invite/create - Invite will expire on: ${expiresAt.toISOString()}`);

    // Create the invite object
    const invite = {
      id: inviteId,
      contractId,
      contractTitle,
      recipientEmail,
      recipientName,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      status: 'pending',
      message: message || null,
      isPublic: isPublic || false
    };
    
    timings.generateInvite = performance.now() - generateStartTime;
    console.log(`[${new Date().toISOString()}] POST /api/invite/create - Invite object generated (${timings.generateInvite.toFixed(2)}ms)`);

    // Store invite in Walrus storage
    console.log(`[${new Date().toISOString()}] POST /api/invite/create - Storing invite ${inviteId} in Walrus storage...`);
    
    const uploadStartTime = performance.now();
    const inviteSize = JSON.stringify(invite).length;
    console.log(`[${new Date().toISOString()}] POST /api/invite/create - Invite size: ${inviteSize} bytes`);

    const blobId = await uploadJSON(`invites/${inviteId}.json`, invite);
    timings.uploadToWalrus = performance.now() - uploadStartTime;

    console.log(`[${new Date().toISOString()}] POST /api/invite/create - Created invite ${inviteId} for contract ${contractId} sent to ${recipientEmail}. Blob ID: ${blobId} (${timings.uploadToWalrus.toFixed(2)}ms)`);

    // Generate the sign URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const signUrl = `${baseUrl}/sign/${inviteId}`;
    console.log(`[${new Date().toISOString()}] POST /api/invite/create - Generated sign URL: ${signUrl}`);

    // Calculate total request time
    timings.total = performance.now() - requestStartTime;
    console.log(`[${new Date().toISOString()}] POST /api/invite/create - Request completed successfully (${timings.total.toFixed(2)}ms)`);

    return NextResponse.json({
      success: true,
      inviteId,
      signUrl,
      blobId,
      timings
    });
  } catch (error) {
    // Calculate total request time on error
    timings.total = performance.now() - requestStartTime;
    
    console.error(`[${new Date().toISOString()}] POST /api/invite/create - ERROR creating invite (${timings.total.toFixed(2)}ms):`, error);
    
    // Provide more specific error messages for common issues
    let errorMessage = 'Failed to create invite';
    let errorDetails = '';
    
    if (error instanceof Error) {
      console.error(`[${new Date().toISOString()}] POST /api/invite/create - Error details:`, error.message);
      console.error(`[${new Date().toISOString()}] POST /api/invite/create - Error stack:`, error.stack || 'No stack trace available');
      
      errorDetails = error.message;
      
      if (error.message.includes('capacity')) {
        errorMessage = 'Walrus storage capacity issue';
      } else if (error.message.includes('network')) {
        errorMessage = 'Network error while accessing Walrus storage';
      } else if (error.message.includes('JSON')) {
        errorMessage = 'Invalid request data format';
      } else if (error.message.includes('ENOTFOUND')) {
        errorMessage = 'DNS resolution failed';
      } else if (error.message.includes('ECONNREFUSED')) {
        errorMessage = 'Connection refused';
      } else if (error.message.includes('timeout')) {
        errorMessage = 'Connection timeout';
      }
    }
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: errorDetails,
        timestamp: new Date().toISOString(),
        timings
      },
      { status: 500 }
    );
  }
} 