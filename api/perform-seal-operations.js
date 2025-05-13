const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs').promises; // Use promises for async file operations
const os = require('os');

// --- CRITICAL: Path Resolution ---
// Determine the correct path to the 'seal_operations.js' script
// within the Vercel deployment environment.
// Assuming 'api/upload_encrypt_download_decrypt/seal_operations.js' structure
// relative to the project root. Vercel often places the 'api' directory
// contents directly in the function's root or a similar structure.
// We'll try a relative path from this file's directory first.
const SEAL_OPERATIONS_SCRIPT_NAME = 'seal_operations.js';
const SEAL_OPERATIONS_DIR_NAME = 'upload_encrypt_download_decrypt';

// Path relative from the location of *this* file (api/perform-seal-operations.js)
// Adjust if your 'upload_encrypt_download_decrypt' dir is elsewhere relative to 'api' root
const SEAL_SCRIPT_FULL_PATH = path.resolve(__dirname, SEAL_OPERATIONS_DIR_NAME, SEAL_OPERATIONS_SCRIPT_NAME);
const SEAL_SCRIPT_CWD = path.dirname(SEAL_SCRIPT_FULL_PATH); // Directory to run the script from

// Helper function to log messages consistently
function logNodeMessage(message, data = null, isError = false) {
    const timestamp = new Date().toISOString();
    const prefix = isError ? '[ERROR]' : '[INFO]';
    console.log(`[${timestamp}] [NodeSealFunc] ${prefix} ${message}`);
    if (data) {
        try {
            console.log(JSON.stringify(data, null, 2));
        } catch (e) {
            console.log('[Log Data (non-JSON)]:', data);
        }
    }
}

