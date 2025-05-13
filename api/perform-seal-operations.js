const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs').promises; // For async file operations if needed
const os = require('os');

// IMPORTANT: Adjust this path to correctly locate seal_operations.js
// In Vercel, relative paths from the current JS file are usually reliable
// If seal_operations.js is in a subdirectory like 'upload_encrypt_download_decrypt'
// relative to the 'api' directory, this needs to be accurate.
// Example: If 'api/upload_encrypt_download_decrypt/seal_operations.js'
const SEAL_OPERATIONS_SCRIPT_DIR = path.resolve(__dirname, 'upload_encrypt_download_decrypt'); // Assuming it's a sibling dir
const SEAL_OPERATIONS_SCRIPT_PATH = path.join(SEAL_OPERATIONS_SCRIPT_DIR, 'seal_operations.js');

async function runSealOperation(configData) {
    return new Promise(async (resolve, reject) => {
        // The Node.js script `seal_operations.js` expects a config file path.
        // We'll create a temporary file with the configData.
        const tempDir = os.tmpdir();
        const tempConfigPath = path.join(tempDir, `seal_config_${Date.now()}.json`);

        try {
            await fs.writeFile(tempConfigPath, JSON.stringify(configData));
            console.log(`[NodeSealFunc] Temp config file created at: ${tempConfigPath}`);

            const commandArgs = [SEAL_OPERATIONS_SCRIPT_PATH, tempConfigPath];
            console.log(`[NodeSealFunc] Executing: node ${commandArgs.join(' ')}`);
            
            // Ensure SEAL_OPERATIONS_SCRIPT_DIR is correct if the script uses relative paths
            const execOptions = {
                cwd: SEAL_OPERATIONS_SCRIPT_DIR, // Or path.dirname(SEAL_OPERATIONS_SCRIPT_PATH)
                timeout: 50000, // 50 seconds, less than Vercel's max for Node.js functions
            };

            execFile('node', commandArgs, execOptions, async (error, stdout, stderr) => {
                // Clean up temp file
                try {
                    await fs.unlink(tempConfigPath);
                    console.log(`[NodeSealFunc] Temp config file ${tempConfigPath} deleted.`);
                } catch (unlinkError) {
                    console.error(`[NodeSealFunc] Error deleting temp config file ${tempConfigPath}:`, unlinkError);
                }

                if (error) {
                    console.error(`[NodeSealFunc] Error executing seal_operations.js: ${error.message}`);
                    if (stderr) {
                        console.error(`[NodeSealFunc] Stderr: ${stderr}`);
                    }
                    // Reject with an object that includes status and message
                    return reject({ status: 500, message: `Script execution failed: ${error.message}`, stderr: stderr || '' });
                }
                if (stderr) { // Log stderr even on success, as it might contain warnings
                    console.warn(`[NodeSealFunc] Stderr from seal_operations.js: ${stderr}`);
                }
                
                try {
                    // Assuming seal_operations.js prints JSON to stdout
                    const result = JSON.parse(stdout);
                    console.log('[NodeSealFunc] seal_operations.js executed successfully.');
                    resolve(result);
                } catch (parseError) {
                    console.error(`[NodeSealFunc] Failed to parse JSON from seal_operations.js stdout: ${parseError.message}`);
                    console.error(`[NodeSealFunc] Raw stdout: ${stdout}`);
                    reject({ status: 500, message: `Failed to parse script output: ${parseError.message}`, stdout });
                }
            });
        } catch (fileError) {
            console.error(`[NodeSealFunc] Error writing temp config file: ${fileError.message}`);
            reject({ status: 500, message: `File system error: ${fileError.message}` });
        }
    });
}

export default async function handler(req, res) {
    if (req.method === 'POST') {
        try {
            console.log('[NodeSealFunc] Received POST request.');
            const { configData } = req.body;

            if (!configData) {
                console.log('[NodeSealFunc] Missing configData in request body.');
                return res.status(400).json({ error: 'Missing configData in request body' });
            }
            
            console.log('[NodeSealFunc] configData received, type:', typeof configData);
            // console.log('[NodeSealFunc] configData (first 100 chars if string):', typeof configData === 'string' ? configData.substring(0,100) : JSON.stringify(configData).substring(0,100));


            const result = await runSealOperation(configData);
            console.log('[NodeSealFunc] Sending success response.');
            res.status(200).json(result);
        } catch (error) {
            console.error('[NodeSealFunc] Error in handler:', error);
            const status = error.status || 500;
            // Ensure error is an object before sending
            const errorResponse = typeof error === 'object' && error !== null ? error : { message: String(error) };
            res.status(status).json({ error: 'Failed to perform SEAL operation', details: errorResponse.message || String(error), stderr: errorResponse.stderr, stdout: errorResponse.stdout });
        }
    } else {
        console.log(`[NodeSealFunc] Method ${req.method} not allowed.`);
        res.setHeader('Allow', ['POST']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }
}
