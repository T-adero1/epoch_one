import { NextResponse } from 'next/server';
import { encryptDocument } from '@/app/utils/sealEncryption';
import { log } from '@/app/utils/logger';
import { prisma } from '@/app/utils/db';

export async function POST(request: Request) {
  const requestStartTime = performance.now();
  try {
    log.info('Received SEAL encryption request');
    const data = await request.json();
    
    // Extract data from request
    const { contractId, documentContent, isBase64 = false } = data;
    
    log.info('Processing encryption request', { 
      contractId,
      contentTypeReceived: typeof documentContent,
      contentLength: typeof documentContent === 'string' ? documentContent.length : 'non-string',
      isBase64,
    });
    
    // Validate required fields
    if (!contractId || !documentContent) {
      return NextResponse.json(
        { error: 'Missing required fields: contractId and documentContent are required' },
        { status: 400 }
      );
    }
    
    log.info('Starting SEAL encryption for contract', { contractId });
    
    // Fetch signer addresses from the database
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        signatures: {
          include: {
            user: true
          }
        }
      }
    });
    
    if (!contract) {
      log.error('Contract not found', { contractId });
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }
    
    // Extract signer emails from contract metadata
    const signerEmails = contract.metadata?.signers || [];
    
    // Find wallet addresses for these signers
    const signers = await prisma.user.findMany({
      where: {
        email: {
          in: signerEmails.map((email: string) => email.toLowerCase())
        }
      },
      select: {
        email: true,
        walletAddress: true
      }
    });
    
    const signerAddresses = signers
      .filter(signer => signer.walletAddress)
      .map(signer => signer.walletAddress);
    
    if (signerAddresses.length === 0) {
      log.warn('No wallet addresses found for contract signers', { 
        contractId, 
        signerEmails
      });
      
      // Return unencrypted content since we can't encrypt without addresses
      return NextResponse.json({
        encrypted: false,
        message: 'No wallet addresses available for encryption'
      });
    }
    
    log.info('Found signer wallet addresses', {
      contractId,
      signerCount: signerEmails.length,
      addressCount: signerAddresses.length
    });
    
    // After retrieving signers, add this log:
    log.info('Signer wallet addresses details', {
      contractId,
      signerEmails: signerEmails.map(email => 
        // Anonymize emails for logs
        email.substring(0, 3) + '***' + email.substring(email.indexOf('@'))
      ),
      signerAddressCount: signerAddresses.length,
      signerAddressSample: signerAddresses.length > 0 
        ? signerAddresses[0].substring(0, 10) + '...' 
        : 'none',
    });
    
    // Add timing for content processing
    const processingStart = performance.now();
    // Decode base64 content if needed
    let content = documentContent;
    if (isBase64 && typeof documentContent === 'string') {
      content = Buffer.from(documentContent, 'base64');
    } else if (typeof documentContent === 'string') {
      content = Buffer.from(documentContent, 'utf-8');
    }
    
    // After processing:
    log.debug('Content processed for encryption', {
      processingTimeMs: Math.round(performance.now() - processingStart),
      finalContentSize: typeof content === 'string' 
        ? content.length 
        : content instanceof Buffer ? content.length : 'unknown',
    });
    
    // When encrypting, add timing:
    const encryptionStartTime = performance.now();
    // Encrypt the document using SEAL
    try {
      const encryptionResult = await encryptDocument(
        content,
        signerAddresses,
        contractId
      );
      
      log.info('Document successfully encrypted with SEAL', {
        contractId,
        encryptedSize: encryptionResult.encryptedDocument.length,
        keyServerCount: encryptionResult.keyServerIds.length
      });
      
      // Store encryption metadata in the contract record
      await prisma.contract.update({
        where: { id: contractId },
        data: {
          metadata: {
            ...(contract.metadata || {}),
            encryption: {
              method: 'seal',
              keyServerIds: encryptionResult.keyServerIds,
              signerAddresses: signerAddresses,
              timestamp: new Date().toISOString()
            }
          }
        }
      });
      
      // After encryption success:
      log.info('Document encryption metrics', {
        contractId,
        encryptionDurationMs: Math.round(performance.now() - encryptionStartTime),
        totalRequestTimeMs: Math.round(performance.now() - requestStartTime),
      });
      
      // Return the encrypted document and related metadata
      return NextResponse.json({
        encryptedDocument: Buffer.from(encryptionResult.encryptedDocument).toString('base64'),
        symmetricKey: encryptionResult.symmetricKey,
        keyServerIds: encryptionResult.keyServerIds,
        signerAddresses: signerAddresses,
        encrypted: true
      });
    } catch (encryptError) {
      log.error('Error during SEAL encryption', {
        contractId,
        error: encryptError
      });
      
      // Return unencrypted content with error details
      return NextResponse.json({
        encrypted: false,
        error: 'Failed to encrypt document',
        message: (encryptError as Error).message
      });
    }
  } catch (error) {
    log.error('Encryption API error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      totalRequestTimeMs: Math.round(performance.now() - requestStartTime),
    });
    
    return NextResponse.json(
      { error: 'Failed to process document encryption request' },
      { status: 500 }
    );
  }
} 