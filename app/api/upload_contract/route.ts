import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import os from 'os';

// Convert exec to promise-based
const execAsync = promisify(exec);

// Function to extract JSON from stdout that's delimited by markers
function extractJsonFromOutput(output: string, startMarker: string, endMarker: string): any {
  try {
    const startIndex = output.indexOf(startMarker);
    const endIndex = output.indexOf(endMarker);
    
    if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
      throw new Error(`Could not find JSON markers in output: ${startMarker}...${endMarker}`);
    }
    
    const jsonString = output.substring(startIndex + startMarker.length, endIndex).trim();
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('[API Route] Error extracting JSON from output:', error);
    throw new Error('Failed to extract JSON response from Python script output');
  }
}

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
    
    // In production (Vercel), we would just proxy to the serverless Python function
    // But in development, we need to call it directly
    if (process.env.NODE_ENV === 'development') {
      console.log('[API Route] Development environment detected, calling Python script directly');
      
      // Create a temporary file to pass the request data
      const tmpDir = os.tmpdir();
      const requestFile = path.join(tmpDir, `${randomUUID()}.json`);
      
      // Write request data to temp file
      fs.writeFileSync(requestFile, JSON.stringify(data));
      
      // Get the path to the Python script
      const pythonScriptPath = path.join(process.cwd(), 'api', 'upload_contract.py');
      console.log('[API Route] Python script path:', pythonScriptPath);
      
      try {
        // Using the Python interpreter to run the script with our request data
        const pythonCmd = `python "${pythonScriptPath}" "${requestFile}"`;
        console.log('[API Route] Executing command:', pythonCmd);
        
        const { stdout, stderr } = await execAsync(pythonCmd);
        console.log('[API Route] Python script output:');
        console.log(stdout);
        
        if (stderr) {
          console.error('[API Route] Python script stderr:', stderr);
        }
        
        // Try to extract the response JSON from stdout
        let responseData;
        
        if (stdout.includes('RESPONSE_JSON_BEGIN')) {
          // Extract successful response
          responseData = extractJsonFromOutput(stdout, 'RESPONSE_JSON_BEGIN', 'RESPONSE_JSON_END');
          console.log('[API Route] Successfully extracted JSON response from stdout');
        } else if (stdout.includes('ERROR_JSON_BEGIN')) {
          // Extract error response
          const errorData = extractJsonFromOutput(stdout, 'ERROR_JSON_BEGIN', 'ERROR_JSON_END');
          console.error('[API Route] Python script returned an error:', errorData);
          return NextResponse.json(errorData, { status: 500 });
        } else {
          console.error('[API Route] Could not find response markers in Python output');
          return NextResponse.json(
            { error: 'No valid response from Python script' },
            { status: 500 }
          );
        }
        
        // Extract and log key details from the Walrus response
        if (responseData) {
          const walrusResponse = responseData.walrusResponse;
          console.log('[API Route] Document hash:', responseData.hash);
          
          if (walrusResponse) {
            try {
              // Log blob details
              console.log('[API Route] 🔍 Walrus response analysis:');
              
              if (walrusResponse.alreadyCertified) {
                const blobId = walrusResponse.alreadyCertified.blobId;
                console.log('[API Route] ✓ Document already on Walrus: Blob ID:', blobId);
              } else if (walrusResponse.newlyCreated && walrusResponse.newlyCreated.blobObject) {
                const blobObject = walrusResponse.newlyCreated.blobObject;
                console.log('[API Route] ✓ Document uploaded to Walrus successfully:');
                console.log('[API Route]   Blob ID:', blobObject.blobId);
                console.log('[API Route]   Size:', blobObject.size, 'bytes');
                console.log('[API Route]   Created at:', blobObject.creationTime);
                
                if (blobObject.url) {
                  console.log('[API Route]   URL:', blobObject.url);
                }
              }
              
              console.log('[API Route] 🎉 Contract securely stored on blockchain');
            } catch (parseError) {
              console.log('[API Route] Error parsing Walrus response:', parseError);
              console.log('[API Route] Raw Walrus response:', JSON.stringify(walrusResponse, null, 2));
            }
          }
        }
        
        // Clean up temp request file
        fs.unlinkSync(requestFile);
        
        return NextResponse.json(responseData);
      } catch (execError: any) {
        console.error('[API Route] Error executing Python script:', execError);
        
        // Clean up temp request file if it exists
        if (fs.existsSync(requestFile)) {
          fs.unlinkSync(requestFile);
        }
        
        return NextResponse.json(
          { 
            error: 'Failed to execute Python script',
            details: execError.message,
            stdout: execError.stdout,
            stderr: execError.stderr
          },
          { status: 500 }
        );
      }
    } else {
      // For production environments, the request will automatically be routed
      // to the serverless Python function by Vercel
      console.log('[API Route] Production environment, proxying to serverless function');
      return NextResponse.json({ 
        error: 'Direct execution in production is not supported',
        message: 'Request should be automatically routed to serverless function' 
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error('[API Route] Error processing request:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
} 