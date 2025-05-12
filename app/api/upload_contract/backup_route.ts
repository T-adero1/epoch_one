// This file has been renamed to backup_route.ts to avoid conflicts with the direct Python route
// Keep this file for reference purposes only
// The actual API endpoint is served directly from api/upload_contract.py

import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import os from 'os';

// Convert exec to promise-based
const execAsync = promisify(exec);

// Function to try different Python commands until one works
async function runPythonScript(scriptPath: string, dataPath: string): Promise<{stdout: string, stderr: string}> {
  // Different Python commands to try in order of preference
  const pythonCommands = ['python3', 'python', 'py'];
  
  let lastError: any = null;
  
  console.log(`[API Route] Attempting to run Python script: ${scriptPath}`);
  console.log(`[API Route] With data file: ${dataPath}`);
  console.log(`[API Route] Data file exists:`, fs.existsSync(dataPath));
  
  // Log Python version if possible
  try {
    const versionResult = await execAsync('python --version');
    console.log(`[API Route] Python version check: ${versionResult.stdout.trim()}`);
  } catch (err: any) {
    console.log(`[API Route] Could not determine Python version: ${err.message}`);
  }
  
  // Try each command in sequence
  for (const cmd of pythonCommands) {
    try {
      console.log(`[API Route] Trying Python command: ${cmd}`);
      const fullCmd = `${cmd} "${scriptPath}" "${dataPath}"`;
      console.log(`[API Route] Full command: ${fullCmd}`);
      
      const result = await execAsync(fullCmd);
      console.log(`[API Route] Command succeeded: ${cmd}`);
      return result;
    } catch (error: any) {
      console.log(`[API Route] Command failed: ${cmd} - ${error.message}`);
      
      if (error.stdout) {
        console.log(`[API Route] Command stdout: ${error.stdout}`);
      }
      
      if (error.stderr) {
        console.log(`[API Route] Command stderr: ${error.stderr}`);
      }
      
      lastError = error;
      
      // If the error is not "command not found", don't try other commands
      if (!error.message.includes('command not found') && 
          !error.message.includes('not recognized') &&
          !error.message.includes('No such file or directory')) {
        throw error;
      }
    }
  }
  
  // If we get here, all commands failed
  throw lastError || new Error('All Python commands failed');
}

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
  console.log('[API Route] Request URL:', request.url);
  console.log('[API Route] Request method:', request.method);
  console.log('[API Route] Request headers:', Object.fromEntries([...request.headers.entries()]));
  
  try {
    // Parse the request body
    const data = await request.json();
    console.log('[API Route] Request data:', { 
      contractId: data.contractId,
      hasContent: !!data.contractContent,
      contentLength: data.contractContent?.length || 0,
      isBase64: data.isBase64
    });
    
    // Log node environment
    console.log('[API Route] Node environment:', process.env.NODE_ENV);
    console.log('[API Route] Current working directory (cwd):', process.cwd());
    
    // Check what files exist in the current directory
    try {
      const rootFiles = fs.readdirSync(process.cwd());
      console.log('[API Route] Root directory files:', rootFiles);
      
      if (rootFiles.includes('api')) {
        const apiFiles = fs.readdirSync(path.join(process.cwd(), 'api'));
        console.log('[API Route] API directory files:', apiFiles);
      }
    } catch (fsError) {
      console.error('[API Route] Error reading directory:', fsError);
    }
    
    // Check for Python existence on the system
    try {
      const pythonVersionCheck = await execAsync('python --version');
      console.log('[API Route] Python version:', pythonVersionCheck.stdout.trim());
    } catch (pythonError: any) {
      console.error('[API Route] Python version check failed:', pythonError.message);
    }
    
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
      console.log('[API Route] Checking if Python script exists:', fs.existsSync(pythonScriptPath));

      // Also try alternative paths
      const alternativePaths = [
        path.join(process.cwd(), 'api', 'upload_contract.py'),
        path.join(process.cwd(), '../api', 'upload_contract.py'),
        path.join(process.cwd(), '../../api', 'upload_contract.py'),
        path.join(process.cwd(), 'api/upload_contract.py')
      ];

      for (const altPath of alternativePaths) {
        const exists = fs.existsSync(altPath);
        console.log(`[API Route] Alternative path check ${altPath}: ${exists ? 'EXISTS' : 'MISSING'}`);
      }

      // Log the current working directory for debugging
      console.log('[API Route] Current working directory:', process.cwd());
      console.log('[API Route] Directory contents:', fs.readdirSync(process.cwd()));
      
      // Try to find the correct script path
      let actualScriptPath = pythonScriptPath;
      if (!fs.existsSync(actualScriptPath)) {
        // Try to locate the script in the alternative paths
        for (const altPath of alternativePaths) {
          if (fs.existsSync(altPath)) {
            console.log(`[API Route] Found Python script at alternative path: ${altPath}`);
            actualScriptPath = altPath;
            break;
          }
        }

        // If still not found, try a more exhaustive search
        if (!fs.existsSync(actualScriptPath)) {
          console.log('[API Route] Script not found in common locations, attempting broader search...');
          
          // Check if /api is a directory in the current working directory
          const apiDir = path.join(process.cwd(), 'api');
          if (fs.existsSync(apiDir) && fs.statSync(apiDir).isDirectory()) {
            console.log('[API Route] Found /api directory, checking its contents');
            const apiFiles = fs.readdirSync(apiDir);
            console.log('[API Route] API directory contents:', apiFiles);
            
            if (apiFiles.includes('upload_contract.py')) {
              actualScriptPath = path.join(apiDir, 'upload_contract.py');
              console.log(`[API Route] Found script in API directory: ${actualScriptPath}`);
            }
          }
        }
      }

      // Final check and warning
      if (!fs.existsSync(actualScriptPath)) {
        console.error(`[API Route] ⚠️ CRITICAL: Python script not found at ${actualScriptPath}`);
        throw new Error(`Python script not found at ${actualScriptPath}`);
      } else {
        console.log(`[API Route] ✅ Using Python script at: ${actualScriptPath}`);
      }

      try {
        // Using the Python interpreter to run the script with our request data
        const { stdout, stderr } = await runPythonScript(actualScriptPath, requestFile);
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