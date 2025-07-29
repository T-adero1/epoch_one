'use client'

import React, { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
const PrecisionPDFViewer = dynamic(() => import('@/app/utils/PrecisionPDFViewer'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center p-8">Loading PDF viewer...</div>
});
import type { PDFCoordinate } from '@/app/utils/PrecisionPDFViewer';
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { 
  Download, 
  Upload, 

  Loader2, 
  Brain, 
  Wand2, 
  FileText, 
  Lightbulb,

  RefreshCw,
  AlertTriangle,
  Shield,

  RotateCcw,
  Pen,
  Square,
  MapPin,

  User,
  X
} from 'lucide-react'
import { toast } from '@/components/ui/use-toast'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'

interface SignaturePosition {
  signerWallet: string;
  page: number;
  x: number;        // Percentage (0.0 to 1.0) relative to PDF page
  y: number;        // Percentage (0.0 to 1.0) relative to PDF page  
  width: number;    // Percentage (0.0 to 1.0) relative to PDF page
  height: number;   // Percentage (0.0 to 1.0) relative to PDF page
}

interface PDFEditorProps {
  contract: {
    id: string;
    title: string;
    s3FileKey?: string | null;
    s3FileName?: string | null;
    s3FileSize?: number | null;
    s3ContentType?: string | null;
    isEncrypted?: boolean;
    sealAllowlistId?: string | null;
    sealDocumentId?: string | null;
    sealCapId?: string | null;
    metadata?: {
      walrus?: {
        encryption?: {
          allowlistId?: string;
          documentId?: string;
          capId?: string;
        };
      };
    } | null;
    signaturePositions?: string; // Added for existing positions
  };
  onFileUpdate?: (newFile: File) => void;
  startWithAI?: boolean;
  showDownloadButton?: boolean;
  showReplaceButton?: boolean;
  showAIButton?: boolean;
  signatureMode?: 'view' | 'edit';  // New prop for annotation mode
  signerWallets?: string[];         // Available signer wallets
  walletEmailMap?: Map<string, string>; // ✅ ADD: Email mapping
  onPositionsChange?: (positions: SignaturePosition[]) => void;
    // ✅ ADD: Initial positions prop
  onDecryptedPdfChange?: (decryptedBlob: Blob | null) => void; // ✅ NEW: Pass decrypted blob to parent
}

// **IMPROVED: More reliable encryption detection**
const isContractEncrypted = (contract: any): boolean => {
  // Priority 1: Direct encryption flags
  if (contract.isEncrypted === true) return true;
  if (contract.sealAllowlistId) return true;
  if (contract.metadata?.walrus?.encryption?.allowlistId) return true;
  
  // Priority 2: Filename indicators (most reliable fallback)
  const fileName = contract.s3FileName || contract.s3FileKey || '';
  if (fileName.includes('.encrypted.')) return true;
  
  // Priority 3: Check if filename ends with typical encrypted extensions
  if (fileName.endsWith('.encrypted.pdf')) return true;
  
  return false;
};

// Add this helper function near the top of the file
const createOrGetSessionKey = async (allowlistId: string, userAddress: string) => {
  const SEAL_PACKAGE_ID = process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID || 
    '0xb5c84864a69cb0b495caf548fa2bf0d23f6b69b131fa987d6f896d069de64429';
  const TTL_MIN = 30;

  try {
    // **UPDATED: Check cache first using allowlistId**
    const { pdfCache } = await import('@/app/utils/pdfCache');
    const cachedSessionKeyData = await pdfCache.getSessionKey(allowlistId, userAddress);
    
    if (cachedSessionKeyData) {
      console.log('[PDFEditor] Using cached session key for allowlist:', allowlistId);
      // Import session key from cache
      const { SessionKey } = await import('@mysten/seal');
      const sessionKey = SessionKey.import(cachedSessionKeyData);
      return sessionKey;
    }

    console.log('[PDFEditor] Creating new session key for allowlist:', allowlistId);
    // Create new session key (existing logic)
    const sessionData = localStorage.getItem("epochone_session");
    if (!sessionData) {
      throw new Error("No session data found");
    }
    
    const sessionObj = JSON.parse(sessionData);
    const zkLoginState = sessionObj.zkLoginState || sessionObj.user.zkLoginState;
    
    if (!zkLoginState?.ephemeralKeyPair?.privateKey) {
      throw new Error("No ephemeral key found");
    }

    const { bech32 } = await import('bech32');
    const { Ed25519Keypair } = await import('@mysten/sui/keypairs/ed25519');
    const { SuiClient, getFullnodeUrl } = await import('@mysten/sui/client');
    const { SessionKey } = await import('@mysten/seal');

    function decodeSuiPrivateKey(suiPrivateKey: string): Uint8Array {
      if (!suiPrivateKey.startsWith('suiprivkey1')) {
        throw new Error('Invalid Sui private key format');
      }
      const decoded = bech32.decode(suiPrivateKey);
      const privateKeyBytes = Buffer.from(bech32.fromWords(decoded.words));
      return new Uint8Array(privateKeyBytes.slice(1)); // Remove flag byte
    }

    const privateKeyBytes = decodeSuiPrivateKey(zkLoginState.ephemeralKeyPair.privateKey);
    const ephemeralKeypair = Ed25519Keypair.fromSecretKey(privateKeyBytes);
    const ephemeralAddress = ephemeralKeypair.getPublicKey().toSuiAddress();
    const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });

    const sessionKey = new SessionKey({
      address: ephemeralAddress,
      packageId: SEAL_PACKAGE_ID,
      ttlMin: TTL_MIN,
      signer: ephemeralKeypair,
      suiClient: suiClient as any
    });

    const personalMessage = sessionKey.getPersonalMessage();
    const signature = await ephemeralKeypair.signPersonalMessage(personalMessage);
    await sessionKey.setPersonalMessageSignature(signature.signature);

    // **UPDATED: Cache the session key using allowlistId**
    const exportedSessionKey = sessionKey.export();
    await pdfCache.storeSessionKey(allowlistId, SEAL_PACKAGE_ID, exportedSessionKey, TTL_MIN, userAddress);

    return sessionKey;
  } catch (error) {
    console.error('[PDFEditor] Session key creation failed:', error);
    throw error;
  }
};

// 🎯 ENHANCED: Fixed PDF Content Bounds Detection
class PDFCoordinateManager {
  private iframe: HTMLIFrameElement | null = null;
  private pdfPageDimensions: { width: number; height: number } | null = null;
  private displayDimensions: { width: number; height: number } | null = null;
  private scaleFactors: { x: number; y: number } | null = null;
  private iframeId: string;

  constructor(iframeId: string) {
    this.iframeId = iframeId;
  }

  /**
   * Dynamically find and cache iframe reference
   */
  private ensureIframe(): HTMLIFrameElement | null {
    if (!this.iframe) {
      this.iframe = document.querySelector(`#${this.iframeId}`) as HTMLIFrameElement;
      if (this.iframe) {
        console.log('[PDFCoordManager] ✅ Found iframe:', this.iframeId);
        // Try to extract PDF dimensions when iframe is found
        this.extractPdfDimensions();
      } else {
        console.warn('[PDFCoordManager] ❌ Iframe not found:', this.iframeId);
      }
    }
    return this.iframe;
  }

  /**
   * Extract actual PDF page dimensions from the loaded PDF
   */
  private async extractPdfDimensions(): Promise<void> {
    const iframe = this.iframe;
    if (!iframe) return;

    try {
      // Wait for iframe to load
      await new Promise<void>((resolve) => {
        if (iframe.contentDocument?.readyState === 'complete') {
          resolve();
        } else {
          iframe.addEventListener('load', () => resolve(), { once: true });
        }
      });

      // Try to get PDF dimensions from iframe content
      const iframeDocument = iframe.contentDocument;
      if (iframeDocument) {
        // Look for PDF.js viewer elements or embedded object
        const pdfViewer = iframeDocument.querySelector('.page') || 
                          iframeDocument.querySelector('embed') ||
                          iframeDocument.querySelector('object');
        
        if (pdfViewer) {
          const rect = pdfViewer.getBoundingClientRect();
          this.displayDimensions = {
            width: rect.width,
            height: rect.height
          };
          
          console.log('[PDFCoordManager] Display dimensions detected:', this.displayDimensions);
        }
      }

      // Get iframe display size
      const iframeRect = iframe.getBoundingClientRect();
      if (!this.displayDimensions) {
        this.displayDimensions = {
          width: iframeRect.width,
          height: iframeRect.height
        };
      }

      // For now, assume standard PDF page dimensions (we'll enhance this)
      // Standard US Letter: 612 x 792 points, A4: 595 x 842 points
      // We can enhance this by extracting from the actual PDF
      this.pdfPageDimensions = { width: 595, height: 842 }; // A4 default

      this.calculateScaleFactors();

    } catch (error) {
      console.warn('[PDFCoordManager] Failed to extract PDF dimensions:', error);
      // Fallback to assuming 1:1 scale
      this.scaleFactors = { x: 1, y: 1 };
    }
  }

  /**
   * Calculate scale factors between display and actual PDF dimensions
   */
  private calculateScaleFactors(): void {
    if (!this.pdfPageDimensions || !this.displayDimensions) {
      this.scaleFactors = { x: 1, y: 1 };
      return;
    }

    this.scaleFactors = {
      x: this.pdfPageDimensions.width / this.displayDimensions.width,
      y: this.pdfPageDimensions.height / this.displayDimensions.height
    };

    console.log('[PDFCoordManager] Scale factors calculated:', {
      pdfDimensions: this.pdfPageDimensions,
      displayDimensions: this.displayDimensions,
      scaleFactors: this.scaleFactors
    });
  }

