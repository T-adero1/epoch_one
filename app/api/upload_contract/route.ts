import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import crypto from 'crypto';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import os from 'os';
import { randomUUID } from 'crypto';

// Convert exec to promise-based
const execAsync = promisify(exec);

// Helper functions for Walrus integration
function getPublisherEndpoint(network: string): string {
  if (network === 'mainnet') {
    return 'https://publisher.walrus-mainnet.walrus.space';
  } else {
    // Use most reliable testnet endpoints
    return 'https://publisher.walrus-testnet.walrus.space';
  }
}

/**
 * Fetch wallet addresses for contract signers
 */
async function fetchWalletAddresses(contractId: string, signerEmails?: string[]): Promise<string[]> {
  console.log(`[API Route] Fetching wallet addresses for contract ${contractId}`);
  
  try {
    // If no signer emails provided, fetch from contract
    if (!signerEmails || signerEmails.length === 0) {
      // Get the app URL from environment or use localhost
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
      const contractUrl = `${appUrl}/api/contracts/${contractId}`;
      console.log(`[API Route] Fetching contract details from ${contractUrl}`);
      
      const contractResponse = await fetch(contractUrl);
      if (!contractResponse.ok) {
        console.error(`[API Route] Error fetching contract: ${contractResponse.status}`);
        return [];
      }
      
      const contractData = await contractResponse.json();
      signerEmails = contractData?.metadata?.signers || [];
      console.log(`[API Route] Found signer emails:`, signerEmails);
    }
    
    if (!signerEmails || signerEmails.length === 0) {
      console.log("[API Route] No signer emails found");
      return [];
    }
    
    // Fetch wallet addresses for each signer
    const walletAddresses: string[] = [];
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    
    for (const email of signerEmails) {
      const userUrl = `${appUrl}/api/users?email=${encodeURIComponent(email)}`;
      console.log(`[API Route] Fetching user details for ${email} from ${userUrl}`);
      
      try {
        const userResponse = await fetch(userUrl);
        if (!userResponse.ok) {
          console.error(`[API Route] Error fetching user ${email}: ${userResponse.status}`);
          continue;
        }
        
        const userData = await userResponse.json();
        const walletAddress = userData.walletAddress;
        
        if (walletAddress) {
          console.log(`[API Route] Found wallet address for ${email}: ${walletAddress}`);
          walletAddresses.push(walletAddress);
        } else {
          console.log(`[API Route] No wallet address found for ${email}`);
        }
      } catch (error) {
        console.error(`[API Route] Error fetching user data for ${email}:`, error);
      }
    }
    
    console.log(`[API Route] Returning ${walletAddresses.length} wallet addresses`);
    return walletAddresses;
  } catch (error) {
    console.error(`[API Route] Error fetching wallet addresses:`, error);
    return [];
  }
}

/**
 * Upload a document directly to Walrus using HTTP API (no Python)
 */
async function uploadToWalrusDirectly(content: Buffer, options: { epochs?: number; deletable?: boolean } = {}): Promise<string> {
  console.log('[API Route] Starting direct HTTP upload to Walrus');
  const epochs = options.epochs || 2;
  const deletable = options.deletable || false;
  
  console.log(`[API Route] - Content size: ${content.length} bytes`);
  console.log(`[API Route] - Epochs: ${epochs}`);
  console.log(`[API Route] - Deletable: ${deletable}`);
  
  // Calculate content hash for verification
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  console.log(`[API Route] - Content SHA-256 hash: ${hash}`);
  
  // Determine the correct Walrus endpoint based on network
  const network = process.env.NETWORK || 'testnet';
  const publisherUrl = getPublisherEndpoint(network);
  
  const uploadUrl = `${publisherUrl}/v1/blobs`;
  console.log(`[API Route] - Target URL: ${uploadUrl}`);
  
  try {
    // Prepare request parameters
    const params = {
      epochs: epochs,
      deletable: deletable ? 'true' : 'false'
    };
    
    const headers = {
      'Content-Type': 'application/octet-stream'
    };
    
    console.log(`[API Route] - Starting HTTP PUT request to ${uploadUrl}`);
    
    const startTime = Date.now();
    const response = await axios.put(uploadUrl, content, { 
      params,
      headers,
      responseType: 'json'
    });
    
    const requestDuration = (Date.now() - startTime) / 1000;
    console.log(`[API Route] - PUT request completed in ${requestDuration.toFixed(2)} seconds`);
    console.log(`[API Route] - Response status: ${response.status}`);
    
    if (response.status !== 200) {
      throw new Error(`Upload failed with status: ${response.status}`);
    }
    
    // Extract blob ID from the response
    const responseData = response.data;
    let blobId = null;
    
    if (responseData.alreadyCertified) {
      blobId = responseData.alreadyCertified.blobId;
      console.log(`[API Route] - Blob was already certified with ID: ${blobId}`);
    } else if (responseData.newlyCreated && responseData.newlyCreated.blobObject) {
      blobId = responseData.newlyCreated.blobObject.blobId;
      console.log(`[API Route] - New blob created with ID: ${blobId}`);
      console.log(`[API Route] - Blob size: ${responseData.newlyCreated.blobObject.size} bytes`);
    }
    
    if (!blobId) {
      throw new Error(`Could not extract blob ID from response: ${JSON.stringify(responseData)}`);
    }
    
    console.log(`[API Route] - SUCCESS! Document uploaded with blob ID: ${blobId}`);
    
    return blobId;
  } catch (error: any) {
    console.error(`[API Route] - ERROR DURING UPLOAD: ${error.message}`);
    if (error.response) {
      console.error(`[API Route] - Response data:`, error.response.data);
      console.error(`[API Route] - Response status: ${error.response.status}`);
    }
    throw error;
  }
}

