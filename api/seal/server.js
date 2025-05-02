const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync, exec } = require('child_process');

// Modern imports for Sui SDK and Seal
const { SuiClient } = require('@mysten/sui/client');
const { Ed25519Keypair } = require('@mysten/sui/keypairs/ed25519');
const { Transaction } = require('@mysten/sui/transactions');
const { fromHEX, toHex } = require('@mysten/sui/utils');
const { bcs } = require('@mysten/sui/bcs');
const { SealClient, SessionKey, getAllowlistedKeyServers } = require('@mysten/seal');
const { suiPrivkeyToKeypair } = require('./sui_key_utils');

console.log('Sui SDK and Seal modules loaded successfully');

// Create Express app
const app = express();
const port = 3000;

// Configure middleware
app.use(bodyParser.json());
app.use(express.static(__dirname)); // Serve static files from current directory

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Ensure uploads directory exists
if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
  fs.mkdirSync(path.join(__dirname, 'uploads'));
}

// Configuration
const NETWORK = 'testnet';
const RPC_URL = 'https://fullnode.testnet.sui.io:443';

// Add debug endpoint to check imports and SDK versions
app.get('/api/debug-sdk', (req, res) => {
  const packageJson = require('./package.json');
  
  res.json({
    sdkVersions: {
      suiJs: packageJson.dependencies['@mysten/sui.js'],
      seal: packageJson.dependencies['@mysten/seal']
    },
    imports: {
      Transaction: typeof Transaction,
      TransactionBlock: typeof TransactionBlock,
      JsonRpcProvider: typeof JsonRpcProvider,
      Ed25519Keypair: typeof Ed25519Keypair,
      fromHEX: typeof fromHEX,
      toHex: typeof toHex
    }
  });
});

// Test wallet keys
app.post('/api/test-keys', async (req, res) => {
  try {
    const { adminKey, userKey } = req.body;
    
    // Validate admin key
    let adminAddress = '';
    try {
      const adminKeypair = suiPrivkeyToKeypair(adminKey);
      adminAddress = adminKeypair.getPublicKey().toSuiAddress();
      console.log('Admin address derived:', adminAddress);
    } catch (error) {
      return res.json({ 
        success: false, 
        error: `Invalid admin key: ${error.message}` 
      });
    }
    
    // Validate user key
    let userAddress = '';
    try {
      const userKeypair = suiPrivkeyToKeypair(userKey);
      userAddress = userKeypair.getPublicKey().toSuiAddress();
      console.log('User address derived:', userAddress);
    } catch (error) {
      return res.json({ 
        success: false, 
        error: `Invalid user key: ${error.message}` 
      });
    }
    
    return res.json({
      success: true,
      adminAddress,
      userAddress
    });
  } catch (error) {
    return res.json({
      success: false,
      error: error.message
    });
  }
});

// Connect wallet
app.post('/api/connect-wallet', (req, res) => {
  try {
    const { address } = req.body;
    
    if (!address) {
      return res.json({
        success: false,
        error: 'Missing wallet address'
      });
    }
    
    // Validate the address format
    if (!address.startsWith('0x') || address.length < 42) {
      return res.json({
        success: false,
        error: 'Invalid wallet address format'
      });
    }
    
    console.log('Wallet connected:', address);
    
    return res.json({
      success: true,
      address
    });
  } catch (error) {
    return res.json({
      success: false,
      error: error.message
    });
  }
});