  /**
   * Enhanced method to get actual PDF page dimensions from blob
   */
  async setPdfDimensionsFromBlob(pdfBlob: Blob): Promise<void> {
    try {
      const { PDFDocument } = await import('pdf-lib');
      const arrayBuffer = await pdfBlob.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const firstPage = pdfDoc.getPages()[0];
      
      if (firstPage) {
        const { width, height } = firstPage.getSize();
        this.pdfPageDimensions = { width, height };
        this.calculateScaleFactors();
        
        console.log('[PDFCoordManager] ✅ Extracted actual PDF dimensions:', {
          width,
          height,
          scaleFactors: this.scaleFactors
        });
      }
    } catch (error) {
      console.warn('[PDFCoordManager] Failed to extract PDF dimensions from blob:', error);
    }
  }

  /**
   * Get the current PDF content bounds with scale awareness
   */
  private getPdfContentBounds(): { bounds: DOMRect; scale: number } | null {
    const iframe = this.ensureIframe();
    if (!iframe) {
      console.error('[PDFCoordManager] ❌ No iframe found for coordinate calculation');
      return null;
    }

    try {
      const iframeRect = iframe.getBoundingClientRect();
      
      // Account for any potential margins or padding in the PDF viewer
      let contentBounds = new DOMRect(
        iframeRect.left,
        iframeRect.top,
        iframeRect.width,
        iframeRect.height
      );

      // If we have scale factors, we can provide better bounds info
      const scale = this.scaleFactors ? Math.min(this.scaleFactors.x, this.scaleFactors.y) : 1;
      
      return { bounds: contentBounds, scale };

    } catch (error) {
      console.error('[PDFCoordManager] Failed to get PDF bounds:', error);
      return null;
    }
  }

  /**
   * Enhanced coordinate conversion with scale factor awareness
   */
  mouseEventToPdfPercentage(event: React.MouseEvent): { x: number; y: number } | null {
    const pdfBounds = this.getPdfContentBounds();
    if (!pdfBounds) {
      console.error('[PDFCoordManager] ❌ Cannot get PDF bounds for coordinate conversion');
      return null;
    }

    const { bounds } = pdfBounds;
    
    if (bounds.width <= 0 || bounds.height <= 0) {
      console.error('[PDFCoordManager] ❌ Invalid bounds dimensions:', bounds);
      return null;
    }
    
    const relativeX = event.clientX - bounds.left;
    const relativeY = event.clientY - bounds.top;
    
    // Convert to percentages (still 0-1 range)
    let percentageX = Math.max(0, Math.min(1, relativeX / bounds.width));
    let percentageY = Math.max(0, Math.min(1, relativeY / bounds.height));

    // Apply scale factor correction if available
    if (this.scaleFactors && this.displayDimensions && this.pdfPageDimensions) {
      // Adjust for any aspect ratio differences
      const displayAspect = this.displayDimensions.width / this.displayDimensions.height;
      const pdfAspect = this.pdfPageDimensions.width / this.pdfPageDimensions.height;
      
      if (Math.abs(displayAspect - pdfAspect) > 0.01) {
        // There's an aspect ratio difference, adjust coordinates
        console.log('[PDFCoordManager] Applying aspect ratio correction:', {
          displayAspect,
          pdfAspect,
          originalCoords: { x: percentageX, y: percentageY }
        });
      }
    }

    console.log('[PDFCoordManager] Coordinate conversion:', {
      mouseCoords: { x: event.clientX, y: event.clientY },
      relativeCoords: { x: relativeX, y: relativeY },
      percentageCoords: { x: percentageX, y: percentageY },
      bounds: { width: bounds.width, height: bounds.height },
      scaleFactors: this.scaleFactors
    });
    
    return { x: percentageX, y: percentageY };
  }

  /**
   * Force refresh iframe reference and recalculate dimensions
   */
  refreshIframe(): void {
    this.iframe = null;
    this.pdfPageDimensions = null;
    this.displayDimensions = null;
    this.scaleFactors = null;
    console.log('[PDFCoordManager] 🔄 Full reset - will re-detect everything on next use');
  }

  /**
   * Validate that a signature position is within valid bounds
   */
  validatePosition(position: Partial<SignaturePosition>): boolean {
    if (typeof position.x !== 'number' || typeof position.y !== 'number' || 
        typeof position.width !== 'number' || typeof position.height !== 'number') {
      return false;
    }

    const withinBounds = 
      position.x >= 0 && position.x <= 1 &&
      position.y >= 0 && position.y <= 1 &&
      position.width > 0 && position.width <= 1 &&
      position.height > 0 && position.height <= 1 &&
      (position.x + position.width) <= 1 &&
      (position.y + position.height) <= 1;

    const minSize = 0.01; // 1% minimum
    const validSize = position.width >= minSize && position.height >= minSize;

    return withinBounds && validSize;
  }
}