// Function to execute the seal_operations.js script
async function runSealOperation(configData) {
    return new Promise(async (resolve, reject) => {
        const tempDir = os.tmpdir();
        const tempConfigFilename = `seal_config_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.json`;
        const tempConfigPath = path.join(tempDir, tempConfigFilename);
        let configWritten = false;

        try {
            // IMPORTANT: Do not create a separate PDF file
            // INSTEAD, just pass the document content in base64 format directly
            
            // If configData has base64 content already, use it
            if (configData.documentContentBase64) {
                logNodeMessage(`Using base64 document content directly (${configData.documentContentBase64.length} chars), skipping file creation`);
                // For security, don't log the actual base64 content, just its length
                
                // Verify it's valid base64
                try {
                    const decodedLength = Buffer.from(configData.documentContentBase64, 'base64').length;
                    logNodeMessage(`Verified base64 content decodes to ${decodedLength} bytes`);
                } catch (e) {
                    logNodeMessage(`WARNING: Invalid base64 content provided`, {error: e.message}, true);
                }
            }
            // If documentPath is provided in the config but no base64 content, warn about it
            else if (configData.documentPath) {
                logNodeMessage(`WARNING: Document path provided, but might not be accessible: ${configData.documentPath}`, null, true);
                logNodeMessage(`This will likely fail in production environment - provide base64 content instead`, null, true);
            }
            
            // 2. Write config data to temporary file
            await fs.writeFile(tempConfigPath, JSON.stringify(configData, null, 2));
            configWritten = true;
            logNodeMessage(`Temp config file created: ${tempConfigPath}`);
            
            // 3. Execute the script
            const commandArgs = [SEAL_SCRIPT_FULL_PATH, tempConfigPath];
            logNodeMessage(`Executing command: node ${commandArgs.join(' ')}`, { cwd: SEAL_SCRIPT_CWD });

            const execOptions = {
                cwd: SEAL_SCRIPT_CWD, // Set working directory
                timeout: 50000, // 50 seconds timeout for the script execution
                encoding: 'utf-8' // Ensure output is treated as UTF-8 string
            };

            execFile('node', commandArgs, execOptions, async (error, stdout, stderr) => {
                // 4. Clean up temp file (regardless of success/failure)
                 if (configWritten) {
                    try {
                        await fs.unlink(tempConfigPath);
                        logNodeMessage(`Temp config file deleted: ${tempConfigPath}`);
                    } catch (unlinkError) {
                        logNodeMessage(`Error deleting temp config file ${tempConfigPath}`, { error: unlinkError.message }, true);
                        // Continue despite unlink error
                    }
                }

                // 5. Handle script execution result
                if (error) {
                    logNodeMessage(`Error executing seal_operations.js`, { code: error.code, signal: error.signal, message: error.message }, true);
                    if (stderr) {
                        logNodeMessage(`Stderr from script:`, stderr, true);
                    }
                     // Reject with structured error
                    return reject({ status: 500, message: `Script execution failed: ${error.message}`, stderr: stderr || '' });
                }

                if (stderr) { // Log stderr even on success (as warnings)
                    logNodeMessage(`Stderr from seal_operations.js (potential warnings):`, stderr);
                }

                // 6. Parse stdout (assuming it's JSON)
                try {
                    logNodeMessage(`Raw stdout from script (first 500 chars):`, stdout.substring(0, 500));
                    const result = JSON.parse(stdout);
                    logNodeMessage('seal_operations.js executed successfully, parsed JSON result.');
                    resolve(result); // Resolve the promise with the parsed JSON
                } catch (parseError) {
                    logNodeMessage(`Failed to parse JSON from seal_operations.js stdout`, { error: parseError.message }, true);
                    logNodeMessage(`Raw stdout was:`, stdout);
                    // Reject with structured error
                    reject({ status: 500, message: `Failed to parse script output: ${parseError.message}`, stdout: stdout });
                }
            }); // End execFile callback

        } catch (err) { // Catch errors from fs operations or other async issues before execFile
             logNodeMessage('Error before or during script execution setup', { error: err.message }, true);
             // Ensure cleanup if config was written before failure
             if (configWritten) {
                try {
                    await fs.unlink(tempConfigPath);
                    logNodeMessage(`Temp config file deleted after setup error: ${tempConfigPath}`);
                } catch (unlinkError) {
                     logNodeMessage(`Error deleting temp config file ${tempConfigPath} after setup error`, { error: unlinkError.message }, true);
                }
             }
            reject({ status: 500, message: `Setup error: ${err.message}` });
        }
    }); // End Promise
}

// --- Vercel Serverless Function Handler ---
export default async function handler(req, res) {
    logNodeMessage(`Request received`, { method: req.method, url: req.url });

    // --- CHECK METHOD ---
    if (req.method !== 'POST') {
        logNodeMessage(`Method ${req.method} not allowed.`, null, true);
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` }); // Respond with JSON
    }

    try {
        // --- PARSE BODY ---
        // Vercel automatically parses JSON body for JS functions if content-type is correct
        const configData = req.body.configData; // Assuming Python sends { "configData": ... }

        if (!configData) {
            logNodeMessage('Missing configData in request body.', req.body, true);
            return res.status(400).json({ error: 'Missing configData in request body' });
        }

        logNodeMessage('configData received, initiating runSealOperation.');
        // logNodeMessage('configData sample:', JSON.stringify(configData).substring(0, 200)); // Log sample

        // --- EXECUTE LOGIC ---
        const result = await runSealOperation(configData);

        logNodeMessage('runSealOperation successful, sending 200 response.');
        return res.status(200).json(result); // Send the result back

    } catch (error) {
        logNodeMessage('Error processing request in handler', error, true);
        // Use status from structured error if available, otherwise default to 500
        const status = error.status || 500;
        const errorResponse = {
            error: 'Failed to perform SEAL operation',
            details: typeof error === 'object' && error !== null ? error.message : String(error),
            // Include stderr/stdout from error object if present
            ...(error.stderr && { stderr: error.stderr }),
            ...(error.stdout && { stdout: error.stdout }),
        };
        return res.status(status).json(errorResponse);
    }
}
