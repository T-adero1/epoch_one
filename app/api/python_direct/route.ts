import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';

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
    console.error('[Python Direct] Error extracting JSON from output:', error);
    throw new Error('Failed to extract JSON response from Python script output');
  }
}

// Add simple caching mechanism at the top
const uploadCache = new Map<string, any>();

export async function POST(request: NextRequest) {
  console.log('[Python Direct] POST request received');
  
  try {
    // Parse the request body
    const data = await request.json();
    const contractId = data.contractId;
    
    // Check cache first
    if (uploadCache.has(contractId)) {
      console.log(`[Python Direct] Using cached response for contract ${contractId}`);
      return NextResponse.json(uploadCache.get(contractId));
    }
    
    console.log('[Python Direct] Request data:', { 
      contractId: data.contractId,
      hasContent: !!data.contractContent,
      contentLength: data.contractContent?.length || 0
    });
    
    // Get the path to the Python script
    const rootDir = process.cwd();
    const pythonScriptPath = path.join(rootDir, 'api', 'upload_contract.py');
    
    // Check if the script exists
    if (!fs.existsSync(pythonScriptPath)) {
      console.error(`[Python Direct] Python script not found at ${pythonScriptPath}`);
      return NextResponse.json(
        { error: `Python script not found at ${pythonScriptPath}` },
        { status: 404 }
      );
    }
    
    console.log(`[Python Direct] Using Python script at: ${pythonScriptPath}`);
    
    // Create a temporary file to pass data to the Python script
    const tmpDir = os.tmpdir();
    const requestFile = path.join(tmpDir, `${randomUUID()}.json`);
    
    // Write request data to temp file
    fs.writeFileSync(requestFile, JSON.stringify(data));
    
    // List of possible Python commands
    const pythonCommands = ['python', 'python3', 'py'];
    let stdout = '';
    let stderr = '';
    let success = false;
    
    // Try each Python command until one works
    for (const cmd of pythonCommands) {
      try {
        console.log(`[Python Direct] Trying Python command: ${cmd}`);
        const fullCmd = `${cmd} "${pythonScriptPath}" "${requestFile}"`;
        console.log(`[Python Direct] Running command: ${fullCmd}`);
        
        const result = await execAsync(fullCmd);
        stdout = result.stdout;
        stderr = result.stderr;
        success = true;
        console.log(`[Python Direct] Command succeeded with ${cmd}`);
        break;
      } catch (error: any) {
        console.log(`[Python Direct] Command failed with ${cmd}: ${error.message}`);
        
        // If the error is not "command not found", use the output and stop trying
        if (!error.message.includes('command not found') && 
            !error.message.includes('not recognized') &&
            !error.message.includes('No such file or directory')) {
          stdout = error.stdout || '';
          stderr = error.stderr || '';
          console.log('[Python Direct] Using output from failed command');
          success = true;
          break;
        }
        
        // Log that we're trying the next command
        const nextCmd = pythonCommands[pythonCommands.indexOf(cmd) + 1];
        if (nextCmd) {
          console.log(`[Python Direct] Trying next command: ${nextCmd}`);
        }
      }
    }
    // Clean up temp file
    try {
      fs.unlinkSync(requestFile);
    } catch (e) {
      console.warn('[Python Direct] Could not delete temp file:', e);
    }
    
    if (!success) {
      console.error('[Python Direct] All Python commands failed');
      return NextResponse.json(
        { error: 'Failed to execute Python script: No working Python command found' },
        { status: 500 }
      );
    }
    
    console.log('[Python Direct] Python execution completed');
    console.log('[Python Direct] stdout:', stdout);
    
    if (stderr) {
      console.warn('[Python Direct] stderr:', stderr);
    }
    
    // Try to extract the response JSON from stdout
    let responseData;
    
    if (stdout.includes('RESPONSE_JSON_BEGIN')) {
      // Extract successful response
      responseData = extractJsonFromOutput(stdout, 'RESPONSE_JSON_BEGIN', 'RESPONSE_JSON_END');
      console.log('[Python Direct] Successfully extracted JSON response');
    } else if (stdout.includes('ERROR_JSON_BEGIN')) {
      // Extract error response
      const errorData = extractJsonFromOutput(stdout, 'ERROR_JSON_BEGIN', 'ERROR_JSON_END');
      console.error('[Python Direct] Python script returned an error:', errorData);
      return NextResponse.json(errorData, { status: 500 });
    } else {
      console.error('[Python Direct] Could not find response markers in Python output');
      return NextResponse.json(
        { 
          error: 'No valid response from Python script',
          output: stdout,
          stderr: stderr
        },
        { status: 500 }
      );
    }
    
    // Add successful response to cache before returning
    if (responseData) {
      uploadCache.set(contractId, responseData);
      // Limit cache size
      if (uploadCache.size > 100) {
        // Remove oldest entry
        const oldestKey = uploadCache.keys().next().value;
        uploadCache.delete(oldestKey);
      }
    }
    
    return NextResponse.json(responseData);
  } catch (error: any) {
    console.error('[Python Direct] Error processing request:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
} 