/**
 * Process the upload request using SEAL encryption
 */
export async function POST(request: NextRequest) {
  console.log('[API Route] POST /api/upload_contract - Request received');
  
  try {
    // Parse the request body
    const data = await request.json();
    console.log('[API Route] Request data:', { 
      contractId: data.contractId,
      hasContent: !!data.contractContent,
      contentLength: data.contractContent?.length || 0,
      isBase64: data.isBase64
    });
    
    // Validate required fields
    if (!data.contractId || !data.contractContent) {
      return NextResponse.json(
        { error: 'Missing required fields: contractId, contractContent' },
        { status: 400 }
      );
    }
    
    // Decode the content if it's base64 encoded
    let contentBuffer: Buffer;
    if (data.isBase64) {
      try {
        contentBuffer = Buffer.from(data.contractContent, 'base64');
      } catch (error) {
        return NextResponse.json(
          { error: 'Invalid base64 content' },
          { status: 400 }
        );
      }
    } else if (typeof data.contractContent === 'string') {
      contentBuffer = Buffer.from(data.contractContent);
    } else {
      contentBuffer = data.contractContent;
    }
    
    // Calculate document hash
    const hash = crypto.createHash('sha256').update(contentBuffer).digest('hex');
    console.log(`[API Route] Document hash (SHA-256): ${hash}`);
    
    // SEAL encryption is required - no fallback
    console.log("[API Route] SEAL encryption is required - no fallback to standard upload");
    
    // Get signer addresses
    let signerAddresses = data.signerAddresses || [];
    
    // If no signer addresses are provided, fetch them from the database
    if (signerAddresses.length === 0) {
      console.log("[API Route] No signer addresses provided, fetching from database");
      // If metadata.signers is provided in the data, use it to fetch wallet addresses
      const signerEmails = data.metadata?.signers || [];
      if (signerEmails.length > 0) {
        console.log(`[API Route] Using provided signer emails:`, signerEmails);
        signerAddresses = await fetchWalletAddresses(data.contractId, signerEmails);
      } else {
        // Otherwise, try to fetch from existing contract
        console.log(`[API Route] Fetching signers for contract: ${data.contractId}`);
        signerAddresses = await fetchWalletAddresses(data.contractId);
      }
    }
    
    // Require signer addresses for SEAL encryption
    if (signerAddresses.length === 0) {
      console.error("[API Route] SEAL encryption requires signer addresses, but none were found");
      return NextResponse.json(
        { 
          error: 'SEAL encryption requires signer addresses', 
          details: 'No wallet addresses found for signers. Ensure users have wallet addresses configured.' 
        },
        { status: 400 }
      );
    }
    
    console.log(`[API Route] Using SEAL encryption for document with ${signerAddresses.length} signer addresses`);
    
    // Prepare SEAL configuration
    const sealConfig = {
      contractId: data.contractId,
      // Pass the document content directly as base64
      documentContentBase64: contentBuffer.toString('base64'),
      signerAddresses: signerAddresses,
      // Environment variables
      adminPrivateKey: process.env.ADMIN_PRIVATE_KEY || "admin_key_placeholder",
      sealPackageId: process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID || "seal_package_id",
      allowlistPackageId: process.env.NEXT_PUBLIC_ALLOWLIST_PACKAGE_ID,
      network: process.env.NETWORK || "testnet"
    };
    
    console.log('[API Route] Created SEAL configuration:', {
      contractId: sealConfig.contractId,
      documentContentLength: sealConfig.documentContentBase64.length,
      signerCount: sealConfig.signerAddresses.length,
      network: sealConfig.network
    });
    
    // Call our consolidated SEAL API that bundles all dependencies
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    const sealApiUrl = `${appUrl}/api/seal-operations-api`;
    
    console.log(`[API Route] Calling SEAL operations API at ${sealApiUrl}`);
    
    try {
      // Use absolute URL for more reliable API calls in serverless environment
      const response = await axios.post(sealApiUrl, sealConfig, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 60000 // 60 second timeout
      });
      
      console.log('[API Route] SEAL API call completed with status:', response.status);
      
      const result = response.data;
      
      if (!result.success) {
        console.error('[API Route] SEAL operation failed:', result.error);
          return NextResponse.json(
          { 
            error: 'SEAL Encryption Failed', 
            details: result.error,
            stack: result.stack 
          },
            { status: 500 }
          );
        }
        
      // Prepare final result (extract required data for response)
      const responseData = {
        success: result.success,
        contractId: result.contractId,
        encrypted: true,
        blobId: result.blobId,
        allowlistId: result.allowlistId,
        documentId: result.documentIdHex,
        capId: result.capId,
        hash: result.fileHash,
        // Include walrus data in the expected format
        walrusData: {
          blobId: result.blobId,
          allowlistId: result.allowlistId,
          documentId: result.documentIdHex,
          capId: result.capId,
          encryptionMethod: 'seal',
          authorizedWallets: result.signerAddresses || []
        }
      };
      
      console.log('[API Route] Returning successful response');
      return NextResponse.json(responseData);
      
    } catch (apiError: any) {
      console.error('[API Route] Error calling SEAL API:', apiError.message);
      
      if (apiError.response) {
        console.error('[API Route] SEAL API response status:', apiError.response.status);
        console.error('[API Route] SEAL API response data:', apiError.response.data);
        
        return NextResponse.json(
          { 
            error: 'SEAL API Error', 
            details: apiError.response.data?.error || apiError.message,
            stack: apiError.response.data?.stack
          },
          { status: 500 }
        );
      }
      
      return NextResponse.json(
        { 
          error: 'SEAL API Error', 
          details: apiError.message
        },
        { status: 500 }
      );
    }
    
  } catch (error: any) {
    console.error('[API Route] Error processing request:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
} 