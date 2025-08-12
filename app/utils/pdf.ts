import { jsPDF } from 'jspdf';

/**
 * Generates an enhanced PDF from contract data that matches the ClientSideEncryptor format
 * @param contract The contract object to convert to PDF
 * @param fileName Optional custom filename for the PDF
 */
export const generateContractPDF = async (
  contract: {
    id: string;
    title: string;
    description?: string | null;
    content: string;
    createdAt: Date;
    status: string;
    ownerId: string;
    metadata?: {
      signers?: string[];
      owner?: {
        email?: string;
        name?: string;
      };
    } | null;
    owner?: {
      id: string;
      name: string | null;
      email: string;
    };
    signatures?: {
      id: string;
      status: string;
      signedAt: Date | null;
      signature?: string | null;
      zkLoginData?: any;
      user: {
        id: string;
        name: string | null;
        email: string;
      };
    }[];
  },
  fileName?: string
): Promise<void> => {
  try {
    // Fetch complete signature data
    let enhancedDocumentContent;
    let signatureImages: Array<{
      userEmail: string;
      signatureImage: string;
      signedAt: string;
    }> = [];
    let zkSignatures: Array<any> = [];

    try {
      const signaturesResponse = await fetch(`/api/signatures?contractId=${contract.id}`);
      if (signaturesResponse.ok) {
        const signaturesData = await signaturesResponse.json();
        
        // Extract zkLogin signatures for metadata embedding
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
          
        // Extract signature images for visual display
        signatureImages = signaturesData.signatures
          ?.filter((sig: any) => sig.signature && sig.signedAt)
          ?.map((sig: any) => ({
            userEmail: sig.email,
            signatureImage: sig.signature,
            signedAt: new Date(sig.signedAt).toISOString()
          })) || [];
          
        console.log(`[PDF Generation] Found ${zkSignatures.length} zkLogin signatures (metadata) and ${signatureImages.length} signature images (visual)`);
        
        // Generate clean document content WITHOUT zkLogin section
        enhancedDocumentContent = generateEnhancedContractDocument(contract);
        
      } else {
        enhancedDocumentContent = generateEnhancedContractDocument(contract);
      }
      } catch (fetchError) {
        console.log('[PDF Generation] Failed to fetch signature data, using base document', fetchError);
        enhancedDocumentContent = generateEnhancedContractDocument(contract);
      }

    // Create PDF with the same settings as ClientSideEncryptor
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    
    // Embed zkLogin signatures in PDF metadata (invisible)
    if (zkSignatures.length > 0) {
      const zkMetadata = {
        title: contract.title,
        subject: 'Contract Document with Cryptographic Signatures',
        creator: 'Epoch One',
        author: contract.owner?.email || 'Unknown',
        // Custom metadata for zkLogin signatures
        keywords: `zklogin,contract,${contract.id}`,
        // Embed zkLogin data as custom properties (these are invisible)
        zkLoginSignatures: JSON.stringify(zkSignatures),
        zkLoginCount: zkSignatures.length.toString(),
        contractId: contract.id
      };
      
      pdf.setProperties(zkMetadata);
      console.log(`[PDF Generation] Embedded ${zkSignatures.length} zkLogin signatures in PDF metadata`);
    } else {
      pdf.setProperties({
        title: contract.title,
        subject: 'Contract Document',
        creator: 'Epoch One',
        author: contract.owner?.email || 'Unknown'
      });
    }
    
    // Use the same font and formatting as ClientSideEncryptor
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    
    const lines = enhancedDocumentContent.split('\n');
    let currentY = 20;
    const lineHeight = 5;
    const pageHeight = 280;
    const leftMargin = 10;
    const rightMargin = 200;
    
    // Add text content with smart wrapping to prevent overflow
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (currentY > pageHeight - 40) { // Leave space for signature images
        pdf.addPage();
        currentY = 20;
      }
      
      // Apply smart text wrapping to ALL lines based on available page width
      // This prevents ANY text from running off the page
      const availableWidth = rightMargin - leftMargin;
      const wrappedLines = pdf.splitTextToSize(line, availableWidth);
      
      // Handle each wrapped line
      for (const wrappedLine of wrappedLines) {
        // Check if we need a new page for this wrapped line
        if (currentY > pageHeight - 40) {
          pdf.addPage();
          currentY = 20;
        }
        
        // Add the wrapped line (guaranteed to fit within page width)
        pdf.text(wrappedLine, leftMargin, currentY);
        currentY += lineHeight;
      }
    }
    
    // Add signature images section (VISIBLE)
    if (signatureImages.length > 0) {
      // Add some space before signature images
      currentY += 15;
      
      if (currentY > pageHeight - 100) {
        pdf.addPage();
        currentY = 20;
      }
      
      // Add section header with better styling
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('SIGNATURE VERIFICATION', leftMargin, currentY);
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
          } else {
            pdf.text('[Signature image not available]', leftMargin + 5, currentY);
            currentY += 15;
          }
          
        } catch (imageError) {
          console.warn(`[PDF Generation] Failed to add signature image for ${sigImage.userEmail}:`, imageError);
          pdf.text(`[Error loading signature for ${sigImage.userEmail}]`, leftMargin + 5, currentY);
          currentY += 15;
        }
      }
      
      // Add verification note
      currentY += 10;
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'italic');
      pdf.text('This document contains cryptographic proof of signatures embedded in metadata.', leftMargin, currentY);
      pdf.text('Cryptographic verification data is preserved but not displayed for document clarity.', leftMargin, currentY + 4);
    }

    // Save the PDF
    const safeName = fileName || `${contract.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_contract`;
    pdf.save(`${safeName}.pdf`);

    console.log('[PDF Generation] PDF generated successfully with embedded zkLogin metadata and visible signature images');

  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error('Failed to generate PDF');
  }
};