export default function PDFEditor({ 
  contract, 
  onFileUpdate, 
  startWithAI = false,
  showDownloadButton = true,
  showReplaceButton = false,
  showAIButton = true,
  signatureMode = 'view',
  signerWallets = [],
  walletEmailMap = new Map(), 
  onPositionsChange,
    
  onDecryptedPdfChange
}: PDFEditorProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // **NEW: Add state for decrypted PDF**
  const [decryptedPdfBlob, setDecryptedPdfBlob] = useState<Blob | null>(null);
  const [decryptedPdfUrl, setDecryptedPdfUrl] = useState<string | null>(null);
  
  // **NEW: Track loading state to prevent double loading**
  const [hasInitialized, setHasInitialized] = useState(false);
  // **NEW: Track cache check state**
  const [isCheckingCache, setIsCheckingCache] = useState(false);
  const [cacheCheckComplete, setCacheCheckComplete] = useState(false);
  
  // ✅ ADD: Signature box drawing state
  const [signaturePositions, setSignaturePositions] = useState<SignaturePosition[]>([]);
  const [isDrawingSignatureBox, setIsDrawingSignatureBox] = useState(false);
  const [currentDrawingBox, setCurrentDrawingBox] = useState<Partial<SignaturePosition> | null>(null);
  const [selectedSignerWallet, setSelectedSignerWallet] = useState<string>('');
  const [isSignatureBoxMode, setIsSignatureBoxMode] = useState(false);
  
  // AI functionality state
  const [showAIPanel, setShowAIPanel] = useState(startWithAI);
  const [aiQuery, setAiQuery] = useState('');
  const [isAIProcessing, setIsAIProcessing] = useState(false);
  const [aiSuggestions] = useState([
    "Add professional headers and footers",
    "Format the document with better spacing",
    "Add a signature section at the end", 
    "Include page numbers and document info",
    "Convert to a more formal contract layout",
    "Add legal disclaimers and terms"
  ]);

  // ✅ ADD: State to track PDF scroll position
  const [pdfScrollPosition, setPdfScrollPosition] = useState({ x: 0, y: 0 });

  // 🎯 PRODUCTION: Initialize coordinate manager
  const [coordinateManager] = useState(() => new PDFCoordinateManager('pdf-iframe'));

  // ✅ ADD: Function to handle iframe scroll events
  const handleIframeScroll = useCallback((iframe: HTMLIFrameElement) => {
    try {
      // Access the iframe's content window and document
      const iframeWindow = iframe.contentWindow;
      const iframeDocument = iframe.contentDocument;
      
      if (iframeWindow && iframeDocument) {
        const scrollListener = () => {
          const scrollX = iframeWindow.scrollX || iframeDocument.documentElement.scrollLeft || 0;
          const scrollY = iframeWindow.scrollY || iframeDocument.documentElement.scrollTop || 0;
          
          setPdfScrollPosition({ x: scrollX, y: scrollY });
        };
        
        // Add scroll listener to the iframe content
        iframeWindow.addEventListener('scroll', scrollListener);
        iframeDocument.addEventListener('scroll', scrollListener);
        
        // Also listen for resize events that might affect scroll
        iframeWindow.addEventListener('resize', scrollListener);
        
        return () => {
          iframeWindow.removeEventListener('scroll', scrollListener);
          iframeDocument.removeEventListener('scroll', scrollListener);
          iframeWindow.removeEventListener('resize', scrollListener);
        };
      }
    } catch (error) {
      // Cross-origin restrictions might prevent access to iframe content
      console.warn('[PDFEditor] Unable to track iframe scroll due to cross-origin restrictions');
    }
  }, []);

  // ✅ ADD: Effect to set up iframe scroll tracking
  useEffect(() => {
    const iframe = document.querySelector('#pdf-iframe') as HTMLIFrameElement;
    if (iframe) {
      // Wait for iframe to load
      const setupScrollTracking = () => {
        const cleanup = handleIframeScroll(iframe);
        return cleanup;
      };
      
      if (iframe.contentDocument?.readyState === 'complete') {
        return setupScrollTracking();
      } else {
        iframe.addEventListener('load', setupScrollTracking);
        return () => {
          iframe.removeEventListener('load', setupScrollTracking);
        };
      }
    }
  }, [decryptedPdfUrl, pdfUrl, handleIframeScroll]);

  // ✅ ENHANCED: Load signature positions from props first, then contract data

  // 🎯 ENHANCED: Enhanced toggle function with proper feedback


  // 🔧 ENHANCED: Effect to refresh coordinate manager when PDF loads
  useEffect(() => {
    if (decryptedPdfUrl && coordinateManager) {
      console.log('[PDFEditor] 📄 PDF loaded, refreshing coordinate manager');
      // Give iframe time to load
      setTimeout(() => {
        coordinateManager.refreshIframe();
      }, 1000);
    }
  }, [decryptedPdfUrl, coordinateManager]);



  // 🔧 ENHANCED: More robust mouse event handlers with better error feedback
  const handleMouseDown = (e: React.MouseEvent, pageNumber: number) => {
    console.log('[PDFEditor] �� SIGNATURE BOX DRAW ATTEMPT:', {
      isSignatureBoxMode,
      selectedSignerWallet,
      signatureMode,
      pageNumber,
      signerWalletsCount: signerWallets.length,
      walletEmailMapSize: walletEmailMap.size,
      hasIframe: !!document.querySelector('#pdf-iframe'),
      conditions: {
        hasSignatureBoxMode: !!isSignatureBoxMode,
        hasSelectedSigner: !!selectedSignerWallet,
        isEditMode: signatureMode === 'edit',
        allConditionsMet: !!(isSignatureBoxMode && selectedSignerWallet && signatureMode === 'edit')
      }
    });

    // Prevent if clicking on existing signature box
    const clickedElement = e.target as HTMLElement;
    const isClickingSignatureBox = clickedElement.closest('.signature-box-container');
    
    if (isClickingSignatureBox) {
      console.log('[PDFEditor] ❌ Clicked on existing signature box, ignoring');
      return;
    }

    // 🔧 ENHANCED: More detailed condition checking with user feedback
    if (!isSignatureBoxMode) {
      console.log('[PDFEditor] ❌ Signature box mode not active');
      toast({
        title: "Drawing Mode Not Active",
        description: "Click 'Draw Signature Boxes' button to start drawing.",
        variant: "destructive"
      });
      return;
    }

    if (!selectedSignerWallet) {
      console.log('[PDFEditor] ❌ No signer selected. Available signers:', signerWallets);
      toast({
        title: "No Signer Selected",
        description: "Please select a signer from the dropdown first.",
        variant: "destructive"
      });
      return;
    }

    if (signatureMode !== 'edit') {
      console.log('[PDFEditor] ❌ Not in edit mode. Current mode:', signatureMode);
      toast({
        title: "Read-Only Mode",
        description: "Signature boxes can only be drawn in edit mode.",
        variant: "destructive"
      });
      return;
    }

    // 🔧 CRITICAL: Check if iframe exists before coordinate conversion
    const iframe = document.querySelector('#pdf-iframe');
    if (!iframe) {
      console.error('[PDFEditor] ❌ PDF iframe not found in DOM');
      toast({
        title: "PDF Not Ready",
        description: "Please wait for the PDF to load completely.",
        variant: "destructive"
      });
      return;
    }

    // Convert mouse position to PDF-relative percentage
    const pdfPosition = coordinateManager.mouseEventToPdfPercentage(e);
    if (!pdfPosition) {
      console.error('[PDFEditor] ❌ Failed to convert mouse position to PDF coordinates');
      toast({
        title: "Coordinate Error",
        description: "Could not determine position on PDF. Please try clicking closer to the center.",
        variant: "destructive"
      });
      return;
    }

    console.log('[PDFEditor] ✅ Starting signature box draw:', {
      pageNumber,
      pdfPosition,
      selectedSigner: selectedSignerWallet,
      signerEmail: walletEmailMap.get(selectedSignerWallet)
    });

    setIsDrawingSignatureBox(true);
    setCurrentDrawingBox({
      signerWallet: selectedSignerWallet,
      page: pageNumber,
      x: pdfPosition.x,
      y: pdfPosition.y,
      width: 0,
      height: 0
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawingSignatureBox || !currentDrawingBox) return;

    const currentPosition = coordinateManager.mouseEventToPdfPercentage(e);
    if (!currentPosition) return;

    // Calculate width and height from start position
    const width = Math.abs(currentPosition.x - currentDrawingBox.x!);
    const height = Math.abs(currentPosition.y - currentDrawingBox.y!);
    
    // Adjust x,y if dragging backwards
    const x = Math.min(currentDrawingBox.x!, currentPosition.x);
    const y = Math.min(currentDrawingBox.y!, currentPosition.y);

    setCurrentDrawingBox(prev => ({
      ...prev!,
      x,
      y,
      width,
      height
    }));
  };

  const handleMouseUp = () => {
    if (!isDrawingSignatureBox || !currentDrawingBox) return;

    // Validate the position before saving
    if (!coordinateManager.validatePosition(currentDrawingBox)) {
      toast({
        title: "Invalid Signature Box",
        description: "Signature box is too small or outside valid area. Please try again.",
        variant: "destructive"
      });
      
      setIsDrawingSignatureBox(false);
      setCurrentDrawingBox(null);
      return;
    }

    const newPosition: SignaturePosition = {
      signerWallet: currentDrawingBox.signerWallet!,
      page: currentDrawingBox.page!,
      x: currentDrawingBox.x!,
      y: currentDrawingBox.y!,
      width: currentDrawingBox.width!,
      height: currentDrawingBox.height!
    };

    const updatedPositions = [...signaturePositions, newPosition];
    setSignaturePositions(updatedPositions);
    
    if (onPositionsChange) {
      onPositionsChange(updatedPositions);
    }

    // Reset drawing state
    setIsDrawingSignatureBox(false);
    setCurrentDrawingBox(null);

    
  };

  // 🎯 PRODUCTION: Enhanced removeSignatureBox
  const removeSignatureBox = (index: number) => {
    if (index < 0 || index >= signaturePositions.length) {
      console.error('[PDFEditor] Invalid signature box index for removal:', index);
      return;
    }

    const position = signaturePositions[index];
    const email = walletEmailMap.get(position.signerWallet) || 'Unknown Signer';
    
    console.log('[PDFEditor] Removing signature box:', {
      index,
      email,
      position
    });

    const updatedPositions = signaturePositions.filter((_, i) => i !== index);
    setSignaturePositions(updatedPositions);
    
    if (onPositionsChange) {
      onPositionsChange(updatedPositions);
    }

    
  };

  // 🎯 PRODUCTION: Enhanced Signature Box Rendering
  const renderSignatureBoxes = (pageNumber: number) => {
    console.log('[PDFEditor] Rendering signature boxes for page:', pageNumber, {
      totalPositions: signaturePositions.length,
      positionsThisPage: signaturePositions.filter(pos => pos.page === pageNumber).length
    });

    return signaturePositions
      .filter(pos => pos.page === pageNumber)
      .map((position, index) => {
        const email = walletEmailMap.get(position.signerWallet) || 'Unknown Signer';
        const globalIndex = signaturePositions.findIndex(p => p === position);
        
        // Validate position before rendering
        if (!coordinateManager.validatePosition(position)) {
          console.warn('[PDFEditor] Skipping invalid signature position:', position);
          return null;
        }

        console.log('[PDFEditor] Rendering signature box:', {
          index: globalIndex,
          email,
          position: {
            x: `${position.x * 100}%`,
            y: `${position.y * 100}%`,
            width: `${position.width * 100}%`,
            height: `${position.height * 100}%`
          }
        });

        return (
          <div
            key={`signature-${globalIndex}-${position.signerWallet}-${position.page}`}
            className="absolute pointer-events-auto group hover:scale-105 transition-all z-20 signature-box-container"
            style={{
              left: `${position.x * 100}%`,
              top: `${position.y * 100}%`,
              width: `${position.width * 100}%`,
              height: `${position.height * 100}%`,
            }}
          >
            <div className="w-full h-full border-2 border-dashed border-blue-500 bg-blue-50/90 rounded-lg flex flex-col items-center justify-center text-xs font-medium text-blue-700 p-1 min-h-[40px]">
              <div className="text-center flex-1 flex flex-col justify-center">
                <div className="flex items-center gap-1 justify-center">
                  <User className="h-3 w-3 flex-shrink-0" />
                  <span className="text-xs">Sign Here</span>
                </div>
                <div className="text-[10px] text-blue-600 truncate w-full">{email}</div>
              </div>
              
              {/* Enhanced delete button for edit mode */}
              {signatureMode === 'edit' && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    removeSignatureBox(globalIndex);
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600 transition-colors z-30 shadow-sm"
                  title={`Remove signature box for ${email}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        );
      })
      .filter(Boolean); // Remove null entries
  };

  // 🎯 PRODUCTION: Enhanced Drawing Box Render
  const renderCurrentDrawingBox = () => {
    if (!isDrawingSignatureBox || !currentDrawingBox) return null;

    const { x = 0, y = 0, width = 0, height = 0 } = currentDrawingBox;
    
    // Don't render if too small
    if (Math.abs(width) < 0.01 || Math.abs(height) < 0.01) return null;

    return (
      <div
        className="absolute pointer-events-none z-30 border-2 border-blue-400 bg-blue-100/50 rounded"
        style={{
          left: `${x * 100}%`,
          top: `${y * 100}%`,
          width: `${Math.abs(width) * 100}%`,
          height: `${Math.abs(height) * 100}%`,
        }}
      >
        <div className="w-full h-full flex items-center justify-center text-xs text-blue-600 font-medium">
          Drawing...
        </div>
      </div>
    );
  };

  // 🎯 PRODUCTION: Responsive Updates
  useEffect(() => {
    const handleResize = () => {
      // Force coordinate manager to recalculate bounds on resize
      coordinateManager.iframe = document.querySelector('#pdf-iframe') as HTMLIFrameElement;
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [coordinateManager]);

  // 🔧 ENHANCED: Auto-select first signer when available
  useEffect(() => {
    console.log('[PDFEditor] 🔄 Signer setup effect:', {
      signerWalletsCount: signerWallets.length,
      selectedSignerWallet,
      hasEmailMap: walletEmailMap.size > 0
    });

    if (signerWallets.length > 0 && !selectedSignerWallet) {
      console.log('[PDFEditor] ✅ Auto-selecting first signer:', signerWallets[0]);
      setSelectedSignerWallet(signerWallets[0]);
    }
  }, [signerWallets, selectedSignerWallet]);

  // 🔧 ENHANCED: Debug signature box mode toggle
  const toggleSignatureBoxMode = () => {
    const newMode = !isSignatureBoxMode;

    if (newMode && !selectedSignerWallet && signerWallets.length > 0) {
      setSelectedSignerWallet(signerWallets[0]);
    }

    if (newMode && signatureMode !== 'edit') {
      toast({
        title: "Read-Only Mode",
        description: "Signature boxes can only be drawn in edit mode.",
        variant: "destructive"
      });
      return;
    }

    // Refresh iframe reference when enabling drawing mode
    if (newMode) {
      coordinateManager.refreshIframe();
    }

    setIsSignatureBoxMode(newMode);

    
  };

  // 🔧 UPDATE: Replace the existing button onClick with the enhanced function
  // Find the button around line 1118 and replace its onClick:
  /*
  <button
    onClick={toggleSignatureBoxMode}  // Use new enhanced function
    className={`px-3 h-full text-xs font-medium transition-all rounded-none w-34 flex-shrink-0 ${
      isSignatureBoxMode 
        ? 'bg-red-50 text-red-700 hover:bg-red-100' 
        : 'bg-transparent text-gray-700 hover:bg-blue-100'
    }`}
  >
  */

  // **UPDATED: Single initialization effect to prevent double loading**
  useEffect(() => {
    if (hasInitialized) return;
    
    console.log('[PDFEditor] 🚀 INITIALIZATION DEBUG:', {
      contractId: contract.id,
      hasInitialized,
      hasCallback: !!onDecryptedPdfChange,
      callbackType: typeof onDecryptedPdfChange,
      isEncrypted: isContractEncrypted(contract),
      hasS3FileKey: !!contract.s3FileKey,
      sealAllowlistId: contract.sealAllowlistId,
      sealDocumentId: contract.sealDocumentId,
      sealCapId: contract.sealCapId
    });
    
    const isEncrypted = isContractEncrypted(contract);
    console.log('[PDFEditor] Encryption detection result:', isEncrypted);
    
    if (isEncrypted) {
      console.log('[PDFEditor] Contract is encrypted - checking cache first');
      checkCacheForDecryptedPDF();
    } else if (contract.s3FileKey) {
      console.log('[PDFEditor] Contract is not encrypted - loading regular PDF');
      loadPdfUrl();
    } else {
      console.log('[PDFEditor] No PDF file available');
    }
    
    setHasInitialized(true);
  }, [contract.id, hasInitialized]);

  // **NEW: Reset when contract changes**
  useEffect(() => {
    if (hasInitialized) {
      console.log('[PDFEditor] Contract changed, resetting state');
      setHasInitialized(false);
      setCacheCheckComplete(false);
      setIsCheckingCache(false);
      
      // Clean up URLs
      if (decryptedPdfUrl) {
        URL.revokeObjectURL(decryptedPdfUrl);
      }
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
      
      // Reset state
      setDecryptedPdfBlob(null);
      setDecryptedPdfUrl(null);
      setPdfUrl(null);
      setIsLoadingPdf(false);
    }
  }, [contract.id]);

  // **UPDATED: Enhanced decryption success handler with cache integration**
  const handleDecryptionSuccess = async (decryptedBlob: Blob) => {
    console.log('[PDFEditor] PDF decrypted successfully, creating object URL');
    console.log('[PDFEditor] Decrypted blob size:', decryptedBlob.size);
    
    // Clean up previous URL if it exists
    if (decryptedPdfUrl) {
      console.log('[PDFEditor] Cleaning up previous object URL');
      URL.revokeObjectURL(decryptedPdfUrl);
    }
    
    // Create new object URL for the decrypted PDF
    const newUrl = URL.createObjectURL(decryptedBlob);
    console.log('[PDFEditor] Created new object URL:', newUrl);
    
    setDecryptedPdfBlob(decryptedBlob);
    setDecryptedPdfUrl(newUrl);

    // ✅ NEW: Extract actual PDF dimensions for accurate coordinate mapping
    await coordinateManager.setPdfDimensionsFromBlob(decryptedBlob);
    
    console.log('[PDFEditor] State updated with decrypted PDF data');
    
    // ✅ NEW: Notify parent component about decrypted blob
    if (onDecryptedPdfChange) {
      console.log('[PDFEditor] 📞 CALLING onDecryptedPdfChange callback with blob');
      onDecryptedPdfChange(decryptedBlob);
      console.log('[PDFEditor] ✅ Callback completed');
    } else {
      console.error('[PDFEditor] ❌ onDecryptedPdfChange callback is missing!');
    }
  };

  // **UPDATED: Enhanced cache check with proper state management**
  const checkCacheForDecryptedPDF = async () => {
    if (!isContractEncrypted(contract) || decryptedPdfBlob) return;
    
    setIsCheckingCache(true);
    console.log('[PDFEditor] Checking IndexDB cache for decrypted PDF...');
    
    try {
      const { pdfCache } = await import('@/app/utils/pdfCache');
      const cachedPDF = await pdfCache.getDecryptedPDF(contract.id);
      
      if (cachedPDF) {
        console.log('[PDFEditor] Found decrypted PDF in cache!');
        const blob = new Blob([cachedPDF.decryptedData], { type: 'application/pdf' });
        await handleDecryptionSuccess(blob);
      } else {
        console.log('[PDFEditor] No decrypted PDF found in cache');
      }
    } catch (error) {
      console.warn('[PDFEditor] Cache check failed:', error);
    } finally {
      setIsCheckingCache(false);
      setCacheCheckComplete(true);
      console.log('[PDFEditor] Cache check complete');
    }
  };

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (decryptedPdfUrl) {
        console.log('[PDFEditor] Cleaning up decrypted PDF URL on unmount');
        URL.revokeObjectURL(decryptedPdfUrl);
      }
      if (pdfUrl) {
        console.log('[PDFEditor] Cleaning up regular PDF URL on unmount');
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [decryptedPdfUrl, pdfUrl]);

  // **UPDATED: Only load regular PDFs (never encrypted ones)**
  const loadPdfUrl = async () => {
    if (!contract.s3FileKey) return;
    
    // **CRITICAL: Never load encrypted PDFs through this path**
    if (isContractEncrypted(contract)) {
      console.log('[PDFEditor] Refusing to load encrypted PDF through regular path');
      return;
    }
    
    console.log('[PDFEditor] Loading PDF URL for non-encrypted contract:', contract.id);
    setIsLoadingPdf(true);
    try {
      const response = await fetch(`/api/contracts/download-pdf/${contract.id}`);
      if (response.ok) {
        const data = await response.json();
        console.log('[PDFEditor] Regular PDF URL loaded successfully:', data.downloadUrl);
        setPdfUrl(data.downloadUrl);
      } else {
        throw new Error('Failed to load PDF');
      }
    } catch (error) {
      console.error('[PDFEditor] Error loading PDF:', error);
      toast({
        title: "Error Loading PDF",
        description: "Failed to load the PDF file. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingPdf(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      console.log('[PDFEditor] File selected:', file.name, file.size, file.type);
      
      if (file.type !== 'application/pdf') {
        toast({
          title: "Invalid File Type",
          description: "Please select a PDF file.",
          variant: "destructive",
        });
        return;
      }
      
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: "Please select a PDF file smaller than 10MB.",
          variant: "destructive",
        });
        return;
      }
      
      setSelectedFile(file);
    }
  };

  const handleReplaceFile = async () => {
    if (!selectedFile) return;
    
    console.log('[PDFEditor] Replacing file:', selectedFile.name);
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('contractId', contract.id);
      
      const response = await fetch('/api/contracts/upload-pdf', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Upload failed');
      }
      
      const result = await response.json();
      console.log('[PDFEditor] File replacement successful:', result);
      
      toast({
        title: "PDF Updated Successfully",
        description: `${selectedFile.name} has been uploaded.`,
        variant: "success",
      });
      
      if (onFileUpdate) {
        onFileUpdate(selectedFile);
      }
      setSelectedFile(null);
      
      // **UPDATED: Only reload if not encrypted**
      if (!isContractEncrypted(contract)) {
        console.log('[PDFEditor] Reloading PDF URL after replacement');
      await loadPdfUrl();
      } else {
        console.log('[PDFEditor] Skipping PDF URL reload for encrypted contract');
      }
      
    } catch (error) {
      console.error('[PDFEditor] Error uploading PDF:', error);
      toast({
        title: "Upload Failed",
        description: "Failed to upload PDF. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleAIEdit = async () => {
    if (!aiQuery.trim()) return;
    
    console.log('[PDFEditor] AI edit requested:', aiQuery);
    setIsAIProcessing(true);
    try {
      // For now, show a message about PDF AI editing
      toast({
        title: "AI PDF Editing",
        description: "AI PDF editing is coming soon! For now, you can download, edit externally, and re-upload.",
      });
      
      setShowAIPanel(false);
      setAiQuery('');
      
    } catch (error) {
      console.error('[PDFEditor] AI editing error:', error);
      toast({
        title: "AI Error",
        description: "AI editing failed. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAIProcessing(false);
    }
  };

  const downloadPdf = async () => {
    console.log('[PDFEditor] Download PDF requested');
    try {
      // **NEW: Handle decrypted PDF download**
      if (decryptedPdfBlob) {
        console.log('[PDFEditor] Downloading decrypted PDF blob');
        const link = document.createElement('a');
        link.href = decryptedPdfUrl!;
        link.download = contract.s3FileName?.replace('.encrypted.', '.') || 'decrypted-contract.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }
      
      // Handle regular PDF download
      console.log('[PDFEditor] Downloading regular PDF from server');
      const response = await fetch(`/api/contracts/download-pdf/${contract.id}/download`);
      if (!response.ok) throw new Error('Download failed');
      
      const data = await response.json();
      
      const link = document.createElement('a');
      link.href = data.downloadUrl;
      link.download = data.fileName || 'contract.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('[PDFEditor] Error downloading PDF:', error);
      toast({
        title: "Download Failed", 
        description: "Failed to download PDF. Please try again.",
        variant: "destructive",
      });
    }
  };


  // **UPDATED: Enhanced PDF viewer with PrecisionPDFViewer integration**
  const renderPDFViewer = () => {
    const isEncrypted = isContractEncrypted(contract);
    
    // Create a single conditional rendering helper
    const renderPDFContent = () => {
      // **ENCRYPTED PDF HANDLING**
      if (isEncrypted) {
        // Show inline decrypted PDF viewer with PrecisionPDFViewer
        if (decryptedPdfBlob && decryptedPdfUrl) {
          return (
            <div className="h-full bg-gray-100 space-y-3">
              {/* ✅ Integrated header with signature controls */}
              <div className={`p-3 md:p-4 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 transition-all ${
                isSignatureBoxMode 
                  ? 'bg-blue-50 border-blue-200' 
                  : 'bg-white border-gray-200'
              }`}>
                {/* Left side - title and status */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-red-600" />
                    <span className="font-normal text-gray-500">PDF Editor</span>
                  </div>
                  
                  {isContractEncrypted(contract) && (
                    <div className="flex items-center gap-1 ml-2">
                      <Shield className="h-3 w-3 text-purple-500" />
                      <span className="text-xs text-purple-600">Encrypted</span>
                    </div>
                  )}
                </div>
                
                {/* Right side - ALL controls in one row */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Signature controls (when in edit mode) */}
                  {signatureMode === 'edit' && signerWallets.length > 0 && (
                    <>
                      {/* Combined selector + button */}
                      <div className="flex items-center h-8 border border-blue-200 rounded-md bg-white hover:bg-blue-50 transition-colors w-80">
                        {/* Signer selector */}
                        <div className="flex-1 min-w-0 w-52">
                          <Select value={selectedSignerWallet} onValueChange={setSelectedSignerWallet}>
                            <SelectTrigger className="h-full px-3 text-xs border-0 bg-transparent hover:bg-transparent w-full rounded-none">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <User className="h-3 w-3 text-blue-600 flex-shrink-0" />
                                <span className="truncate flex-1 text-left">
                                  {(() => {
                                    const email = walletEmailMap.get(selectedSignerWallet);
                                    return email ? email : `Select Signer`;
                                  })()}
                                </span>
                              </div>
                            </SelectTrigger>
                            <SelectContent className="w-84">
                              {signerWallets.map((wallet, index) => {
                                const email = walletEmailMap.get(wallet);
                                const displayText = email ? email : `Unknown User`;
                                const isFirstWallet = index === 0;
                                
                                return (
                                  <SelectItem key={wallet} value={wallet} className="cursor-pointer">
                                    <div className="flex items-center gap-2 w-full">
                                      <div className="flex items-center gap-2 flex-1 min-w-0">
                                        {isFirstWallet ? (
                                          <div className="h-2 w-2 bg-green-500 rounded-full flex-shrink-0" title="Contract Owner" />
                                        ) : (
                                          <div className="h-2 w-2 bg-blue-500 rounded-full flex-shrink-0" title="Signer" />
                                        )}
                                        <span className="font-medium text-sm truncate flex-1">{displayText}</span>
                                      </div>
                                    </div>
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                        
                        {/* Separator line */}
                        <div className="w-px h-5 bg-blue-200 flex-shrink-0"></div>
                        
                        {/* Draw boxes button */}
                        <button
                          onClick={() => setIsSignatureBoxMode(!isSignatureBoxMode)}
                          className={`px-3 h-full text-xs font-medium transition-all rounded-none w-34 flex-shrink-0 ${
                            isSignatureBoxMode 
                              ? 'bg-red-50 text-red-700 hover:bg-red-100' 
                              : 'bg-transparent text-gray-700 hover:bg-blue-100'
                          }`}
                        >
                          <div className="flex items-center justify-center gap-1">
                            {isSignatureBoxMode ? (
                              <>
                                <RotateCcw className="h-3 w-3" />
                                <span className="whitespace-nowrap">Exit Drawing</span>
                              </>
                            ) : (
                              <>
                                <Pen className="h-3 w-3" />
                                <span className="whitespace-nowrap">Draw Signature Boxes</span>
                              </>
                            )}
                          </div>
                        </button>
                      </div>
                      
                      {/* Signature count indicator */}
                      {signaturePositions.length > 0 && (
                        <div className="flex items-center gap-1 text-xs text-blue-700 bg-blue-100 px-2 py-1 rounded-full border border-blue-200">
                          <MapPin className="h-3 w-3" />
                          <span className="font-medium">{signaturePositions.length}</span>
                          <span className="text-blue-600">
                            {signaturePositions.length === 1 ? 'box' : 'boxes'}
                          </span>
                        </div>
                      )}
                      
                      {/* Separator */}
                      <div className="w-px h-6 bg-gray-300"></div>
                    </>
                  )}
                  
                  {/* Standard PDF controls */}
                  {showDownloadButton && (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={downloadPdf} 
                      className="h-8 px-3 text-xs border-blue-200 hover:bg-blue-100"
                    >
                      <Download className="h-3 w-3 mr-1" />
                      Download
                    </Button>
                  )}

                  {showReplaceButton && (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={handleReplaceFile} 
                      className="h-8 px-3 text-xs border-blue-200 hover:bg-blue-100"
                    >
                      <Upload className="h-3 w-3 mr-1" />
                      Replace
                    </Button>
                  )}
                </div>
              </div>
              
              {/* Drawing mode indicator */}
              {isSignatureBoxMode && (
                <div className="bg-blue-100 border-b border-blue-200 p-2 text-center">
                  <div className="flex items-center justify-center gap-2 text-sm text-blue-800">
                    <Square className="h-4 w-4" />
                    <span className="font-medium">Drawing Mode Active</span>
                    <span className="text-xs opacity-75">Click and drag to create signature boxes</span>
                  </div>
                </div>
              )}
              
              {/* 🎯 NEW: PrecisionPDFViewer Integration */}
              <div className="flex-1">
                <PrecisionPDFViewer
                  file={decryptedPdfBlob}
                  isDrawingMode={isSignatureBoxMode && signatureMode === 'edit'}
                  onBoxDraw={handlePrecisionBoxDraw}
                  onCoordinateClick={handleCoordinateClick}
                  overlayBoxes={convertToPrecisionFormat()}
                  className="w-full h-full"
                />
              </div>
            </div>
          );
        }
        
        // Cache checking state
        if (isCheckingCache) {
          return (
            <div className="h-full flex items-center justify-center bg-white p-3 sm:p-6">
              <div className="w-full max-w-sm mx-auto text-center space-y-4 sm:space-y-6">
                <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-blue-100 rounded-full">
                  <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600 animate-spin" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900">Checking Cache</h3>
                  <p className="text-xs sm:text-sm text-blue-600">Looking for cached decrypted PDF...</p>
                </div>
              </div>
            </div>
          );
        }
        
        // Show AutoDecryptionView if cache check is complete and no cached PDF found
        if (cacheCheckComplete && !decryptedPdfBlob) {
          return (
            <AutoDecryptionView 
              contract={contract}
              onDecrypted={(blob) => {
                handleDecryptionSuccess(blob);
              }}
            />
          );
        }
        
        // Waiting state if cache check hasn't completed yet
        if (!cacheCheckComplete) {
          return (
            <div className="h-full flex items-center justify-center bg-white p-3 sm:p-6">
              <div className="w-full max-w-sm mx-auto text-center space-y-4 sm:space-y-6">
                <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 rounded-full">
                  <Shield className="h-6 w-6 sm:h-8 sm:w-8 text-gray-600" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900">Preparing Encrypted PDF</h3>
                  <p className="text-xs sm:text-sm text-gray-600">Initializing decryption...</p>
                </div>
              </div>
            </div>
          );
        }
      }
      
      // **REGULAR PDF HANDLING** - Only for non-encrypted contracts
      if (contract.s3FileKey && !isEncrypted && pdfUrl) {
        return (
          <div className="h-full bg-gray-100">
            <PrecisionPDFViewer
              file={pdfUrl}
              isDrawingMode={isSignatureBoxMode && signatureMode === 'edit'}
              onBoxDraw={handlePrecisionBoxDraw}
              onCoordinateClick={handleCoordinateClick}
              overlayBoxes={convertToPrecisionFormat()}
              className="w-full h-full"
            />
          </div>
        );
      }
      
      // Loading state for regular PDFs
      if (contract.s3FileKey && !isEncrypted && isLoadingPdf) {
        return (
          <div className="h-full flex items-center justify-center bg-white p-3 sm:p-6">
            <div className="w-full max-w-sm mx-auto text-center space-y-4 sm:space-y-6">
              <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-blue-100 rounded-full">
                <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600 animate-spin" />
              </div>
              <div className="space-y-2">
                <h3 className="text-base sm:text-lg font-semibold text-gray-900">Loading PDF</h3>
                <p className="text-xs sm:text-sm text-blue-600">Preparing document for viewing...</p>
              </div>
            </div>
          </div>
        );
      }
      
      // No PDF uploaded - FALLBACK
      return (
        <div className="h-full flex items-center justify-center bg-white p-3 sm:p-6">
          <div className="w-full max-w-sm mx-auto text-center space-y-4">
            <FileText className="h-10 w-10 sm:h-12 sm:w-12 mx-auto text-gray-400" />
            <div className="space-y-2">
              <h3 className="text-base sm:text-lg font-medium text-gray-900">No PDF uploaded</h3>
              <p className="text-xs sm:text-sm text-gray-600 px-2">Upload a PDF file to get started</p>
            </div>
          </div>
        </div>
      );
    };

    // **SINGLE RETURN** - No early returns!
    return renderPDFContent();
  };

  // PDFEditor.tsx - Add logging to decryptedPdfBlob state changes
  useEffect(() => {
    console.log('[PDFEditor] 📊 BLOB STATE CHANGED:', {
      hasBlob: !!decryptedPdfBlob,
      blobSize: decryptedPdfBlob?.size,
      timestamp: new Date().toISOString(),
      hasCallback: !!onDecryptedPdfChange
    });
    
    // If we have a blob but haven't notified parent yet, do it now
    if (decryptedPdfBlob && onDecryptedPdfChange) {
      console.log('[PDFEditor] 🔄 Re-triggering callback from state change');
      onDecryptedPdfChange(decryptedPdfBlob);
    }
  }, [decryptedPdfBlob]);

  // ✅ ADD: Monitor contract updates and force refresh
  useEffect(() => {
    console.log('[PDFEditor] 🔍 Contract prop changed:', {
      contractId: contract.id,
      s3FileKey: contract.s3FileKey,
      s3FileName: contract.s3FileName,
      s3FileSize: contract.s3FileSize,
      timestamp: new Date().toISOString()
    });
    
    // If we have cached data but contract file info changed, clear everything
    if (hasInitialized && contract.s3FileKey) {
      const currentSignature = `${contract.s3FileKey}-${contract.s3FileSize}`;
      const previousSignature = sessionStorage.getItem(`contract_signature_${contract.id}`);
      
      if (previousSignature && previousSignature !== currentSignature) {
        console.log('[PDFEditor] 🔄 CONTRACT FILE CHANGED - Force refresh:', {
          previousSignature,
          currentSignature,
          contractId: contract.id
        });
        
        // Clear all cached data
        if (decryptedPdfUrl) URL.revokeObjectURL(decryptedPdfUrl);
        setDecryptedPdfBlob(null);
        setDecryptedPdfUrl(null);
        setHasInitialized(false);
        setCacheCheckComplete(false);
        setIsCheckingCache(false);
        
        // Clear cache
        const clearCache = async () => {
          try {
            const { pdfCache } = await import('@/app/utils/pdfCache');
            await pdfCache.clearDecryptedPDF(contract.id);
            await pdfCache.clearEncryptedPDF(contract.id);
          } catch (error) {
            console.warn('Cache clear failed:', error);
          }
        };
        clearCache();
      }
      
      // Store new signature
      sessionStorage.setItem(`contract_signature_${contract.id}`, currentSignature);
    }
  }, [contract.id, contract.s3FileKey, contract.s3FileName, contract.s3FileSize, hasInitialized, decryptedPdfBlob, decryptedPdfUrl]);

  // Add these handler functions before the return statement in PDFEditor.tsx

  // Convert existing signature positions to PrecisionPDFViewer format
  const convertToPrecisionFormat = useCallback(() => {
    return signaturePositions.map((pos, index) => ({
      ...pos,
      id: `signature-${index}-${pos.signerWallet}`,
      label: walletEmailMap.get(pos.signerWallet) || 'Unknown Signer'
    }));
  }, [signaturePositions, walletEmailMap]);

  // Handle box drawing from PrecisionPDFViewer
  const handlePrecisionBoxDraw = useCallback((box: {
    x: number;
    y: number;
    width: number;
    height: number;
    pageNumber: number;
  }) => {
    if (!selectedSignerWallet) {
      toast({
        title: "No Signer Selected",
        description: "Please select a signer first.",
        variant: "destructive"
      });
      return;
    }

    const newPosition: SignaturePosition = {
      signerWallet: selectedSignerWallet,
      page: box.pageNumber,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height
    };

    const updatedPositions = [...signaturePositions, newPosition];
    setSignaturePositions(updatedPositions);
    
    if (onPositionsChange) {
      onPositionsChange(updatedPositions);
    }

    console.log('[PDFEditor] New signature box added via PrecisionPDFViewer:', newPosition);
  }, [selectedSignerWallet, signaturePositions, onPositionsChange, walletEmailMap]);

  // Handle coordinate clicks (for future single-click placement)
  const handleCoordinateClick = useCallback((coordinate: PDFCoordinate) => {
    console.log('[PDFEditor] Coordinate clicked:', coordinate);
    // Could be used for single-click signature placement in the future
  }, []);

  return (
    <div className="border rounded-md min-h-[700px] bg-white relative overflow-hidden">
      {/* Main Content Area */}
      <div className="relative h-[500px] sm:h-[700px]">
        {/* PDF Viewer */}
        <div className={`absolute inset-0 transition-all duration-500 ease-in-out ${
          showAIPanel ? '-translate-x-full opacity-0' : 'translate-x-0 opacity-100'
        }`}>
          {renderPDFViewer()}
                </div>
                
        {/* AI Panel - (existing AI panel code unchanged) */}
        <div className={`absolute inset-0 transition-all duration-500 ease-in-out ${
          showAIPanel ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
        }`}>
          <div className="h-full bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 flex flex-col">
            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto px-3 sm:px-4 pb-2">
              <div className="max-w-xl mx-auto space-y-3 sm:space-y-4">
                {/* AI Header */}
                <div className="text-center pt-3 pb-2">
                  <div className="inline-flex items-center justify-center w-8 h-8 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full mb-2">
                    <Brain className="h-4 w-4 text-white" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-800 mb-1">AI PDF Assistant</h3>
                  <p className="text-xs text-gray-600 max-w-sm mx-auto leading-tight px-2">
                    Describe how you'd like to improve your PDF contract
                  </p>
                </div>

                {/* AI Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    What would you like me to help you with?
                  </label>
                  <Textarea
                    value={aiQuery}
                    onChange={(e) => setAiQuery(e.target.value)}
                    placeholder="For example: 'Add professional formatting' or 'Include signature fields'..."
                    className="min-h-[70px] sm:min-h-[80px] resize-none border-2 border-purple-200 focus:border-purple-400 focus:ring-purple-400 rounded-lg text-sm"
                    disabled={isAIProcessing}
                  />
                </div>

                {/* Quick Suggestions */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <Lightbulb className="h-4 w-4" />
                    Quick Suggestions
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {aiSuggestions.map((suggestion, index) => (
                      <button
                        key={index}
                        onClick={() => setAiQuery(suggestion)}
                        disabled={isAIProcessing}
                        className="text-left p-3 sm:p-2.5 text-xs bg-white border border-purple-200 rounded-lg hover:border-purple-400 hover:bg-purple-50 transition-colors disabled:opacity-50"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Fixed Action Buttons Footer */}
            <div className="flex-shrink-0 p-3 sm:p-4 pt-2 border-t border-purple-200 bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">
              <div className="max-w-xl mx-auto">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-0">
                  <div className="text-xs text-gray-500 text-center sm:text-left">
                    <span className="sm:hidden">AI PDF editing coming soon</span>
                    <span className="hidden sm:inline">AI PDF editing feature in development</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowAIPanel(false);
                        setAiQuery('');
                      }}
                      disabled={isAIProcessing}
                      className="border-gray-300 flex-1 sm:flex-none"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleAIEdit}
                      disabled={!aiQuery.trim() || isAIProcessing}
                      className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white min-w-[100px] flex-1 sm:flex-none"
                    >
                      {isAIProcessing ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Wand2 className="h-3 w-3 mr-1" />
                          Try It
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        type="file"
        accept=".pdf"
        onChange={handleFileSelect}
        className="hidden"
        id="pdf-file-input"
      />

      {/* File replacement modal */}
      {selectedFile && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4">
            <h3 className="text-lg font-medium mb-4">Replace PDF File</h3>
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">Selected file:</p>
              <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <FileText className="h-4 w-4 text-red-600" />
                <span className="text-sm font-medium">{selectedFile.name}</span>
                <span className="text-xs text-gray-500">
                  ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                </span>
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setSelectedFile(null)}
                disabled={isUploading}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleReplaceFile}
                disabled={isUploading}
                className="flex-1"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Uploading...
                  </>
                ) : (
                  'Replace PDF'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 🔧 PRODUCTION: Debug panel */}

    </div>
  );
} 

// **UPDATED AutoDecryptionView to match working ContractDetails.tsx approach**
const AutoDecryptionView = ({ 
  contract, 
  onDecrypted 
}: { 
  contract: any; 
  onDecrypted: (blob: Blob) => void; 
}) => {
  const [decryptionStep, setDecryptionStep] = useState<string>('loading-metadata');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const autoDecrypt = async () => {
      console.log('[PDFEditor:AutoDecryptionView] Starting auto-decryption...');
      setDecryptionStep('loading-metadata');
      setError(null);
      setProgress(10);

      try {
        // **CONSTANTS**
        const SEAL_PACKAGE_ID = process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID || 
          '0xb5c84864a69cb0b495caf548fa2bf0d23f6b69b131fa987d6f896d069de64429';
        const TTL_MIN = 30;

        // Load encryption metadata
        console.log('[PDFEditor:AutoDecryptionView] Loading encryption metadata...');
        let allowlistId = contract.sealAllowlistId || contract.metadata?.walrus?.encryption?.allowlistId;
        let documentId = contract.sealDocumentId || contract.metadata?.walrus?.encryption?.documentId;
        let capId = contract.sealCapId || contract.metadata?.walrus?.encryption?.capId;

        // If missing, fetch fresh data from database
        if (!allowlistId) {
          console.log('[PDFEditor:AutoDecryptionView] Fetching fresh contract data...');
          const response = await fetch(`/api/contracts/${contract.id}`);
          if (response.ok) {
            const freshData = await response.json();
            allowlistId = freshData.sealAllowlistId || freshData.metadata?.walrus?.encryption?.allowlistId;
            documentId = freshData.sealDocumentId || freshData.metadata?.walrus?.encryption?.documentId;
            capId = freshData.sealCapId || freshData.metadata?.walrus?.encryption?.capId;
          }
        }

        if (!allowlistId || !documentId) {
          throw new Error('Encryption metadata not found. The file may still be processing.');
        }

        setProgress(20);
        setDecryptionStep('downloading');

        // Check cache first, then download from AWS if needed
        let encryptedData: ArrayBuffer;
        
        try {
          const { pdfCache } = await import('@/app/utils/pdfCache');
          const cachedPDF = await pdfCache.getEncryptedPDF(contract.id);
          
          if (cachedPDF) {
            console.log('[PDFEditor:AutoDecryptionView] Using cached encrypted PDF');
            encryptedData = cachedPDF.encryptedData.buffer as ArrayBuffer;
          } else {
            throw new Error('Not in cache');
          }
        } catch (cacheError) {
          // Fallback to AWS download
          console.log('[PDFEditor:AutoDecryptionView] Cache miss, downloading from AWS');
          const response = await fetch(`/api/contracts/download-pdf/${contract.id}?view=inline`);
          
          if (!response.ok) {
            throw new Error('Failed to download encrypted PDF from AWS');
          }

          encryptedData = await response.arrayBuffer();
          
          // Cache the downloaded encrypted data for next time
          try {
            const { pdfCache } = await import('@/app/utils/pdfCache');
            await pdfCache.storeEncryptedPDF(
              contract.id,
              new Uint8Array(encryptedData),
              contract.s3FileName || 'encrypted-contract.pdf',
              {
                allowlistId,
                documentId,
                capId: capId || '',
                isEncrypted: true
              }
            );
            console.log('[PDFEditor:AutoDecryptionView] Cached downloaded encrypted PDF');
          } catch (cacheError) {
            console.warn('[PDFEditor:AutoDecryptionView] Failed to cache downloaded PDF:', cacheError);
          }
        }

        console.log('[PDFEditor:AutoDecryptionView] Setting progress to 40%');
        setProgress(40);
        setDecryptionStep('initializing-seal');

        console.log('[PDFEditor:AutoDecryptionView] Importing required modules...');
        // Initialize SEAL client
        const { SealClient, getAllowlistedKeyServers, SessionKey } = await import('@mysten/seal');
        const { SuiClient, getFullnodeUrl } = await import('@mysten/sui/client');
        const { Ed25519Keypair } = await import('@mysten/sui/keypairs/ed25519');
        const { Transaction } = await import('@mysten/sui/transactions');
        const { fromHEX } = await import('@mysten/sui/utils');
        const { bech32 } = await import('bech32');
        const { genAddressSeed, getZkLoginSignature } = await import('@mysten/sui/zklogin');

        console.log('[PDFEditor:AutoDecryptionView] Initializing SUI client...');
        const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
        console.log('[PDFEditor:AutoDecryptionView] Initializing SEAL client...');
        const sealClient = new SealClient({
          suiClient: suiClient as any,
          serverConfigs: getAllowlistedKeyServers('testnet').map((id) => ({
            objectId: id,
            weight: 1,
          })),
          verifyKeyServers: true
        });

        // **STEP 4: Get Contract-Specific Wallet (Updated)**
        console.log('[PDFEditor:AutoDecryptionView] Setting progress to 50%');
        setProgress(50);
        setDecryptionStep('authorizing');

        console.log('[PDFEditor:AutoDecryptionView] Getting contract-specific wallet for this contract...');

        // Get session data for JWT and user info
        console.log('[PDFEditor:AutoDecryptionView] Getting session data from localStorage...');
        const sessionData = localStorage.getItem("epochone_session");
        if (!sessionData) {
          throw new Error("No session data found in localStorage");
        }
        
        const sessionObj = JSON.parse(sessionData);
        const zkLoginState = sessionObj.zkLoginState || sessionObj.user.zkLoginState;
        
        if (!zkLoginState?.jwt) {
          throw new Error("No JWT found in session data");
        }

        // Get user info from session
        console.log('[PDFEditor:AutoDecryptionView] Extracting user info from session...');
        const userAddress = sessionObj.user?.address || sessionObj.userAddress;
        const userGoogleId = sessionObj.user?.googleId || sessionObj.userGoogleId;

        if (!userAddress || !userGoogleId) {
          throw new Error('User address or Google ID not found in session');
        }

        // **FIX: Import what actually exists**
        console.log('[PDFEditor:AutoDecryptionView] Importing contract wallet utilities...');
        const { getOrCreateContractWallet } = await import('@/app/utils/contractWallet');

        console.log('[PDFEditor:AutoDecryptionView] Creating/retrieving contract-specific wallet...');

        // **KEY: Create contract-specific wallet with encrypted Google ID**
        const contractWallet = await getOrCreateContractWallet(userGoogleId, contract.id, zkLoginState.jwt);

        console.log('[PDFEditor:AutoDecryptionView] Contract-specific wallet ready:', {
          contractId: contract.id,
          walletAddress: contractWallet.address.substring(0, 8) + '...',
          isContractSpecific: true
        });

        // ✅ FIX: Use ORIGINAL session zkLogin state for signing (not contract-specific)
        console.log('[PDFEditor:AutoDecryptionView] Setting up zkLogin state...');
        const originalZkState = zkLoginState; // Original session state

        const originalJwt = originalZkState.jwt;
        const originalZkProofs = originalZkState.zkProofs;
        const originalMaxEpoch = originalZkState.maxEpoch;
        // **UPDATED: Get the contract-specific ephemeral keypair from the wallet itself**
        const ephemeralKeypair = contractWallet.ephemeralKeyPair;
         // This is the real keypair instance

        if (!ephemeralKeypair) {
          throw new Error('Ephemeral keypair not found in contract wallet');
        }

        // **UPDATED: Use contract-specific address instead of general ephemeral**
        const ephemeralAddress = contractWallet.address; // Contract-specific address
        console.log('[PDFEditor:AutoDecryptionView] Using contract-specific ephemeral address:', ephemeralAddress);

        // **Continue with authorization using contract-specific credentials**
        console.log('[PDFEditor:AutoDecryptionView] Setting progress to 60%');
        setProgress(60);
        setDecryptionStep('creating-session');

        // **NEW: Get the ephemeral keypair's public key address**
        const ephemeralPublicKeyAddress = ephemeralKeypair.getPublicKey().toSuiAddress();

        // Format document ID
        console.log('[PDFEditor:AutoDecryptionView] Formatting document ID...');
        const docId = documentId.startsWith('0x') ? documentId.substring(2) : documentId;

        // Authorize contract-specific ephemeral key with sponsored transaction
        console.log('[PDFEditor:AutoDecryptionView] Requesting sponsored transaction...');

        // **FIX: Use correct addresses for sponsor parameters**
        console.log('[PDFEditor:AutoDecryptionView] 🔍 Sponsor transaction addresses:');
        console.log('[PDFEditor:AutoDecryptionView] Sender (contract-specific, on allowlist):', contractWallet.address);
        console.log('[PDFEditor:AutoDecryptionView] EphemeralAddress (public key, for signing):', ephemeralPublicKeyAddress);

        const sponsorResponse = await fetch('/api/auth/sponsor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: contractWallet.address,           // ✅ Contract-specific address (on allowlist)
            allowlistId,
            ephemeralAddress: ephemeralPublicKeyAddress, // ✅ Ephemeral public key address (for signing)
            documentId: docId,
            validityMs: 60 * 60 * 1000
          })
        });

        if (!sponsorResponse.ok) {
          const errorText = await sponsorResponse.text();
          throw new Error(`Sponsorship failed: ${sponsorResponse.status} ${errorText}`);
        }
        
        const { sponsoredTxBytes } = await sponsorResponse.json();
        console.log('[PDFEditor:AutoDecryptionView] Got sponsored transaction bytes');
        
        // Sign the sponsored bytes with ephemeral key
        console.log('[PDFEditor:AutoDecryptionView] Signing sponsored transaction...');
        const { fromB64 } = await import('@mysten/sui/utils');
        const txBlock = Transaction.from(fromB64(sponsoredTxBytes));
        const { signature: userSignature } = await txBlock.sign({
          client: suiClient,
          signer: ephemeralKeypair  // Contract-specific ephemeral keypair (same as session)
        });
        
        // ✅ FIX: Use contract-specific salt for address seed (matches the address being used)
        const contractZkState = contractWallet.zkLoginState;
        const contractSalt = contractZkState.salt;
        const contractZkProofs = contractZkState.zkProofs; // Contract-specific salt   

        if (!contractSalt || !originalJwt || !contractZkProofs || !originalMaxEpoch) {
          throw new Error("Missing zkLogin state data");
        }
        
        // ✅ Create address seed using CONTRACT-SPECIFIC salt (matches ephemeralAddress)
        console.log('[PDFEditor:AutoDecryptionView] Generating address seed...');
        const jwtBody = JSON.parse(atob(originalJwt.split('.')[1]));
        const addressSeed = genAddressSeed(
          BigInt(contractSalt),      // ✅ Contract-specific salt (matches contractWallet.address)
          'sub',
          jwtBody.sub,              // ✅ Original subject (matches zkProofs)
          jwtBody.aud
        ).toString();
        
        console.log('[PDFEditor:AutoDecryptionView] Generating zkLogin signature...');
        const zkLoginSignature = getZkLoginSignature({
          inputs: {
            ...contractZkProofs,     // ✅ Contract-specific zkProofs (generated with contract salt)
            addressSeed,             // ✅ Address seed from contract salt
          },
          maxEpoch: originalMaxEpoch,
          userSignature,
        });
        
        // Execute authorization
        console.log('[PDFEditor:AutoDecryptionView] Executing authorization...');
        const executeResponse = await fetch('/api/auth/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sponsoredTxBytes,
            zkLoginSignature
          })
        });
        
        if (!executeResponse.ok) {
          const errorText = await executeResponse.text();
          throw new Error(`Execution failed: ${executeResponse.status} ${errorText}`);
        }
        
        const { digest } = await executeResponse.json();
        
        // Wait for transaction confirmation
        console.log('[PDFEditor:AutoDecryptionView] Waiting for transaction confirmation...');
        await suiClient.waitForTransaction({
          digest: digest,
          options: { showEffects: true }
        });

        console.log('[PDFEditor:AutoDecryptionView] Setting progress to 70%');
        setProgress(70);
        setDecryptionStep('fetching-keys');

        // Create session key with contract-specific credentials
        console.log('[PDFEditor:AutoDecryptionView] Creating session key...');

        console.log('[PDFEditor:AutoDecryptionView] 🔍 Address debugging:');
        console.log('[PDFEditor:AutoDecryptionView] Contract-specific zkLogin address:', ephemeralAddress);
        console.log('[PDFEditor:AutoDecryptionView] Ephemeral keypair public key address:', ephemeralPublicKeyAddress);
        console.log('[PDFEditor:AutoDecryptionView] Using for SessionKey:', ephemeralPublicKeyAddress);

        console.log('[PDFEditor:AutoDecryptionView] Creating new SessionKey with params:', {
          address: ephemeralPublicKeyAddress,  // ✅ Use ephemeral public key address
          packageId: SEAL_PACKAGE_ID,
          ttlMin: TTL_MIN,
          hasKeypair: !!ephemeralKeypair,
          hasSuiClient: !!suiClient
        });

        // ✅ FIX: Use ephemeral keypair's public key address for SessionKey
        const sessionKey = new SessionKey({
          address: ephemeralPublicKeyAddress,  // This will match signer.getPublicKey().toSuiAddress()
          packageId: SEAL_PACKAGE_ID,
          ttlMin: TTL_MIN,
          signer: ephemeralKeypair,           // Same ephemeral keypair
          suiClient: suiClient as any
        });

        console.log('[PDFEditor:AutoDecryptionView] SessionKey created successfully:', {
          address: sessionKey.getAddress(),
          packageId: sessionKey.getPackageId(),
          creationTime: new Date(sessionKey.export().creationTimeMs).toISOString(),
          ttlMin: sessionKey.export().ttlMin,
          isExpired: sessionKey.isExpired()
        });
        
        // Sign personal message with contract-specific key
        console.log('[PDFEditor:AutoDecryptionView] Signing personal message...');
        const personalMessage = sessionKey.getPersonalMessage();
        const signature = await ephemeralKeypair.signPersonalMessage(personalMessage);
        await sessionKey.setPersonalMessageSignature(signature.signature);
        
        // Create seal_approve transaction with contract-specific address
        console.log('[PDFEditor:AutoDecryptionView] Creating seal_approve transaction...');
        const tx = new Transaction();
        tx.setSender(ephemeralAddress);  // Contract-specific address as sender
        
        const rawId = docId.startsWith('0x') ? docId.substring(2) : docId;
        const documentIdBytes = fromHEX(rawId);

        tx.moveCall({
          target: `${SEAL_PACKAGE_ID}::allowlist::seal_approve`,
          arguments: [
            tx.pure.vector('u8', Array.from(documentIdBytes)),
            tx.object(allowlistId),
            tx.object('0x6')
          ]
        });
        
        const txKindBytes = await tx.build({ 
          client: suiClient, 
          onlyTransactionKind: true
        });

        // Fetch keys
        console.log('[PDFEditor:AutoDecryptionView] Fetching decryption keys...');
        await sealClient.fetchKeys({
          ids: [rawId],
          txBytes: txKindBytes,
          sessionKey,
          threshold: 1
        });

        console.log('[PDFEditor:AutoDecryptionView] Setting progress to 90%');
        setProgress(90);
        setDecryptionStep('decrypting');

        // Decrypt the data
        console.log('[PDFEditor:AutoDecryptionView] Decrypting data...');
        const decryptedData = await sealClient.decrypt({
          data: new Uint8Array(encryptedData),
          sessionKey: sessionKey,
          txBytes: txKindBytes
        });

        console.log('[PDFEditor:AutoDecryptionView] Setting progress to 100%');
        setProgress(100);
        setDecryptionStep('complete');

        // Create blob and call success handler
        console.log('[PDFEditor:AutoDecryptionView] Creating decrypted blob...');
        const decryptedBlob = new Blob([decryptedData], { type: 'application/pdf' });
        onDecrypted(decryptedBlob);

      } catch (err) {
        console.error('[PDFEditor:AutoDecryptionView] Auto-decryption failed:', err);
        setError(err instanceof Error ? err.message : 'Failed to decrypt PDF automatically');
        setDecryptionStep('error');
      }
    };

    autoDecrypt();
  }, [contract.id]);

  const getStepMessage = () => {
    switch (decryptionStep) {
      case 'loading-metadata': return 'Loading encryption metadata...';
      case 'downloading': return 'Downloading encrypted PDF...';
      case 'initializing-seal': return 'Initializing SEAL client...';
      case 'authorizing': return 'Authorizing ephemeral key...';
      case 'creating-session': return 'Creating decryption session...';
      case 'fetching-keys': return 'Fetching decryption keys...';
      case 'decrypting': return 'Decrypting PDF data...';
      case 'complete': return 'Decryption complete!';
      case 'error': return 'Decryption failed';
      default: return 'Processing...';
    }
  };

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-white p-3 sm:p-6">
        <div className="w-full max-w-sm mx-auto text-center space-y-4 sm:space-y-6">
          <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-red-100 rounded-full">
            <AlertTriangle className="h-6 w-6 sm:h-8 sm:w-8 text-red-600" />
          </div>
          <div className="space-y-2">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900">Auto-Decryption Failed</h3>
            <p className="text-xs sm:text-sm text-red-600">{error}</p>
          </div>
          <Button
            onClick={() => window.location.reload()}
            variant="outline"
            className="text-sm"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center bg-white p-3 sm:p-6">
      <div className="w-full max-w-sm mx-auto text-center space-y-4 sm:space-y-6">
        <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-purple-100 rounded-full">
          <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 text-purple-600 animate-spin" />
        </div>
        <div className="space-y-2">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 break-words px-2">
            Auto-Decrypting PDF
          </h3>
          <p className="text-xs sm:text-sm text-purple-600">
            Starting decryption process...
          </p>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-purple-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="pt-2 text-xs text-gray-500 leading-relaxed">
          Decryption happens entirely on your device
        </div>
      </div>
    </div>
  );
}; 