import { PDFDocument, rgb } from 'pdf-lib';

export async function addSignatureBoxesToPDF(
  pdfBytes: Uint8Array,
  signaturePositions: SignaturePosition[],
  walletEmailMap: Map<string, string>
): Promise<Uint8Array> {
  
  console.log('[PDF-MOD] Starting PDF signature box embedding', {
    pdfSize: pdfBytes.length,
    signatureBoxCount: signaturePositions.length,
    startTime: performance.now()
  });
  
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  
  console.log('[PDF-MOD] PDF loaded successfully', {
    pageCount: pages.length,
  });
  
  let boxesAdded = 0;
  let boxesSkipped = 0;
  
  signaturePositions.forEach((position, index) => {
    const pageIndex = position.page - 1;
    
    if (pageIndex >= pages.length) {
      console.warn('[PDF-MOD] Skipping signature box - page out of range', {
        boxIndex: index,
        requestedPage: position.page,
        availablePages: pages.length
      });
      boxesSkipped++;
      return;
    }
    
    const page = pages[pageIndex];
    const { width: pageWidth, height: pageHeight } = page.getSize();
    
    // Convert percentages to absolute coordinates
    const x = position.x * pageWidth;
    const y = pageHeight - (position.y * pageHeight) - (position.height * pageHeight);
    const width = position.width * pageWidth;
    const height = position.height * pageHeight;
    
    const signerEmail = walletEmailMap.get(position.signerWallet) || 'Unknown Signer';
    
    console.log('[PDF-MOD] Adding signature box to PDF', {
      boxIndex: index,
      signer: signerEmail,
      page: position.page,
      percentageCoords: { x: position.x, y: position.y, width: position.width, height: position.height },
      absoluteCoords: { x, y, width, height },
      pageSize: { pageWidth, pageHeight }
    });
    
    // Add signature box to PDF
    page.drawRectangle({
      x, y, width, height,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
      opacity: 1,
    });
    
    
    
    boxesAdded++;
  });
  
  const modifiedPdfBytes = await pdfDoc.save();
  
  console.log('[PDF-MOD] PDF signature box embedding completed', {
    boxesAdded,
    boxesSkipped,
    originalSize: pdfBytes.length,
    modifiedSize: modifiedPdfBytes.length,
    sizeDifference: modifiedPdfBytes.length - pdfBytes.length,
    processingTime: Math.round(performance.now())
  });
  
  return modifiedPdfBytes;
}
