import { jsPDF } from 'jspdf';

/**
 * Generates a PDF from contract data using direct jsPDF methods
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
    } | null;
  },
  fileName?: string
): Promise<void> => {
  try {
    // Create a new PDF document
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Document properties
    pdf.setProperties({
      title: contract.title,
      subject: 'Contract Document',
      creator: 'Epoch One',
    });

    // Set up document margins and positions
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 25; // Wider margins for better readability
    const textWidth = pageWidth - (margin * 2);
    let yPosition = margin;

    // Add logo/branding
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(50, 50, 50);
    
    yPosition += 15;

    // Add contract title
    pdf.setFontSize(24);
    pdf.setFont('helvetica', 'bold');
    const titleLines = pdf.splitTextToSize(contract.title.toUpperCase(), textWidth);
    pdf.text(titleLines, margin, yPosition);
    yPosition += 10 * titleLines.length + 15;

    // Add contract metadata
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 100, 100);
    
    const dateCreated = new Date(contract.createdAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    
    pdf.text(`Created: ${dateCreated}`, margin, yPosition + 5);
    pdf.text(`Status: ${contract.status}`, margin, yPosition + 10);
    yPosition += 25;

    // Add description if available
    if (contract.description) {
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'italic');
      const descLines = pdf.splitTextToSize(contract.description, textWidth);
      pdf.text(descLines, margin, yPosition);
      yPosition += pdf.getTextDimensions(descLines).h + 15;
    }

    // Add content
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(30, 30, 30);

    // Split content into paragraphs and add them
    const paragraphs = contract.content.split('\n\n');
    let pageNum = 1;

    for (const paragraph of paragraphs) {
      if (paragraph.trim() === '') continue;

      const lines = pdf.splitTextToSize(paragraph, textWidth);

      // Add new page if needed
      if (yPosition + (5 * lines.length) > pageHeight - margin) {
        // Add page number
        pdf.setFontSize(10);
        pdf.setTextColor(150, 150, 150);
        pdf.text(`${pageNum}`, pageWidth/2, pageHeight - 10);
        
        pdf.addPage();
        pageNum++;
        yPosition = margin;
      }

      pdf.setFontSize(11);
      pdf.setTextColor(30, 30, 30);
      pdf.text(lines, margin, yPosition);
      yPosition += 5 * lines.length + 5;
    }

    // Add signature section if there are signers
    if (contract.metadata?.signers?.length) {
      // Add new page for signatures
      if (yPosition > pageHeight - 100) {
        pdf.addPage();
        pageNum++;
        yPosition = margin;
      }

      yPosition += 20;
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('SIGNATURES', margin, yPosition);
      yPosition += 20;

      // Add signature lines for each signer
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'normal');
      
      contract.metadata.signers.forEach((signer, index) => {
        if (yPosition > pageHeight - 50) {
          pdf.addPage();
          pageNum++;
          yPosition = margin;
        }

        pdf.line(margin, yPosition, margin + 70, yPosition);
        yPosition += 5;
        pdf.text(signer, margin, yPosition);
        yPosition += 20;
      });
    }

    // Add final page number
    pdf.setFontSize(10);
    pdf.setTextColor(150, 150, 150);
    pdf.text(`${pageNum}`, pageWidth/2, pageHeight - 10);

    // Save the PDF
    const safeName = fileName || `${contract.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_contract`;
    pdf.save(`${safeName}.pdf`);

  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error('Failed to generate PDF');
  }
};