/**
 * Generates the enhanced contract document content that matches the ClientSideEncryptor format
 * @param contract The contract data
 * @returns The formatted document content string
 */
function generateEnhancedContractDocument(contract: {
  id: string;
  title: string;
  content: string;
  status: string;
  createdAt: Date;
  metadata?: {
    signers?: string[];
  } | null;
  owner?: {
    id: string;
    name: string | null;
    email: string;
  };
  signatures?: {
    id: string;
    status: string;
    signedAt: Date | null;
    user: {
      id: string;
      name: string | null;
      email: string;
    };
  }[];
}): string {
  console.log('[Enhanced Document] Starting document generation for contract:', contract.id);
  
  const contractText = contract.content || '';
  const title = contract.title || 'Untitled Contract';
  const signers = contract.metadata?.signers || [];
  
  // Get creator information
  const creatorEmail = contract.owner?.email || contract.owner?.name || 'Unknown Creator';
  
  // Format signers list
  const signersText = signers.length > 0 ? signers.join(', ') : 'No signers';
  
  console.log('[Enhanced Document] Document details:', {
    title,
    status: contract.status,
    contentLength: contractText.length,
    creatorEmail,
    signerCount: signers.length,
    signatureCount: contract.signatures?.length || 0
  });
  
  // Create the enhanced document content
  const documentContent = `
    TITLE: ${title}
    STATUS: ${contract.status}
    CREATED: ${new Date(contract.createdAt).toISOString()}
    
    CONTRACT CREATOR (PARTY A): ${creatorEmail}
    SIGNERS (PARTY B): ${signersText}
    
    CONTRACT DETAILS:
    ${contractText}
    
    SIGNATURES:
    ${contract.signatures?.map(sig => 
      `${sig.user.email} - ${sig.signedAt ? new Date(sig.signedAt).toISOString() : 'Pending'}`
    ).join('\n') || 'No signatures'}
  `;
  
  console.log('[Enhanced Document] Document generated successfully. Plain text length:', documentContent.length);
  return documentContent;
}