// Create document group with wallet
app.post('/api/create-document-group', async (req, res) => {
  console.log('Received create-document-group request:', req.body);
  try {
    const { address, groupName, dbId } = req.body;
    
    if (!address || !groupName || !dbId) {
      return res.json({
        success: false,
        error: 'Missing required parameters'
      });
    }
    
    // Initialize SUI client
    console.log('Initializing SUI client with URL:', RPC_URL);
    const suiClient = new SuiClient({ url: RPC_URL });
    
    // Create transaction using TransactionBlock
    console.log('Creating transaction...');
    try {
      const packageId = req.body.packageId || process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID;
      console.log('Using package ID:', packageId);
      
      // Create a transaction
      const tx = new Transaction();
      
      // Set the sender
      tx.setSender(address);
      
      // Add the document group creation call using the entry function
      tx.moveCall({
        target: `${packageId}::document_sharing::create_document_group_entry`,
        arguments: [
          tx.pure.string(groupName),
          tx.pure.string(dbId)
        ]
      });
      
      // Set gas budget (important to avoid automatically determining budget issues)
      tx.setGasBudget(10000000);
      
      // Build the transaction
      const txBytes = await tx.build({ client: suiClient });
      
      // For real wallet implementation: return the transaction bytes for the wallet to sign
      return res.json({
        success: true,
        requiresSignature: true,
        txBytes: Buffer.from(txBytes).toString('base64')
      });
    } catch (error) {
      console.error('Transaction creation failed:', error);
      return res.json({
        success: false,
        error: `Transaction creation failed: ${error.message}`
      });
    }
  } catch (error) {
    console.error('Error creating document group:', error);
    return res.json({
      success: false,
      error: error.message
    });
  }
});

// Encrypt and upload document
app.post('/api/encrypt-upload', upload.single('file'), async (req, res) => {
  try {
    console.log('Received encrypt-upload request:', req.body);
    
    if (!req.file) {
      return res.json({
        success: false,
        error: 'No file uploaded'
      });
    }
    
    const { documentGroupId, dbDocumentId, address, packageId } = req.body;
    
    if (!documentGroupId || !dbDocumentId || !address) {
      return res.json({
        success: false,
        error: 'Missing required parameters'
      });
    }
    
    // Read the file
    const fileData = fs.readFileSync(req.file.path);
    console.log(`File loaded, size: ${fileData.length} bytes`);
    
    // Initialize SUI client
    const suiClient = new SuiClient({ url: RPC_URL });
    
    // Get the allowlisted key servers
    const keyServerIds = await getAllowlistedKeyServers(NETWORK);
    
    // Initialize SEAL client
    const client = new SealClient({
      suiClient,
      serverObjectIds: keyServerIds,
      verifyKeyServers: false
    });
    
    // Create a random nonce
    const nonce = crypto.randomBytes(5);
    
    // Convert document group ID to bytes and combine with database ID
    const documentGroupBytes = fromHEX(documentGroupId);
    const dbIdBytes = Buffer.from(dbDocumentId);
    
    // Combine into a single ID
    const fullIdBytes = new Uint8Array([...documentGroupBytes, ...dbIdBytes, ...nonce]);
    
    // Convert the ID to a hex string
    const documentIdHex = toHex(fullIdBytes);
    
    console.log('- Document Group ID:', documentGroupId);
    console.log('- Database ID:', dbDocumentId);
    console.log('- Document ID (hex):', documentIdHex);
    
    // Encrypt the document
    console.log('Encrypting document...');
    const { encryptedObject: encryptedBytes } = await client.encrypt({
      threshold: 2,
      packageId: packageId || process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID,
      id: documentIdHex,
      data: fileData,
    });
    
    // Save encrypted data to a temporary file
    const encryptedFilePath = path.join(__dirname, 'uploads', `encrypted_${Date.now()}.bin`);
    fs.writeFileSync(encryptedFilePath, Buffer.from(encryptedBytes));
    
    // Upload to Walrus
    const pythonScript = path.join(__dirname, '../walrus_sdk_manager.py');
    const uploadCommand = `python ${pythonScript} --context testnet upload "${encryptedFilePath}" --epochs 2 --deletable`;
    
    try {
      console.log('Uploading to Walrus...');
      console.log('Command:', uploadCommand);
      
      const output = execSync(uploadCommand).toString();
      console.log('Walrus upload output:', output);
      
      // Extract blob ID from the output
      const blobIdMatch = output.match(/Blob ID: ([a-zA-Z0-9_-]+)/);
      if (!blobIdMatch) {
        return res.json({
          success: false,
          error: 'Could not extract blob ID from upload output'
        });
      }
      
      const blobId = blobIdMatch[1];
      console.log('Extracted Blob ID:', blobId);
      
      // Cleanup original file
      fs.unlinkSync(req.file.path);
      
      return res.json({
        success: true,
        blobId,
        documentIdHex,
        encryptedFilePath
      });
    } catch (error) {
      console.error('Walrus upload failed:', error);
      return res.json({
        success: false,
        error: `Walrus upload failed: ${error.message}`
      });
    }
  } catch (error) {
    console.error('Error in encrypt-upload:', error);
    return res.json({
      success: false,
      error: error.message
        });
      }
});

