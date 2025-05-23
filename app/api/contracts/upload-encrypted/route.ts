import { NextRequest, NextResponse } from 'next/server';
import { fromB64 } from '@mysten/sui/utils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      contractId,
      isEncrypted, 
      encryptedContent, 
      documentId,
      salt,
      signerAddresses,
      allowlistId
    } = body;
    
    console.log(`Processing pre-encrypted upload for contract: ${contractId}`);
    
    // Validate required fields
    if (!contractId || !encryptedContent || !documentId || !allowlistId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // Verify the content is actually pre-encrypted
    if (!isEncrypted) {
      return NextResponse.json(
        { error: 'Content must be pre-encrypted' },
        { status: 400 }
      );
    }
    
    console.log(`Document ID: ${documentId}`);
    console.log(`Encrypted content length: ${encryptedContent.length}`);
    
    // Decode the encrypted content
    const encryptedBytes = fromB64(encryptedContent);
    console.log(`Decoded content size: ${encryptedBytes.length} bytes`);
    
    // Forward the pre-encrypted content to the existing upload handler
    // We're leveraging the existing Python backend, but skipping the encryption step
    
    // Prepare data for standard upload handler
    const forwardData = {
      contractId,
      useSeal: true,
      isBase64: true,
      documentContent: encryptedContent, // Already encrypted content in base64
      signerAddresses,
      metadata: {
        walrus: {
          encryption: {
            method: 'seal',
            documentId,
            allowlistId,
            salt
          },
          authorizedWallets: signerAddresses
        }
      },
      // Add flag to indicate pre-encrypted content
      preEncrypted: true
    };
    
    // Forward to existing upload handler
    // NOTE: In a real implementation, we'd either:
    // 1. Call directly to the Python function if running in a shared environment
    // 2. Make an internal HTTP request to the existing endpoint
    
    // For demo purposes, we'll just mock the response that would come from the upload handler
    const mockResponse = {
      success: true,
      contractId,
      walrusData: {
        blobId: `mock-blob-${Date.now()}`,
        allowlistId,
        documentId,
        salt,
        encryptionMethod: 'seal',
        authorizedWallets: signerAddresses,
        uploadedAt: new Date().toISOString()
      },
      message: 'Pre-encrypted document processed successfully'
    };
    
    // In production, replace this with actual call to:
    // const result = await callPythonUploadHandler(forwardData);
    
    return NextResponse.json(mockResponse);
    
  } catch (error) {
    console.error('Error processing encrypted upload:', error);
    return NextResponse.json(
      { 
        error: `Failed to process encrypted upload: ${error instanceof Error ? error.message : 'Unknown error'}` 
      },
      { status: 500 }
    );
  }
}