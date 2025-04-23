/**
 * This API route is not used in the simplified zkLogin demo.
 * These API calls can be ignored as the dashboard no longer fetches contracts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { auth } from '@/../auth';
import { listBlobs, fetchJSON, uploadJSON } from '@/utils/walrusClient';
import { performance } from 'perf_hooks';

// Utility to add timing information to diagnostics
function withTiming<T>(fn: () => Promise<T>, description: string, diagnostics: any): Promise<T> {
  const startTime = performance.now();
  diagnostics.steps.push(`${description} - Started at ${new Date().toISOString()}`);
  
  return fn().then(result => {
    const elapsed = performance.now() - startTime;
    diagnostics.steps.push(`${description} - Completed in ${elapsed.toFixed(2)}ms`);
    return result;
  }).catch(error => {
    const elapsed = performance.now() - startTime;
    diagnostics.errors.push(`${description} - Failed after ${elapsed.toFixed(2)}ms: ${error.message}`);
    throw error;
  });
}

export async function GET(): Promise<Response> {
  const requestStartTime = performance.now();
  console.log(`[${new Date().toISOString()}] GET /api/contracts - Starting request`);
  
  const diagnostics = {
    environment: process.env.NODE_ENV || 'unknown',
    isVercel: process.env.VERCEL === '1' ? 'Yes' : 'No',
    timestamp: new Date().toISOString(),
    walrusCapacity: process.env.WALRUS_CAPACITY_ID ? 'Set' : 'Not set',
    walrusAggregator: process.env.WALRUS_AGGREGATOR || 'Default',
    appUrl: process.env.NEXT_PUBLIC_APP_URL || 'Not set',
    headers: {} as Record<string, string>,
    envVars: {} as Record<string, string>,
    edgeRuntime: process.env.EDGE_RUNTIME || 'Not detected',
    region: process.env.VERCEL_REGION || 'Unknown',
    steps: [] as string[],
    errors: [] as string[],
    blobCount: 0,
    processedCount: 0,
    errorMessage: '',
    errorName: '',
    errorStack: '',
    errorDetails: null as any,
    timings: {
      total: 0,
      auth: 0,
      listBlobs: 0,
      fetchBlobs: 0,
    }
  };
  
  // Collect important environment variables (safely)
  Object.keys(process.env).forEach(key => {
    if (key.startsWith('NEXT_') || key.startsWith('VERCEL_') || key.startsWith('WALRUS_')) {
      diagnostics.envVars[key] = typeof process.env[key] === 'string' 
        ? (process.env[key] as string).substring(0, 5) + '...' 
        : 'undefined';
    }
  });
  
  try {
    // Authenticate user
    const authStartTime = performance.now();
    diagnostics.steps.push('Authenticating user');
    
    const { token } = await auth();
    
    diagnostics.timings.auth = performance.now() - authStartTime;
    diagnostics.steps.push(`Authentication completed in ${diagnostics.timings.auth.toFixed(2)}ms`);
    
    if (!token) {
      console.log(`[${new Date().toISOString()}] GET /api/contracts - Authentication failed: No token`);
      return Response.json(
        { 
          error: "Authentication required", 
          message: "You must be logged in to access this resource",
          diagnostics
        }, 
        { status: 401 }
      );
    }
    
    diagnostics.headers['Authorization'] = token ? 'Present' : 'Missing';
    
    if (!process.env.WALRUS_CAPACITY_ID) {
      console.log(`[${new Date().toISOString()}] GET /api/contracts - Missing WALRUS_CAPACITY_ID environment variable`);
      return Response.json(
        { 
          error: "Server configuration error", 
          message: "Storage credentials are not properly configured",
          diagnostics
        }, 
        { status: 500 }
      );
    }
    
    diagnostics.steps.push(`API: Starting GET contracts request at ${new Date().toISOString()}`);
    
    // Check environment variables
    diagnostics.envVars = {
      WALRUS_CAPACITY_ID: process.env.WALRUS_CAPACITY_ID ? 'Set' : 'Not set',
      WALRUS_AGGREGATOR: process.env.WALRUS_AGGREGATOR ? 'Set' : 'Not set', 
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ? 'Set' : 'Not set'
    };
    diagnostics.steps.push('Checked environment variables');
    
    // Verify WALRUS_CAPACITY_ID is set
    if (!process.env.WALRUS_CAPACITY_ID) {
      const errorMsg = 'CRITICAL ERROR: WALRUS_CAPACITY_ID is not set in environment variables';
      diagnostics.errors.push(errorMsg);
      return NextResponse.json(
        { 
          error: 'Walrus storage configuration error', 
          details: 'Missing WALRUS_CAPACITY_ID environment variable',
          environment: process.env.NODE_ENV,
          diagnostics
        },
        { status: 500 }
      );
    }
    
    diagnostics.steps.push('Starting blob listing operation with prefix "contracts/"');
    
    // List all contract blobs from Walrus storage
    try {
      const listBlobsStartTime = performance.now();
      diagnostics.steps.push('Calling listBlobs() method on Walrus');
      
      const blobs = await listBlobs('contracts/');
      
      diagnostics.timings.listBlobs = performance.now() - listBlobsStartTime;
      diagnostics.steps.push(`Found ${blobs.length} contracts in Walrus storage (${diagnostics.timings.listBlobs.toFixed(2)}ms)`);
      diagnostics.blobCount = blobs.length;
      
      // If no contracts found, return empty array
      if (blobs.length === 0) {
        diagnostics.steps.push('No contracts found, returning empty array');
        diagnostics.timings.total = performance.now() - requestStartTime;
        
        console.log(`[${new Date().toISOString()}] GET /api/contracts - No contracts found, returning empty array (${diagnostics.timings.total.toFixed(2)}ms)`);
        
        return new NextResponse(JSON.stringify({ 
          data: [],
          diagnostics 
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
      }
      
      // Fetch each contract's data
      diagnostics.steps.push('Fetching contract data for each blob...');
      const fetchStartTime = performance.now();
      
      const contractPromises = blobs.map(async (blob: any, index: number) => {
        try {
          const itemStartTime = performance.now();
          diagnostics.steps.push(`Fetching contract ${index+1}/${blobs.length}: ${blob.path}`);
          
          const data = await fetchJSON(blob.id);
          
          const itemElapsed = performance.now() - itemStartTime;
          diagnostics.steps.push(`Successfully fetched contract ${blob.path} (${itemElapsed.toFixed(2)}ms)`);
          return data;
        } catch (fetchError: unknown) {
          const errorMsg = `Error fetching contract ${blob.path}: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`;
          diagnostics.errors.push(errorMsg);
          return null;
        }
      });
      
      // Wait for all contract data to be fetched
      diagnostics.steps.push('Waiting for all contract data to be fetched...');
      const contracts = (await Promise.all(contractPromises)).filter(Boolean);
      
      diagnostics.timings.fetchBlobs = performance.now() - fetchStartTime;
      diagnostics.steps.push(`Successfully processed ${contracts.length} out of ${blobs.length} contracts (${diagnostics.timings.fetchBlobs.toFixed(2)}ms)`);
      diagnostics.processedCount = contracts.length;
      
      // Calculate total request time
      diagnostics.timings.total = performance.now() - requestStartTime;
      
      console.log(`[${new Date().toISOString()}] GET /api/contracts - Request completed successfully, returning ${contracts.length} contracts (${diagnostics.timings.total.toFixed(2)}ms)`);
      
      return new NextResponse(JSON.stringify({
        data: contracts,
        diagnostics
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
    } catch (listError: unknown) {
      const errorMsg = `Error listing blobs: ${listError instanceof Error ? listError.message : String(listError)}`;
      diagnostics.errors.push(errorMsg);
      
      // Include error details in diagnostics
      diagnostics.errorDetails = {
        name: listError instanceof Error ? listError.name : 'UnknownError',
        message: listError instanceof Error ? listError.message : String(listError),
        stack: listError instanceof Error ? listError.stack : undefined
      };
      
      throw listError; // Re-throw to be caught by outer catch block
    }
  } catch (error: unknown) {
    const errorTime = performance.now() - requestStartTime;
    console.error(`[${new Date().toISOString()}] GET /api/contracts - Error after ${errorTime.toFixed(2)}ms:`, error);
    
    // Add error details to diagnostics
    if (error instanceof Error) {
      diagnostics.errorMessage = error.message;
      diagnostics.errorName = error.name;
      diagnostics.errorStack = error.stack || '';
    } else {
      diagnostics.errorDetails = String(error);
    }
    
    // Calculate total request time
    diagnostics.timings.total = performance.now() - requestStartTime;
    
    return NextResponse.json(
      { 
        error: "Failed to fetch contracts", 
        message: error instanceof Error ? error.message : String(error),
        diagnostics
      }, 
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const requestStartTime = performance.now();
  console.log(`[${new Date().toISOString()}] POST /api/contracts - Starting request`);
  
  const timings = {
    total: 0,
    parseBody: 0,
    uploadToWalrus: 0
  };
  
  try {
    console.log(`[${new Date().toISOString()}] POST /api/contracts - Received contract creation request`);
    console.log(`[${new Date().toISOString()}] POST /api/contracts - Environment check: NODE_ENV =`, process.env.NODE_ENV);
    
    // Log the presence of environment variables (without exposing values)
    console.log(`[${new Date().toISOString()}] POST /api/contracts - Environment variables check:`);
    console.log(`[${new Date().toISOString()}] POST /api/contracts - - WALRUS_CAPACITY_ID present:`, !!process.env.WALRUS_CAPACITY_ID);
    console.log(`[${new Date().toISOString()}] POST /api/contracts - - WALRUS_AGGREGATOR present:`, !!process.env.WALRUS_AGGREGATOR);
    console.log(`[${new Date().toISOString()}] POST /api/contracts - - NEXT_PUBLIC_APP_URL present:`, !!process.env.NEXT_PUBLIC_APP_URL);
    
    // Verify WALRUS_CAPACITY_ID is set
    if (!process.env.WALRUS_CAPACITY_ID) {
      console.error(`[${new Date().toISOString()}] POST /api/contracts - CRITICAL ERROR: WALRUS_CAPACITY_ID is not set in environment variables`);
      return NextResponse.json(
        { 
          error: 'Walrus storage configuration error',
          details: 'Missing WALRUS_CAPACITY_ID environment variable',
          environment: process.env.NODE_ENV
        },
        { status: 500 }
      );
    }
    
    // Parse request body
    console.log(`[${new Date().toISOString()}] POST /api/contracts - Parsing request body...`);
    
    let body;
    const parseStartTime = performance.now();
    
    try {
      body = await request.json();
      timings.parseBody = performance.now() - parseStartTime;
      
      console.log(`[${new Date().toISOString()}] POST /api/contracts - Successfully parsed request body (${timings.parseBody.toFixed(2)}ms)`);
    } catch (parseError: any) {
      timings.parseBody = performance.now() - parseStartTime;
      
      console.error(`[${new Date().toISOString()}] POST /api/contracts - Error parsing request JSON (${timings.parseBody.toFixed(2)}ms):`, parseError);
      console.error(`[${new Date().toISOString()}] POST /api/contracts - Parse error details:`, parseError.message);
      console.error(`[${new Date().toISOString()}] POST /api/contracts - Parse error stack:`, parseError.stack || 'No stack trace available');
      
      return NextResponse.json(
        { 
          error: 'Invalid request data format',
          details: parseError.message,
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      );
    }
    
    const { title, content, status, creatorAddress } = body;
    
    console.log(`[${new Date().toISOString()}] POST /api/contracts - Contract request data:`, { 
      title, 
      contentProvided: !!content,
      status,
      creatorAddressProvided: !!creatorAddress
    });
    
    // Validate required fields
    if (!title) {
      console.warn(`[${new Date().toISOString()}] POST /api/contracts - Missing required field: title`);
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      );
    }
    
    // For content, allow empty string but not undefined/null
    if (content === undefined || content === null) {
      console.warn(`[${new Date().toISOString()}] POST /api/contracts - Missing required field: content`);
      return NextResponse.json(
        { error: 'Content is required' },
        { status: 400 }
      );
    }
    
    // Generate unique ID for the contract
    const id = nanoid();
    console.log(`[${new Date().toISOString()}] POST /api/contracts - Generated contract ID: ${id}`);
    const now = new Date().toISOString();
    
    // Create contract object
    const contract = {
      id,
      title,
      content,
      status: status || 'draft',
      creatorAddress: creatorAddress || null,
      createdAt: now,
      updatedAt: now
    };
    
    console.log(`[${new Date().toISOString()}] POST /api/contracts - Storing contract ${id} in Walrus storage...`);
    
    // Store the contract in Walrus storage
    try {
      const uploadStartTime = performance.now();
      const contractSize = JSON.stringify(contract).length;
      
      console.log(`[${new Date().toISOString()}] POST /api/contracts - Contract ${id} size: ${contractSize} bytes`);
      
      const blobId = await uploadJSON(`contracts/${id}.json`, contract);
      
      timings.uploadToWalrus = performance.now() - uploadStartTime;
      timings.total = performance.now() - requestStartTime;
      
      console.log(`[${new Date().toISOString()}] POST /api/contracts - Contract ${id} created successfully with blob ID: ${blobId} (${timings.uploadToWalrus.toFixed(2)}ms)`);
      console.log(`[${new Date().toISOString()}] POST /api/contracts - Total request time: ${timings.total.toFixed(2)}ms`);
      
      return NextResponse.json({
        success: true,
        message: 'Contract created successfully',
        contract,
        blobId,
        timings
      });
    } catch (putError: any) {
      console.error(`[${new Date().toISOString()}] POST /api/contracts - Error storing contract in Walrus storage:`, putError);
      console.error(`[${new Date().toISOString()}] POST /api/contracts - Error details:`, putError.message);
      console.error(`[${new Date().toISOString()}] POST /api/contracts - Error stack:`, putError.stack || 'No stack trace available');
      
      throw putError; // Re-throw to be caught by outer catch block
    }
  } catch (error: any) {
    timings.total = performance.now() - requestStartTime;
    
    console.error(`[${new Date().toISOString()}] POST /api/contracts - Error creating contract (${timings.total.toFixed(2)}ms):`, error);
    console.error(`[${new Date().toISOString()}] POST /api/contracts - Full error object:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
    
    // Provide more specific error messages for common issues
    let errorMessage = 'Failed to create contract';
    let errorDetails = '';
    
    if (error instanceof Error) {
      console.error(`[${new Date().toISOString()}] POST /api/contracts - Error name:`, error.name);
      console.error(`[${new Date().toISOString()}] POST /api/contracts - Error message:`, error.message);
      console.error(`[${new Date().toISOString()}] POST /api/contracts - Error stack:`, error.stack || 'No stack trace available');
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
        environment: process.env.NODE_ENV,
        timings
      },
      { status: 500 }
    );
  }
} 