// Download and decrypt document
app.post('/api/download-decrypt', async (req, res) => {
  try {
    console.log('Received download-decrypt request:', req.body);
    
    const { blobId, documentIdHex, address, documentGroupId, packageId } = req.body;
    
    if (!blobId || !documentIdHex || !address || !documentGroupId) {
      return res.json({
        success: false,
        error: 'Missing required parameters'
      });
    }
    
    // Download from Walrus
    const pythonScript = path.join(__dirname, '../walrus_sdk_manager.py');
    const downloadPath = path.join(__dirname, 'uploads', `downloaded_${Date.now()}.bin`);
    const downloadCommand = `python ${pythonScript} --context testnet download ${blobId} "${downloadPath}"`;
    
    try {
      console.log('Downloading from Walrus...');
      console.log('Command:', downloadCommand);
      
      const output = execSync(downloadCommand).toString();
      console.log('Walrus download output:', output);
      
      // Read the downloaded encrypted data
      console.log('Reading encrypted data from:', downloadPath);
      const encryptedBytes = fs.readFileSync(downloadPath);
      console.log('Read encrypted data, size:', encryptedBytes.length, 'bytes');
      
      // Initialize SUI client
      const suiClient = new SuiClient({ url: RPC_URL });
      
      // Get the allowlisted key servers
      const keyServerIds = await getAllowlistedKeyServers(NETWORK);
      
      // Initialize SEAL client
      const client = new SealClient({
        suiClient,
        serverObjectIds: keyServerIds,
        verifyKeyServers: false
      });
      
      // Create a transaction block for approval
      console.log('Creating approval transaction for document');
      const documentId = fromHEX(documentIdHex);
      const tx = new Transaction();
      tx.setSender(address);
      
      // Add the approval move call
      tx.moveCall({
        target: `${packageId || process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID}::document_sharing::seal_approve`,
        arguments: [
          tx.pure.string(documentId),
          tx.object(documentGroupId)
        ]
      });
      
      // Set gas budget for the transaction
      tx.setGasBudget(10000000);
      
      // Build the transaction
      const txBytes = await tx.build({ client: suiClient });
      
      // Return transaction details for the client to sign
      // This will be used in a separate wallet signing step
      return res.json({
        success: true,
        needsSignature: true,
        encryptedFilePath: downloadPath,
        txBytes: Buffer.from(txBytes).toString('base64')
      });
    } catch (error) {
      console.error('Walrus download failed:', error);
      return res.json({
        success: false,
        error: `Walrus download failed: ${error.message}`
      });
    }
  } catch (error) {
    console.error('Error in download-decrypt:', error);
    return res.json({
      success: false,
      error: error.message
    });
  }
});

