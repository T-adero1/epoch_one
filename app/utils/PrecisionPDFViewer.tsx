// app/utils/PrecisionPDFViewer.tsx
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { usePdf } from '@mikecousins/react-pdf';
import { Button } from '@/components/ui/button';

interface PDFPageInfo {
  pageNumber: number;
  width: number;
  height: number;
  scale: number;
}

interface PDFCoordinate {
  x: number; // 0-1 percentage
  y: number; // 0-1 percentage
  pageNumber: number;
}

interface DrawingBox {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  pageNumber: number;
}

interface PrecisionPDFViewerProps {
  file: string | File | Blob;
  onCoordinateClick?: (coordinate: PDFCoordinate) => void;
  onBoxDraw?: (box: {
    x: number;
    y: number;
    width: number;
    height: number;
    pageNumber: number;
  }) => void;
  overlayBoxes?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    pageNumber: number;
    id?: string;
    label?: string;
  }>;
  isDrawingMode?: boolean;
  className?: string;
}

const PrecisionPDFViewer: React.FC<PrecisionPDFViewerProps> = ({
  file,
  onCoordinateClick,
  onBoxDraw,
  overlayBoxes = [],
  isDrawingMode = false,
  className = ""
}) => {
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentDrawingBox, setCurrentDrawingBox] = useState<DrawingBox | null>(null);
  const [pageInfo, setPageInfo] = useState<Map<number, PDFPageInfo>>(new Map());
  const [pdfUrl, setPdfUrl] = useState<string>('');
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // ✅ FIX: Convert Blob/File to URL string for @mikecousins/react-pdf
  useEffect(() => {
    if (typeof file === 'string') {
      // Already a URL string
      setPdfUrl(file);
    } else if (file instanceof Blob || file instanceof File) {
      // Convert Blob/File to URL
      const url = URL.createObjectURL(file);
      setPdfUrl(url);
      
      console.log('[PrecisionPDFViewer] Created URL from Blob:', {
        blobSize: file.size,
        blobType: file.type,
        url
      });
      
      // Cleanup URL when component unmounts or file changes
      return () => {
        URL.revokeObjectURL(url);
        console.log('[PrecisionPDFViewer] Revoked URL:', url);
      };
    }
  }, [file]);

  // ✅ FIXED: Use matching worker version for pdfjs-dist@5.3.31
  const { pdfDocument, pdfPage } = usePdf({
    file: pdfUrl, // ✅ Now always a string URL
    page,
    canvasRef,
    scale,
    // ✅ FIXED: Use worker version that matches your pdfjs-dist@5.3.31
    workerSrc: `//unpkg.com/pdfjs-dist@5.3.31/build/pdf.worker.min.mjs`,
    onPageLoadSuccess: (pdfPageProxy) => {
      console.log('[PrecisionPDFViewer] Page loaded:', {
        pageNumber: page,
        originalDimensions: { 
          width: pdfPageProxy.view[2], 
          height: pdfPageProxy.view[3] 
        },
        scale
      });

      // Store page info for coordinate conversion
      const pageData: PDFPageInfo = {
        pageNumber: page,
        width: pdfPageProxy.view[2],
        height: pdfPageProxy.view[3],
        scale
      };
      
      setPageInfo(prev => new Map(prev.set(page, pageData)));
    },
    onDocumentLoadSuccess: (pdfDoc) => {
      console.log('[PrecisionPDFViewer] Document loaded successfully:', {
        numPages: pdfDoc.numPages,
        fileUrl: pdfUrl
      });
    },
    onDocumentLoadFail: (error) => {
      console.error('[PrecisionPDFViewer] Document load failed:', error);
    }
  });

  // Convert mouse event to precise PDF coordinates
  const mouseEventToPDFCoordinate = useCallback((
    event: React.MouseEvent
  ): PDFCoordinate | null => {
    if (!canvasRef.current) return null;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    // Calculate mouse position relative to canvas
    const relativeX = event.clientX - rect.left;
    const relativeY = event.clientY - rect.top;
    
    // Convert to 0-1 percentages
    const percentageX = relativeX / rect.width;
    const percentageY = relativeY / rect.height;
    
    // Ensure coordinates are within bounds
    const clampedX = Math.max(0, Math.min(1, percentageX));
    const clampedY = Math.max(0, Math.min(1, percentageY));

    const coordinate: PDFCoordinate = {
      x: clampedX,
      y: clampedY,
      pageNumber: page
    };

    console.log('[PrecisionPDFViewer] Precise coordinate conversion:', {
      mouseEvent: { clientX: event.clientX, clientY: event.clientY },
      canvasRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      relative: { x: relativeX, y: relativeY },
      percentage: { x: percentageX, y: percentageY },
      final: coordinate
    });

    return coordinate;
  }, [page]);

  // Handle mouse down for drawing/clicking
  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    const coordinate = mouseEventToPDFCoordinate(event);
    if (!coordinate) return;

    if (!isDrawingMode) {
      // Simple click mode
      if (onCoordinateClick) {
        onCoordinateClick(coordinate);
      }
      return;
    }

    // Drawing mode
    setIsDrawing(true);
    setCurrentDrawingBox({
      startX: coordinate.x,
      startY: coordinate.y,
      endX: coordinate.x,
      endY: coordinate.y,
      pageNumber: page
    });
  }, [isDrawingMode, mouseEventToPDFCoordinate, onCoordinateClick, page]);

  // Handle mouse move for drawing
  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    if (!isDrawing || !currentDrawingBox) return;

    const coordinate = mouseEventToPDFCoordinate(event);
    if (coordinate && coordinate.pageNumber === currentDrawingBox.pageNumber) {
      setCurrentDrawingBox(prev => prev ? {
        ...prev,
        endX: coordinate.x,
        endY: coordinate.y
      } : null);
    }
  }, [isDrawing, currentDrawingBox, mouseEventToPDFCoordinate]);

  // Handle mouse up for drawing
  const handleMouseUp = useCallback(() => {
    if (isDrawing && currentDrawingBox && onBoxDraw) {
      const { startX, startY, endX, endY, pageNumber } = currentDrawingBox;
      
      // Calculate final box dimensions
      const x = Math.min(startX, endX);
      const y = Math.min(startY, endY);
      const width = Math.abs(endX - startX);
      const height = Math.abs(endY - startY);
      
      // Only emit if box has meaningful size
      if (width > 0.01 && height > 0.01) { // Minimum 1% width/height
        onBoxDraw({
          x,
          y,
          width,
          height,
          pageNumber
        });
      }
    }
    
    setIsDrawing(false);
    setCurrentDrawingBox(null);
  }, [isDrawing, currentDrawingBox, onBoxDraw]);

  // Render overlay boxes for current page
  const renderPageOverlays = useCallback(() => {
    if (!canvasRef.current) return null;

    const pageBoxes = overlayBoxes.filter(box => box.pageNumber === page);
    const currentDrawing = currentDrawingBox?.pageNumber === page ? currentDrawingBox : null;
    
    return (
      <div 
        ref={overlayRef}
        className="absolute inset-0 pointer-events-none"
        style={{
          width: canvasRef.current.width,
          height: canvasRef.current.height,
        }}
      >
        {/* Existing overlay boxes */}
        {pageBoxes.map((box, index) => (
          <div
            key={box.id || `box-${page}-${index}`}
            className="absolute border-2 border-blue-500 bg-blue-100/30 pointer-events-auto"
            style={{
              left: `${box.x * 100}%`,
              top: `${box.y * 100}%`,
              width: `${box.width * 100}%`,
              height: `${box.height * 100}%`,
            }}
          >
            {box.label && (
              <div className="absolute -top-6 left-0 bg-blue-500 text-white text-xs px-2 py-1 rounded">
                {box.label}
              </div>
            )}
          </div>
        ))}
        
        {/* Current drawing box */}
        {currentDrawing && (
          <div
            className="absolute border-2 border-red-500 bg-red-100/30"
            style={{
              left: `${Math.min(currentDrawing.startX, currentDrawing.endX) * 100}%`,
              top: `${Math.min(currentDrawing.startY, currentDrawing.endY) * 100}%`,
              width: `${Math.abs(currentDrawing.endX - currentDrawing.startX) * 100}%`,
              height: `${Math.abs(currentDrawing.endY - currentDrawing.startY) * 100}%`,
            }}
          />
        )}
      </div>
    );
  }, [overlayBoxes, currentDrawingBox, page]);

  // Scale controls
  const zoomIn = useCallback(() => {
    setScale(prev => Math.min(prev * 1.2, 3.0));
  }, []);

  const zoomOut = useCallback(() => {
    setScale(prev => Math.max(prev / 1.2, 0.5));
  }, []);

  const resetZoom = useCallback(() => {
    setScale(1.0);
  }, []);

  // ✅ Don't render until we have a valid PDF URL
  if (!pdfUrl) {
    return (
      <div className={`precision-pdf-viewer ${className}`}>
        <div className="flex items-center justify-center p-8">
          <div className="text-gray-500">Preparing PDF...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`precision-pdf-viewer ${className}`}>
      {/* Controls */}
      <div className="flex items-center gap-2 p-2 border-b bg-gray-50">
        <Button
          variant="outline"
          size="sm"
          onClick={zoomOut}
        >
          Zoom Out
        </Button>
        <span className="text-sm font-mono text-gray-600">
          {Math.round(scale * 100)}%
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={zoomIn}
        >
          Zoom In
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={resetZoom}
        >
          Reset
        </Button>
        
        
      </div>

      {/* PDF Viewer */}
      <div className="overflow-auto max-h-[80vh] relative">
        {!pdfDocument && (
          <div className="flex items-center justify-center p-8">
            <div className="text-gray-500">Loading PDF...</div>
          </div>
        )}
        
        <div className="relative inline-block">
          <canvas
            ref={canvasRef}
            style={{ cursor: isDrawingMode ? 'crosshair' : 'pointer' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            className="block"
          />
          {renderPageOverlays()}
        </div>

        {/* Navigation */}
        {pdfDocument && (
          <div className="flex items-center justify-center gap-2 p-4">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span className="text-sm font-medium">
              Page {page} of {pdfDocument.numPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page === pdfDocument.numPages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PrecisionPDFViewer;

// Export utility types
export type { PDFCoordinate, PrecisionPDFViewerProps };
