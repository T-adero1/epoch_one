'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { SealClient, getAllowlistedKeyServers } from '@mysten/seal';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { fromHEX, toHEX } from '@mysten/sui/utils';
import jsPDF from 'jspdf';
import { downloadRecoveryData } from '@/app/utils/recoveryData';

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
        serverObjectIds: keyServerIds.map(id => [id, 1]),
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
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4'
        });
        
        // Fetch and embed zkLogin signatures invisibly
        let zkSignatures: any[] = [];
        try {
          addLog('Fetching zkLogin signatures for invisible embedding...');
          const signaturesResponse = await fetch(`/api/signatures?contractId=${contractId}`);
          if (signaturesResponse.ok) {
            const signaturesData = await signaturesResponse.json();
            
            zkSignatures = signaturesData.signatures
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
              // Method 1: Embed in subject field as base64 (more reliable than custom properties)
              const zkDataBase64 = Buffer.from(JSON.stringify(zkSignatures)).toString('base64');
              
              pdf.setProperties({
                title: 'Encrypted Contract Document',
                subject: `zkSignatures:${zkDataBase64}`,
                creator: 'Epoch One',
                keywords: `zklogin,contract,${contractId}`,
                contractId: contractId
              });
              
              // Method 2: Add invisible text off-page as backup
              pdf.setTextColor(255, 255, 255); // White text (invisible)
              pdf.setFontSize(1); // Tiny font
              pdf.text(`ZK_DATA:${zkDataBase64}`, -1000, -1000); // Position off-page
              
              addLog(`Embedded ${zkSignatures.length} zkLogin signatures invisibly (subject + off-page text)`);
            } else {
              pdf.setProperties({
                title: 'Encrypted Contract Document',
                subject: 'Contract Document',
                creator: 'Epoch One'
              });
              addLog('No zkLogin signatures found to embed');
            }
          } else {
            pdf.setProperties({
              title: 'Encrypted Contract Document',
              subject: 'Contract Document',
              creator: 'Epoch One'
            });
            addLog('Failed to fetch zkLogin signatures for embedding');
          }
        } catch (metadataError) {
          addLog(`Failed to embed zkLogin data: ${metadataError instanceof Error ? metadataError.message : 'Unknown error'}`);
          pdf.setProperties({
            title: 'Encrypted Contract Document',
            subject: 'Contract Document',
            creator: 'Epoch One'
          });
        }
        
        // Reset text color and font for visible content
        pdf.setTextColor(0, 0, 0); // Black text
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        
        const lines = enhancedDocumentContent.split('\n');
        let currentY = 20;
        const lineHeight = 5;
        const pageHeight = 280;
        const leftMargin = 10;
        const rightMargin = 200;
        
        // Add text content (clean document without zkLogin demo section)
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          
          if (currentY > pageHeight - 40) { // Leave space for signature images
            pdf.addPage();
            currentY = 20;
          }
          
          if (line.length > 80) {
            const wrappedLines = pdf.splitTextToSize(line, rightMargin - leftMargin);
            for (const wrappedLine of wrappedLines) {
              if (currentY > pageHeight - 40) {
                pdf.addPage();
                currentY = 20;
              }
              pdf.text(wrappedLine, leftMargin, currentY);
              currentY += lineHeight;
            }
          } else {
            pdf.text(line, leftMargin, currentY);
            currentY += lineHeight;
          }
        }
        
        // Add signature images section FIRST
        try {
          addLog('Adding signature images to PDF...');
          const signaturesResponse = await fetch(`/api/signatures?contractId=${contractId}`);
          if (signaturesResponse.ok) {
            const signaturesData = await signaturesResponse.json();
            
            const signatureImages = signaturesData.signatures
              ?.filter((sig: any) => sig.signature && sig.signedAt)
              ?.map((sig: any) => ({
                userEmail: sig.email,
                signatureImage: sig.signature,
                signedAt: new Date(sig.signedAt).toISOString()
              })) || [];
            
            if (signatureImages.length > 0) {
              addLog(`Adding ${signatureImages.length} signature images to PDF`);
              
              // Add some space before signature images
              currentY += 15;
              
              if (currentY > pageHeight - 100) {
                pdf.addPage();
                currentY = 20;
              }
              
              // Add section header with better styling
              pdf.setFontSize(14);
              pdf.setFont('helvetica', 'bold');
              pdf.text('SIGNATURES:', leftMargin, currentY);
              currentY += 8;
              
              // Add a decorative line
              pdf.setLineWidth(0.5);
              pdf.line(leftMargin, currentY, leftMargin + 100, currentY);
              currentY += 10;
              
              pdf.setFontSize(10);
              pdf.setFont('helvetica', 'normal');
              
              // Add each signature image with better formatting
              for (let i = 0; i < signatureImages.length; i++) {
                const sigImage = signatureImages[i];
                try {
                  // Check if we need a new page
                  if (currentY > pageHeight - 90) {
                    pdf.addPage();
                    currentY = 20;
                  }
                  
                  // Add signature number and signer info
                  pdf.setFont('helvetica', 'bold');
                  pdf.text(`Signature ${i + 1}:`, leftMargin, currentY);
                  currentY += 6;
                  
                  pdf.setFont('helvetica', 'normal');
                  pdf.text(`Signer: ${sigImage.userEmail}`, leftMargin + 5, currentY);
                  currentY += 5;
                  pdf.text(`Date: ${new Date(sigImage.signedAt).toLocaleString()}`, leftMargin + 5, currentY);
                  currentY += 8;
                  
                  // Add signature image with border
                  if (sigImage.signatureImage && sigImage.signatureImage.startsWith('data:image/')) {
                    const imageWidth = 80; // mm
                    const imageHeight = 25; // mm
                    
                    // Add border around signature
                    pdf.setLineWidth(0.3);
                    pdf.rect(leftMargin, currentY, imageWidth, imageHeight);
                    
                    // Add signature image
                    pdf.addImage(
                      sigImage.signatureImage,
                      'PNG',
                      leftMargin + 1,
                      currentY + 1,
                      imageWidth - 2,
                      imageHeight - 2
                    );
                    
                    currentY += imageHeight + 15;
                    addLog(`Added signature image for ${sigImage.userEmail}`);
                  } else {
                    pdf.text('[Signature image not available]', leftMargin + 5, currentY);
                    currentY += 15;
                  }
                  
                } catch (imageError) {
                  addLog(`Failed to add signature image for ${sigImage.userEmail}: ${imageError instanceof Error ? imageError.message : 'Unknown error'}`);
                  pdf.text(`[Error loading signature for ${sigImage.userEmail}]`, leftMargin + 5, currentY);
                  currentY += 15;
                }
              }
              
              // Add verification note
              currentY += 10;
              pdf.setFontSize(8);
              pdf.setFont('helvetica', 'italic');
              pdf.text('This document contains cryptographic proof of signatures embedded invisibly.', leftMargin, currentY);
              pdf.text('Verification data can be extracted from PDF metadata for auditing purposes.', leftMargin, currentY + 4);
              currentY += 15;
              
            } else {
              addLog('No signature images found to embed');
            }
          } else {
            addLog('Failed to fetch signature images for PDF embedding');
          }
        } catch (imageError) {
          addLog(`Error fetching signature images: ${imageError instanceof Error ? imageError.message : 'Unknown error'}`);
        }
        
        // Now add zkLogin demo section AFTER signature images
        if (zkSignatures.length > 0) {
          addLog('Adding zkLogin demo section after signature images...');
          
          // Add some space before zkLogin demo section
          currentY += 10;
          
          if (currentY > pageHeight - 150) {
            pdf.addPage();
            currentY = 20;
          }
          
          // Add demo section header
          pdf.setFontSize(12);
          pdf.setFont('helvetica', 'bold');
          pdf.text('DEMO: ZKLOGIN CRYPTOGRAPHIC DATA', leftMargin, currentY);
          currentY += 8;
          
          // Add demo note
          pdf.setFontSize(9);
          pdf.setFont('helvetica', 'italic');
          const demoNote = '(Note: This section is shown for demonstration purposes. In production, this data would be embedded invisibly in the PDF metadata.)';
          const noteLines = pdf.splitTextToSize(demoNote, rightMargin - leftMargin);
          for (const noteLine of noteLines) {
            pdf.text(noteLine, leftMargin, currentY);
            currentY += 4;
          }
          currentY += 8;
          
          // Add zkLogin data
          pdf.setFontSize(10);
          pdf.setFont('helvetica', 'normal');
          
          for (const zk of zkSignatures) {
            // Check if we need a new page
            if (currentY > pageHeight - 100) {
              pdf.addPage();
              currentY = 20;
            }
            
            // Add zkLogin signature data
            const zkLines = [
              `Signer: ${zk.userEmail}`,
              `Wallet Address: ${zk.userAddress}`,
              `Ephemeral Public Key: ${zk.ephemeralPublicKey}`,
              `Contract Content Hash: ${zk.contentHash}`,
              `Contract Content Signature: ${zk.contentSignature}`,
              `Signature Image Hash: ${zk.imageHash}`,
              `Signature Image Signature: ${zk.imageSignature}`,
              `Timestamp: ${new Date(zk.timestamp).toISOString()}`,
              '---'
            ];
            
            for (const zkLine of zkLines) {
              if (currentY > pageHeight - 10) {
                pdf.addPage();
                currentY = 20;
              }
              
              if (zkLine.length > 80) {
                const wrappedLines = pdf.splitTextToSize(zkLine, rightMargin - leftMargin);
                for (const wrappedLine of wrappedLines) {
                  pdf.text(wrappedLine, leftMargin, currentY);
                  currentY += lineHeight;
                }
      } else {
                pdf.text(zkLine, leftMargin, currentY);
                currentY += lineHeight;
              }
            }
            currentY += 5;
          }
          
          // Add explanation
          currentY += 10;
          pdf.setFontSize(9);
          pdf.setFont('helvetica', 'italic');
          const explanation = [
            'This cryptographic data proves the authenticity and integrity of each signature without',
            'requiring trust in a central authority. The zkLogin protocol ensures that:',
            '• Each signer\'s identity is verified through OAuth providers',
            '• The signature cannot be forged or tampered with',
            '• The contract content is cryptographically bound to each signature',
            '• Privacy is preserved while maintaining verifiability'
          ];
          
          for (const expLine of explanation) {
            if (currentY > pageHeight - 10) {
              pdf.addPage();
              currentY = 20;
            }
            pdf.text(expLine, leftMargin, currentY);
            currentY += 5;
          }
        }
        
        const pdfOutput = pdf.output('arraybuffer');
        documentBytes = new Uint8Array(pdfOutput);
        
        addLog(`PDF generated successfully with reordered sections: Signature Images → zkLogin Demo. PDF size: ${documentBytes.length} bytes`);
        
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