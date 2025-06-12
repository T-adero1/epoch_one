'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { SealClient, getAllowlistedKeyServers } from '@mysten/seal';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { fromHEX, toHEX } from '@mysten/sui/utils';
import jsPDF from 'jspdf';
import { downloadRecoveryData } from '@/app/utils/recoveryData';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

interface ClientSideEncryptorProps {
  contractId: string;
  documentContent: string;
  signerAddresses: string[];
  signerEmails: string[];
  autoStart?: boolean;
  showLogs?: boolean;
  onSuccess?: (data: any) => void;
  onError?: (error: Error) => void;
}

export default function ClientSideEncryptor({
  contractId,
  documentContent,
  signerAddresses,
  signerEmails,
  autoStart = false,
  showLogs = true,
  onSuccess,
  onError
}: ClientSideEncryptorProps) {
  const [status, setStatus] = useState<'idle' | 'preparing' | 'encrypting' | 'uploading' | 'success' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const SEAL_PACKAGE_ID = process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID || '0xb5c84864a69cb0b495caf548fa2bf0d23f6b69b131fa987d6f896d069de64429';
  const NETWORK = 'testnet';

  function addLog(message: string) {
    if (showLogs) {
      setLogs(prev => [...prev, message]);
    }
    console.log('[ClientEncryptor]', message);
  }

  useEffect(() => {
    if (autoStart && status === 'idle') {
      encryptDocument();
    }
  }, [autoStart, status]);

  const createDocumentIdFromAllowlist = (allowlistId: string) => {
    addLog(`Creating document ID from allowlist ID: ${allowlistId}`);
    
    try {
      const cleanAllowlistId = allowlistId.startsWith('0x') ? allowlistId.slice(2) : allowlistId;
      
      const allowlistBytes = fromHEX(cleanAllowlistId);
      addLog(`Allowlist bytes length: ${allowlistBytes.length}`);
      
      const saltBytes = new Uint8Array(crypto.getRandomValues(new Uint8Array(5)));
      addLog(`Generated salt: ${toHEX(saltBytes)}`);
      
      const fullIdBytes = new Uint8Array([...allowlistBytes, ...saltBytes]);
      addLog(`Combined ID length: ${fullIdBytes.length} bytes`);
      
      const documentIdHex = toHEX(fullIdBytes);
      const saltHex = toHEX(saltBytes);
      
      addLog(`Document ID generated successfully`);
      addLog(`Document ID (hex): ${documentIdHex}`);
      addLog(`Salt (hex): ${saltHex}`);
      
      return { documentIdHex, documentSalt: saltHex };
    } catch (err) {
      console.error('[ClientEncryptor] Error generating document ID:', err);
      throw new Error(`Failed to generate document ID: ${err}`);
    }
  };

  const encryptDocument = async () => {
    try {
      setStatus('preparing');
      setProgress(10);
      setError(null);
      if (showLogs) setLogs([]);
      
      addLog(`Starting document encryption for contract: ${contractId}`);
      addLog(`Document content length: ${documentContent.length}`);
      addLog(`Signer addresses: ${signerAddresses.join(', ')}`);
      
      addLog('Requesting allowlist creation from server');
      addLog(`Using signer addresses: ${signerAddresses.join(', ')}`);
      
      const allowlistResponse = await fetch('/api/seal/create-allowlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractId,
          signerAddresses
        })
      });
      
      addLog(`Allowlist server response: ${allowlistResponse.status}`);
      
      if (!allowlistResponse.ok) {
        const errorText = await allowlistResponse.text();
        addLog(`Server error: ${errorText}`);
        throw new Error(`Failed to create allowlist: ${allowlistResponse.status} ${errorText}`);
      }
      
      const { allowlistId, capId } = await allowlistResponse.json();
      addLog(`Allowlist created successfully: ${allowlistId}`);
      addLog(`Capability ID: ${capId}`);
      
      setProgress(30);
      
      addLog('Initializing Sui client');
      const suiClient = new SuiClient({ url: getFullnodeUrl(NETWORK) });
      
      
      setStatus('encrypting');
      addLog('Initializing SEAL client');
      const keyServerIds = await getAllowlistedKeyServers(NETWORK);
      addLog(`Found ${keyServerIds.length} key servers`);
      
      const sealClient = new SealClient({
        suiClient: suiClient as any,
        serverConfigs: getAllowlistedKeyServers('testnet').map((id) => ({
          objectId: id,
          weight: 1,
        })),
        verifyKeyServers: true
      });
      
      addLog(`Generating document ID from allowlist ID: ${allowlistId}`);
      const { documentIdHex, documentSalt } = createDocumentIdFromAllowlist(allowlistId);
      
      let enhancedDocumentContent;
      try {
        addLog('Preparing clean document content...');
        // Keep document content clean - we'll add zkLogin demo section later in PDF
        enhancedDocumentContent = documentContent;
        addLog('Using clean document content (zkLogin demo section will be added after signature images)');
      } catch (fetchError) {
        addLog(`Document preparation error: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}, using base document`);
        enhancedDocumentContent = documentContent;
      }
      
      addLog('Converting document to PDF format...');
      let documentBytes;
      try {
        // Check if this is a PDF contract (has uploaded PDF file)
        const contractResponse = await fetch(`/api/contracts/${contractId}`);
        const contractData = await contractResponse.json();
        const isPdfContract = !!(contractData.s3FileKey && contractData.s3FileName);

        let pdfDoc: PDFDocument;
        
        if (isPdfContract) {
          addLog('PDF contract detected - combining original PDF with signatures...');
          
          // Fetch the original PDF file
          const originalPdfResponse = await fetch(`/api/contracts/download-pdf/${contractId}?view=inline`);
          if (!originalPdfResponse.ok) {
            throw new Error('Failed to fetch original PDF');
          }
          
          const originalPdfBytes = await originalPdfResponse.arrayBuffer();
          pdfDoc = await PDFDocument.load(originalPdfBytes);
          addLog(`Loaded original PDF with ${pdfDoc.getPageCount()} pages`);
          
        } else {
          addLog('Text contract detected - creating new PDF...');
          
          // Create new PDF for text contracts
          pdfDoc = await PDFDocument.create();
          const page = pdfDoc.addPage();
          const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
              
          // Add text content to PDF with proper text wrapping
          const lines = enhancedDocumentContent.split('\n');
          let currentPage = page;
          let currentY = currentPage.getHeight() - 50;
          const fontSize = 10;
          const lineHeight = 12;
          const leftMargin = 5;
          const rightMargin = 20;
          const pageWidth = currentPage.getSize().width;
          const availableWidth = pageWidth - leftMargin - rightMargin;
          
          for (const line of lines) {
            if (currentY < 50) {
              currentPage = pdfDoc.addPage();
              currentY = currentPage.getHeight() - 50;
            }
            
            const textWidth = font.widthOfTextAtSize(line, fontSize);
            
            if (textWidth > availableWidth) {
              const words = line.split(' ');
              let currentLine = '';
              
              for (const word of words) {
                const testLine = currentLine ? `${currentLine} ${word}` : word;
                const testWidth = font.widthOfTextAtSize(testLine, fontSize);
                
                if (testWidth <= availableWidth) {
                  currentLine = testLine;
                } else {
                  if (currentLine) {
                    if (currentY < 50) {
                      currentPage = pdfDoc.addPage();
                      currentY = currentPage.getHeight() - 50;
                    }
                    
                    currentPage.drawText(currentLine, {
                      x: leftMargin,
                      y: currentY,
                      size: fontSize,
                      font,
                      color: rgb(0, 0, 0),
                    });
                    
                    currentY -= lineHeight;
                    currentLine = word;
                  } else {
                    let remainingWord = word;
                    while (remainingWord.length > 0) {
                      let chunk = '';
                      
                      for (let i = 1; i <= remainingWord.length; i++) {
                        const testChunk = remainingWord.substring(0, i);
                        const chunkWidth = font.widthOfTextAtSize(testChunk, fontSize);
                        
                        if (chunkWidth <= availableWidth) {
                          chunk = testChunk;
                        } else {
                          break;
                        }
                      }
                      
                      if (chunk.length === 0) {
                        chunk = remainingWord.substring(0, 1);
                      }
                      
                      if (currentY < 50) {
                        currentPage = pdfDoc.addPage();
                        currentY = currentPage.getHeight() - 50;
                      }
                      
                      currentPage.drawText(chunk, {
                        x: leftMargin,
                        y: currentY,
                        size: fontSize,
                        font,
                        color: rgb(0, 0, 0),
                      });
                      
                      currentY -= lineHeight;
                      remainingWord = remainingWord.substring(chunk.length);
                    }
                  }
                }
              }
              
              if (currentLine) {
                if (currentY < 50) {
                  currentPage = pdfDoc.addPage();
                  currentY = currentPage.getHeight() - 50;
                }
                
                currentPage.drawText(currentLine, {
                  x: leftMargin,
                  y: currentY,
                  size: fontSize,
                  font,
                  color: rgb(0, 0, 0),
                });
                
                currentY -= lineHeight;
              }
            } else {
              currentPage.drawText(line, {
                x: leftMargin,
                y: currentY,
                size: fontSize,
                font,
                color: rgb(0, 0, 0),
              });
              
              currentY -= lineHeight;
            }
          }
          
          addLog(`Created new PDF with ${pdfDoc.getPageCount()} pages from text content`);
        }

        // Now add signature pages to BOTH types of contracts
        await addContractAppendixToPDF(pdfDoc, contractId, addLog);
        
        // Embed zkLogin signatures in metadata
        await embedZkLoginMetadata(pdfDoc, contractId, addLog);
        
        // Generate final PDF bytes
        const finalPdfBytes = await pdfDoc.save();
        documentBytes = new Uint8Array(finalPdfBytes);
        
        addLog(`Final PDF generated with ${pdfDoc.getPageCount()} total pages. Size: ${documentBytes.length} bytes`);
        
      } catch (pdfError) {
        addLog(`Failed to generate PDF: ${pdfError instanceof Error ? pdfError.message : 'Unknown error'}`);
        addLog('Falling back to text encoding...');
        documentBytes = new TextEncoder().encode(enhancedDocumentContent);
      }
      
      addLog(`Document bytes size: ${documentBytes.length}`);
      
      setProgress(50);
      
      addLog(`Encrypting document with SEAL`);
      addLog(`Using document ID: ${documentIdHex}`);
      addLog(`Using salt: ${documentSalt}`);
      
      const { encryptedObject: encryptedBytes } = await sealClient.encrypt({
        threshold: 1,
        packageId: SEAL_PACKAGE_ID,
        id: documentIdHex,
        data: documentBytes
      });
      
      addLog('Document encrypted successfully');
      addLog(`Encrypted data size: ${encryptedBytes.length} bytes`);
      
      setProgress(70);
      setStatus('uploading');
      
      const encryptedBase64 = Buffer.from(encryptedBytes).toString('base64');
      addLog(`Encoded encrypted data to base64, length: ${encryptedBase64.length}`);
      
      addLog(`Sending encrypted document to server`);
      
      const isDevelopment = process.env.NODE_ENV === 'development';
      const apiEndpoint = isDevelopment ? '/api/python_direct' : '/api/upload_contract';
      
      addLog(`Using API endpoint: ${apiEndpoint}`);
      
      const uploadResponse = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractId,
          contractContent: encryptedBase64,
          isBase64: true,
          context: 'testnet',
          deletable: false,
          signerAddresses,
          metadata: {
            signers: signerEmails,
            documentType: 'pdf'
          },
          preEncrypted: true,
          documentIdHex,
          documentSalt,
          allowlistId,
          capId,
          useSeal: true
        })
      });
      
      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`Upload failed: ${uploadResponse.status} ${errorText}`);
      }
      
      const responseData = await uploadResponse.json();
      addLog(`Upload successful:`);
      addLog(`Blob ID: ${responseData.blobId || 'unknown'}`);
      
      // Auto-download recovery data on successful upload
      try {
        addLog('Generating recovery data file...');
        const recoveryData = {
          blobId: responseData.blobId,
          allowlistId,
          documentId: documentIdHex,
          contractId,
          timestamp: new Date().toISOString()
        };
        
        downloadRecoveryData(recoveryData, `recovery_${contractId}`);
        addLog('Recovery data file downloaded automatically');
      } catch (recoveryError) {
        addLog(`Failed to download recovery data: ${recoveryError instanceof Error ? recoveryError.message : 'Unknown error'}`);
      }
      
      setProgress(100);
      setStatus('success');
      setResult(responseData);
      
      if (onSuccess) {
        onSuccess(responseData);
      }
      
      return responseData;
    } catch (err: any) {
      console.error('[ClientEncryptor] Error:', err);
      addLog(`ERROR: ${err.message}`);
      setStatus('error');
      setError(err.message || 'An unknown error occurred');
      
      if (onError) {
        onError(err);
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        {!autoStart && (
          <Button 
            onClick={encryptDocument} 
            disabled={status !== 'idle' && status !== 'error'}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {status === 'idle' ? 'Encrypt Document' : 
             status === 'preparing' ? 'Preparing...' : 
             status === 'encrypting' ? 'Encrypting...' : 
             status === 'uploading' ? 'Uploading...' : 
             status === 'success' ? 'Encrypted!' : 'Retry Encryption'}
          </Button>
        )}
        
        {status !== 'idle' && status !== 'error' && (
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        )}
      </div>
      
      {error && (
        <div className="text-red-500 text-sm mt-2 p-2 bg-red-50 rounded">
          Error: {error}
        </div>
      )}
      
      {status === 'success' && (
        <div className="text-green-500 text-sm mt-2 p-2 bg-green-50 rounded">
          Document encrypted and uploaded successfully! Blob ID: {result?.blobId}
        </div>
      )}
      
      {showLogs && logs.length > 0 && (
        <div className="mt-4 border rounded p-2 bg-gray-50">
          <h4 className="text-sm font-medium mb-2">Encryption Logs:</h4>
          <div className="text-xs font-mono bg-black text-green-400 p-2 rounded h-32 overflow-y-auto">
            {logs.map((log, i) => (
              <div key={i}>&gt; {log}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Enhanced function with production-quality formatting but original text wrapping logic
async function addContractAppendixToPDF(pdfDoc: PDFDocument, contractId: string, addLog: (msg: string) => void) {
  try {
    addLog('Adding professionally formatted contract appendix to PDF...');
    
    // Fetch contract data and signatures
    const [contractResponse, signaturesResponse] = await Promise.all([
      fetch(`/api/contracts/${contractId}`),
      fetch(`/api/signatures?contractId=${contractId}`)
    ]);
    
    if (!contractResponse.ok || !signaturesResponse.ok) {
      addLog('Failed to fetch contract or signature data');
      return;
    }
    
    const contractData = await contractResponse.json();
    const signaturesData = await signaturesResponse.json();
    
    // Extract signature data
    const signatureImages = signaturesData.signatures
      ?.filter((sig: any) => sig.signature && sig.signedAt)
      ?.map((sig: any) => ({
        userEmail: sig.email,
        signatureImage: sig.signature,
        signedAt: new Date(sig.signedAt).toISOString()
      })) || [];

    const zkSignatures = signaturesData.signatures
      ?.filter((sig: any) => sig.zkLoginData)
      ?.map((sig: any) => ({
        userEmail: sig.email,
        userAddress: sig.zkLoginData.userAddress,
        contentHash: sig.zkLoginData.contentHash,
        contentSignature: sig.zkLoginData.contentSignature,
        imageHash: sig.zkLoginData.imageHash,
        imageSignature: sig.zkLoginData.imageSignature,
        timestamp: sig.zkLoginData.timestamp,
        ephemeralPublicKey: sig.zkLoginData.ephemeralPublicKey
      })) || [];

    // Add new page for appendix
    let currentPage = pdfDoc.addPage();
    const pageWidth = currentPage.getSize().width;
    const pageHeight = currentPage.getSize().height;
    
    // Embed fonts
    const normalFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
    
    // Professional layout constants
    const margins = {
      left: 60,
      right: 60,
      top: 60,
      bottom: 60
    };
    const contentWidth = pageWidth - margins.left - margins.right;
    
    let currentY = pageHeight - margins.top;
    
    // Enhanced text rendering with ORIGINAL character-based wrapping
    const addText = (text: string, options: {
      font?: any;
      size?: number;
      isBold?: boolean;
      isItalic?: boolean;
      color?: any;
      indent?: number;
      spaceAfter?: number;
      spaceBefore?: number;
      centered?: boolean;
    } = {}) => {
      // Apply spacing before
      if (options.spaceBefore) {
        currentY -= options.spaceBefore;
      }
      
      // Check if we need a new page
      if (currentY < margins.bottom + 50) {
        currentPage = pdfDoc.addPage();
        currentY = pageHeight - margins.top;
      }
      
      if (text === '') {
        currentY -= options.spaceAfter || 12;
        return;
      }
      
      // Determine font
      let font = normalFont;
      if (options.isBold) font = boldFont;
      else if (options.isItalic) font = italicFont;
      else if (options.font) font = options.font;
      
      const fontSize = options.size || 11;
      const color = options.color || rgb(0, 0, 0);
      const indent = options.indent || 0;
      const lineHeight = fontSize * 1.4; // Professional line spacing
      
      // ORIGINAL 80-character wrapping logic
      if (text.length > 80) {
        // Split long text into 80-character chunks
        let remainingText = text;
        while (remainingText.length > 0) {
          let chunk = remainingText.substring(0, 80);
          
          // Try to break at word boundary if possible
          if (remainingText.length > 80) {
            const lastSpace = chunk.lastIndexOf(' ');
            if (lastSpace > 60) { // Only break at space if it's not too early
              chunk = chunk.substring(0, lastSpace);
              remainingText = remainingText.substring(lastSpace + 1); // +1 to skip the space
            } else {
              remainingText = remainingText.substring(80);
            }
          } else {
            remainingText = '';
          }
          
          // Remove any leading/trailing spaces from the chunk
          chunk = chunk.trim();
          
          if (chunk.length > 0) { // Only draw non-empty chunks
            // Check if we need a new page
            if (currentY < margins.bottom + 20) {
              currentPage = pdfDoc.addPage();
              currentY = pageHeight - margins.top;
            }
            
            let x = margins.left + indent;
            if (options.centered) {
              const textWidth = font.widthOfTextAtSize(chunk, fontSize);
              x = (pageWidth - textWidth) / 2;
            }
            
            currentPage.drawText(chunk, {
              x,
              y: currentY,
              size: fontSize,
              font,
              color,
            });
            
            currentY -= lineHeight;
          }
        }
      } else {
        // Normal line (under 80 characters)
        if (currentY < margins.bottom + 20) {
          currentPage = pdfDoc.addPage();
          currentY = pageHeight - margins.top;
        }
        
        let x = margins.left + indent;
        if (options.centered) {
          const textWidth = font.widthOfTextAtSize(text, fontSize);
          x = (pageWidth - textWidth) / 2;
        }
        
        currentPage.drawText(text, {
          x,
          y: currentY,
          size: fontSize,
          font,
          color,
        });
        
        currentY -= lineHeight;
      }
      
      // Apply spacing after
      if (options.spaceAfter) {
        currentY -= options.spaceAfter;
      }
    };
    
    // Helper for drawing horizontal lines
    const addHorizontalLine = (width?: number, thickness?: number, spaceAfter?: number) => {
      const lineWidth = width || contentWidth;
      const lineThickness = thickness || 0.5;
      
      currentPage.drawLine({
        start: { x: margins.left, y: currentY },
        end: { x: margins.left + lineWidth, y: currentY },
        thickness: lineThickness,
        color: rgb(0.7, 0.7, 0.7),
      });
      
      currentY -= spaceAfter || 20;
    };
    
    // Helper for section headers
    const addSectionHeader = (title: string, underline: boolean = true) => {
      addText(title, {
        isBold: true,
        size: 16,
        spaceBefore: 25,
        spaceAfter: 8,
        color: rgb(0.2, 0.2, 0.2)
      });
      
      if (underline) {
        addHorizontalLine(undefined, 1, 15);
      }
    };
    
    // Helper for subsection headers
    const addSubsectionHeader = (title: string) => {
      addText(title, {
        isBold: true,
        size: 13,
        spaceBefore: 20,
        spaceAfter: 10,
        color: rgb(0.3, 0.3, 0.3)
      });
    };
    
    // 1. CONTRACT EXECUTION RECORD HEADER
    addText('CONTRACT EXECUTION RECORD', {
      isBold: true,
      size: 20,
      centered: true,
      spaceAfter: 10,
      color: rgb(0.1, 0.1, 0.1)
    });
    
    addHorizontalLine(undefined, 2, 30);
    
    // 2. CONTRACT INFORMATION SECTION
    addSectionHeader('CONTRACT INFORMATION');
    
    const contractInfo = [
      { label: 'Title', value: contractData.title },
      { label: 'Status', value: contractData.status },
      { label: 'Created', value: new Date(contractData.createdAt).toLocaleString() },
      { label: 'Contract ID', value: contractData.id }
    ];
    
    for (const info of contractInfo) {
      addText(`${info.label}:`, {
        isBold: true,
        size: 11,
        spaceAfter: 3
      });
      addText(info.value, {
        size: 11,
        indent: 20,
        spaceAfter: 12,
        color: rgb(0.2, 0.2, 0.2)
      });
    }
    
    // 3. PARTIES SECTION
    addSectionHeader('CONTRACTING PARTIES');
    
    addText('Contract Creator (Party A):', {
      isBold: true,
      size: 12,
      spaceAfter: 5
    });
    addText(contractData.owner?.email || 'Unknown', {
      size: 11,
      indent: 20,
      spaceAfter: 15,
      color: rgb(0.2, 0.2, 0.2)
    });
    
    addText('Authorized Signers (Party B):', {
      isBold: true,
      size: 12,
      spaceAfter: 5
    });
    const signers = contractData.metadata?.signers || ['No signers'];
    for (const signer of signers) {
      addText(`• ${signer}`, {
        size: 11,
        indent: 20,
        spaceAfter: 8,
        color: rgb(0.2, 0.2, 0.2)
      });
    }
    
    // 4. SIGNATURE VERIFICATION SECTION
    if (signatureImages.length > 0) {
      addSectionHeader('SIGNATURE VERIFICATION');
      
      for (let i = 0; i < signatureImages.length; i++) {
        const sig = signatureImages[i];
        
        addSubsectionHeader(`Signature ${i + 1}: ${sig.userEmail}`);
        
        addText(`Date: ${new Date(sig.signedAt).toLocaleString()}`, {
          size: 10,
          color: rgb(0.4, 0.4, 0.4),
          spaceAfter: 15
        });
        
        // Add signature image with professional styling
        if (sig.signatureImage && sig.signatureImage.startsWith('data:image/')) {
          try {
            if (currentY < margins.bottom + 120) {
              currentPage = pdfDoc.addPage();
              currentY = pageHeight - margins.top;
            }
            
            const base64Data = sig.signatureImage.split(',')[1];
            const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
            const image = await pdfDoc.embedPng(imageBytes);
            
            // Draw signature container with shadow effect
            const sigWidth = 240;
            const sigHeight = 80;
            const sigX = margins.left + 20;
            const sigY = currentY - sigHeight;
            
            // Shadow
            currentPage.drawRectangle({
              x: sigX + 3,
              y: sigY - 3,
              width: sigWidth,
              height: sigHeight,
              color: rgb(0.9, 0.9, 0.9),
            });
            
            // Main container
            currentPage.drawRectangle({
              x: sigX,
              y: sigY,
              width: sigWidth,
              height: sigHeight,
              color: rgb(1, 1, 1),
              borderColor: rgb(0.7, 0.7, 0.7),
              borderWidth: 1,
            });
            
            // Signature image
            currentPage.drawImage(image, {
              x: sigX + 10,
              y: sigY + 10,
              width: sigWidth - 20,
              height: sigHeight - 20,
            });
            
            currentY = sigY - 25;
            addLog(`Added professional signature display for ${sig.userEmail}`);
          } catch (imageError) {
            addLog(`Failed to add signature image for ${sig.userEmail}`);
            addText('[Signature image could not be displayed]', {
              isItalic: true,
              size: 10,
              color: rgb(0.6, 0.6, 0.6),
              spaceAfter: 20
            });
          }
        }
      }
    }
    
    // 5. CRYPTOGRAPHIC VERIFICATION SECTION
    if (zkSignatures.length > 0) {
      addSectionHeader('CRYPTOGRAPHIC VERIFICATION DATA');
      
      addText('The following data provides cryptographic proof of signature authenticity:', {
        isItalic: true,
        size: 11,
        spaceAfter: 20,
        color: rgb(0.4, 0.4, 0.4)
      });
      
      for (let i = 0; i < zkSignatures.length; i++) {
        const zk = zkSignatures[i];
        
        addSubsectionHeader(`Signer ${i + 1}: ${zk.userEmail}`);
        
        // Create a structured layout for crypto data with 80-char wrapping
        const cryptoFields = [
          { label: 'Wallet Address', value: zk.userAddress },
          { label: 'Content Hash', value: zk.contentHash },
          { label: 'Content Signature', value: zk.contentSignature },
          { label: 'Image Hash', value: zk.imageHash },
          { label: 'Image Signature', value: zk.imageSignature },
          { label: 'Timestamp', value: new Date(zk.timestamp).toISOString() },
          { label: 'Public Key', value: zk.ephemeralPublicKey }
        ];
        
        for (const field of cryptoFields) {
          addText(`${field.label}:`, {
            isBold: true,
            size: 10,
            spaceAfter: 3
          });
          
          // The 80-character wrapping will handle long hashes automatically
          addText(field.value, {
            size: 9,
            indent: 15,
            spaceAfter: 10,
            color: rgb(0.3, 0.3, 0.3)
          });
        }
        
        if (i < zkSignatures.length - 1) {
          addHorizontalLine(contentWidth * 0.5, 0.5, 15);
        }
      }
    }
    
    // 6. VERIFICATION NOTES SECTION
    addSectionHeader('VERIFICATION NOTES');
    
    const verificationNotes = [
      'This document contains cryptographic proof of signatures embedded in metadata',
      'Each signature is cryptographically bound to the exact document content',
      'Verification data can be extracted and validated independently',
      'zkLogin protocol ensures signatures cannot be forged or tampered with',
      'Original document content is preserved without modification'
    ];
    
    for (const note of verificationNotes) {
      addText(`• ${note}`, {
        size: 10,
        indent: 10,
        spaceAfter: 8,
        color: rgb(0.4, 0.4, 0.4)
      });
    }
    
    // 7. DEMO SECTION (if zkLogin data exists) - SIMPLIFIED VERSION
    if (zkSignatures.length > 0) {
      currentY -= 30; // Extra space before demo section
      
      addText('DEMO: ZKLOGIN CRYPTOGRAPHIC DATA', {
        isBold: true,
        size: 14,
        centered: true,
        spaceAfter: 10,
        color: rgb(0.2, 0.2, 0.6)
      });
      
      addText('(Note: This section is shown for demonstration purposes. In production, this data would be embedded invisibly in the PDF metadata.)', {
        isItalic: true,
        size: 10,
        centered: true,
        spaceAfter: 20,
        color: rgb(0.5, 0.5, 0.5)
      });
      
      // This long text will automatically wrap at 80 characters
      addText('This cryptographic data proves the authenticity and integrity of each signature without requiring trust in a central authority. The zkLogin protocol ensures that each signer\'s identity is verified through OAuth providers, signatures cannot be forged, and privacy is preserved while maintaining verifiability.', {
        size: 10,
        spaceAfter: 20,
        color: rgb(0.4, 0.4, 0.4)
      });
    }
    
    addLog(`Added professionally formatted contract appendix with ${signatureImages.length} signature displays`);
    
  } catch (error) {
    addLog(`Error adding contract appendix: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Helper function to embed zkLogin metadata
async function embedZkLoginMetadata(pdfDoc: PDFDocument, contractId: string, addLog: (msg: string) => void) {
  try {
    addLog('Embedding zkLogin metadata...');
    const signaturesResponse = await fetch(`/api/signatures?contractId=${contractId}`);
    
    if (!signaturesResponse.ok) {
      addLog('Failed to fetch zkLogin data');
      return;
    }
    
    const signaturesData = await signaturesResponse.json();
    const zkSignatures = signaturesData.signatures
      ?.filter((sig: any) => sig.zkLoginData)
      ?.map((sig: any) => ({
        userEmail: sig.email,
        userAddress: sig.zkLoginData.userAddress,
        contentHash: sig.zkLoginData.contentHash,
        contentSignature: sig.zkLoginData.contentSignature,
        imageHash: sig.zkLoginData.imageHash,
        imageSignature: sig.zkLoginData.imageSignature,
        timestamp: sig.zkLoginData.timestamp,
        ephemeralPublicKey: sig.zkLoginData.ephemeralPublicKey
      })) || [];

    if (zkSignatures.length > 0) {
      const zkDataBase64 = Buffer.from(JSON.stringify(zkSignatures)).toString('base64');
      
      // Set PDF metadata
      pdfDoc.setTitle('Encrypted Contract Document');
      pdfDoc.setSubject(`zkSignatures:${zkDataBase64}`);
      pdfDoc.setCreator('Epoch One');
      pdfDoc.setKeywords(['zklogin', 'contract', contractId]);
      
      addLog(`Embedded ${zkSignatures.length} zkLogin signatures in PDF metadata`);
    }
    
  } catch (error) {
    addLog(`Error embedding zkLogin metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
} 