// Complete decryption after signature
app.post('/api/complete-decryption', async (req, res) => {
  try {
    console.log('Received complete-decryption request:', req.body);
    
    const { encryptedFilePath, txBytes, signature, packageId, address, documentIdHex } = req.body;
      
    if (!encryptedFilePath || !txBytes || !signature || !address || !documentIdHex) {
        return res.json({
          success: false,
        error: 'Missing required parameters'
      });
    }
    
    console.log('Reading encrypted file:', encryptedFilePath);
    const encryptedBytes = fs.readFileSync(encryptedFilePath);
    
    // Initialize SUI client
    const suiClient = new SuiClient({ url: RPC_URL });
    
    // Get the allowlisted key servers
    console.log('Getting allowlisted key servers...');
    const keyServerIds = await getAllowlistedKeyServers(NETWORK);
    
    // Initialize SEAL client
    const client = new SealClient({
      suiClient,
      serverObjectIds: keyServerIds,
      verifyKeyServers: false
    });
    
    // Create a session key
    console.log('Creating session key for:', address);
    const sessionKey = new SessionKey({
      address: address,
      packageId: packageId || process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID,
      ttlMin: 10
    });
    
    // Set the signature on the session key
    console.log('Setting signature on session key...');
    await sessionKey.setPersonalMessageSignature(
      Buffer.from(signature, 'base64')
    );
    
    // Convert txBytes from base64 back to buffer
    const txBytesBuffer = Buffer.from(txBytes, 'base64');

    try {
      // Fetch keys from key servers
      console.log('Fetching keys from key servers...');
      await client.fetchKeys({
        ids: [fromHEX(documentIdHex)],
        txBytes: txBytesBuffer,
        sessionKey,
        threshold: 2
      });
      
      // Decrypt the document
      console.log('Decrypting document...');
      const decryptedData = await client.decrypt({
        data: new Uint8Array(encryptedBytes),
        sessionKey,
        txBytes: txBytesBuffer,
      });
      
      console.log('Decryption successful, size:', decryptedData.length, 'bytes');
      
      // Determine file type (simple detection)
      let fileType = 'application/octet-stream';
      if (decryptedData.length > 4) {
        const header = decryptedData.slice(0, 4);
        
        if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) {
          fileType = 'image/png';
        } else if (header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF) {
          fileType = 'image/jpeg';
        } else if (header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46) {
          fileType = 'application/pdf';
        }
      }
      
      // Convert to base64 for response
      const base64Data = Buffer.from(decryptedData).toString('base64');
      
      // Clean up encrypted file
      try {
        fs.unlinkSync(encryptedFilePath);
        console.log('Cleaned up encrypted file:', encryptedFilePath);
      } catch (cleanupErr) {
        console.warn('Warning: Could not clean up encrypted file:', cleanupErr.message);
      }
      
      return res.json({
        success: true,
        fileContent: base64Data,
        fileType,
        message: 'File decrypted successfully'
      });
    } catch (error) {
      console.error('Decryption process failed:', error);
      return res.json({
        success: false,
        error: `Decryption failed: ${error.message}`
      });
    }
  } catch (error) {
    console.error('Error in complete-decryption:', error);
    return res.json({
      success: false,
      error: error.message
    });
  }
});

// Add user to document group
app.post('/api/add-user', async (req, res) => {
  try {
    const { adminKey, documentGroupId, adminCapId, userAddress } = req.body;
    
    if (!adminKey || !documentGroupId || !adminCapId || !userAddress) {
      return res.json({
        success: false,
        error: 'Missing required parameters'
      });
    }
    
    // Initialize admin keypair
    let adminKeypair;
    try {
      adminKeypair = suiPrivkeyToKeypair(adminKey);
      const adminAddress = adminKeypair.getPublicKey().toSuiAddress();
      console.log('Admin address derived:', adminAddress);
    } catch (error) {
      console.error('Keypair initialization failed:', error);
      return res.json({
        success: false,
        error: `Invalid admin key: ${error.message}`
      });
    }
    
    // Initialize SUI client
    const suiClient = new SuiClient({ url: RPC_URL });
    
    // Create transaction to add user
    const tx = new Transaction();
    const packageId = req.body.packageId || process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID;
    
    tx.moveCall({
      target: `${packageId}::document_sharing::add_user_entry`,
      arguments: [
        tx.object(documentGroupId),
        tx.object(adminCapId),
        tx.pure.address(userAddress)
      ]
    });
    
    // Set gas budget
    tx.setGasBudget(10000000);
    
    // Execute transaction
    try {
      // Build the transaction
      const txBytes = await tx.build({ client: suiClient });
      
      // Sign the transaction
      const signature = await adminKeypair.signTransactionBlock(txBytes);
      
      // Execute the transaction
      const result = await suiClient.executeTransactionBlock({
        transactionBlock: txBytes,
        signature,
        options: { showEffects: true }
      });
      
      if (result.effects.status.status !== 'success') {
        return res.json({
          success: false,
          error: `Transaction failed: ${result.effects.status.error}`
        });
      }
      
      return res.json({
        success: true,
        message: `User ${userAddress} added successfully`
      });
    } catch (error) {
      console.error('Transaction operation failed:', error);
      return res.json({
        success: false,
        error: `Transaction error: ${error.message}`
      });
    }
  } catch (error) {
    console.error('Unhandled error in add-user:', error);
    return res.json({
      success: false,
      error: error.message
    });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`- Open http://localhost:${port}/index.html in your browser to access the UI`);
});