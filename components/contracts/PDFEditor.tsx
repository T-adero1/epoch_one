'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { 
  Download, 
  Upload, 
  Sparkles, 
  Loader2, 
  Brain, 
  Wand2, 
  FileText, 
  Lightbulb,

  RefreshCw,
  AlertTriangle,
  Shield,
  ExternalLink,
  RotateCcw,
  Pen,
  Square,
  MapPin,
  Users,
  Trash2,
  User
} from 'lucide-react'
import { toast } from '@/components/ui/use-toast'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'

interface SignaturePosition {
  signerWallet: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
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

export default function PDFEditor({ 
  contract, 
  onFileUpdate, 
  startWithAI = false,
  showDownloadButton = true,
  showReplaceButton = false,
  showAIButton = true,
  signatureMode = 'view',
  signerWallets = [],
  walletEmailMap = new Map(), // ✅ ADD: Default empty map
  onPositionsChange
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

  // ✅ ADD: Signature box drawing handlers
  const handleMouseDown = (e: React.MouseEvent, pageNumber: number) => {
    console.log('[PDFEditor] Mouse down:', { isSignatureBoxMode, selectedSignerWallet, signatureMode });
    if (!isSignatureBoxMode || !selectedSignerWallet || signatureMode !== 'edit') return;
    
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // ✅ FIXED: Add scroll position to coordinates
    const x = e.clientX - rect.left + pdfScrollPosition.x;
    const y = e.clientY - rect.top + pdfScrollPosition.y;
    
    console.log('[PDFEditor] Starting signature box draw at:', { 
      x, 
      y, 
      pageNumber, 
      scrollX: pdfScrollPosition.x, 
      scrollY: pdfScrollPosition.y 
    });
    
    setIsDrawingSignatureBox(true);
    setCurrentDrawingBox({
      signerWallet: selectedSignerWallet,
      page: pageNumber,
      x,
      y,
      width: 0,
      height: 0
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawingSignatureBox || !currentDrawingBox) return;
    
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // ✅ FIXED: Add scroll position to coordinates
    const currentX = e.clientX - rect.left + pdfScrollPosition.x;
    const currentY = e.clientY - rect.top + pdfScrollPosition.y;
    
    setCurrentDrawingBox(prev => ({
      ...prev!,
      width: currentX - prev!.x!,
      height: currentY - prev!.y!
    }));
  };

  // ✅ ENHANCED: Add debugging to handleMouseUp
  const handleMouseUp = () => {
    if (!isDrawingSignatureBox || !currentDrawingBox || 
        !currentDrawingBox.width || !currentDrawingBox.height ||
        Math.abs(currentDrawingBox.width) < 20 || Math.abs(currentDrawingBox.height) < 10) {
      console.log('[PDFEditor] DEBUG - Signature box creation cancelled:', {
        isDrawing: isDrawingSignatureBox,
        hasCurrentBox: !!currentDrawingBox,
        width: currentDrawingBox?.width,
        height: currentDrawingBox?.height
      });
      setIsDrawingSignatureBox(false);
      setCurrentDrawingBox(null);
      return;
    }
    
    const newPosition: SignaturePosition = {
      signerWallet: currentDrawingBox.signerWallet!,
      page: currentDrawingBox.page!,
      x: Math.min(currentDrawingBox.x!, currentDrawingBox.x! + currentDrawingBox.width!),
      y: Math.min(currentDrawingBox.y!, currentDrawingBox.y! + currentDrawingBox.height!),
      width: Math.abs(currentDrawingBox.width!),
      height: Math.abs(currentDrawingBox.height!)
    };
    
    const updatedPositions = [...signaturePositions, newPosition];
    
    console.log('[PDFEditor] DEBUG - New signature box created:', {
      newPosition,
      totalPositions: updatedPositions.length,
      allPositions: updatedPositions,
      hasCallback: !!onPositionsChange
    });
    
    setSignaturePositions(updatedPositions);
    
    // ✅ CRITICAL: Make sure callback is called
    if (onPositionsChange) {
      console.log('[PDFEditor] DEBUG - Calling onPositionsChange callback with:', updatedPositions);
      onPositionsChange(updatedPositions);
    } else {
      console.warn('[PDFEditor] WARNING - onPositionsChange callback is not provided!');
    }
    
    setIsDrawingSignatureBox(false);
    setCurrentDrawingBox(null);
    
    toast({
      title: "Signature Box Added",
      description: `Added signature box for ${selectedSignerWallet.substring(0, 8)}... (Total: ${updatedPositions.length})`,
      variant: "success",
    });
  };

  // ✅ ENHANCED: Add debugging to removeSignatureBox
  const removeSignatureBox = (index: number) => {
    const updatedPositions = signaturePositions.filter((_, i) => i !== index);
    
    console.log('[PDFEditor] DEBUG - Signature box removed:', {
      removedIndex: index,
      remainingPositions: updatedPositions.length,
      allPositions: updatedPositions,
      hasCallback: !!onPositionsChange
    });
    
    setSignaturePositions(updatedPositions);
    
    // ✅ CRITICAL: Make sure callback is called for removals too
    if (onPositionsChange) {
      console.log('[PDFEditor] DEBUG - Calling onPositionsChange callback after removal with:', updatedPositions);
      onPositionsChange(updatedPositions);
    } else {
      console.warn('[PDFEditor] WARNING - onPositionsChange callback is not provided for removal!');
    }
  };

  // ✅ ADD: Props from parent component
  useEffect(() => {
    if (signerWallets.length > 0 && !selectedSignerWallet) {
      setSelectedSignerWallet(signerWallets[0]);
    }
  }, [signerWallets, selectedSignerWallet]);

  // ✅ ADD: Signature box rendering function with improved visuals
  const renderSignatureBoxes = (pageNumber: number) => (
    <>
      {/* Existing signature boxes with enhanced styling */}
      {signaturePositions
        .filter(pos => pos.page === pageNumber)
        .map((position, index) => {
          const email = walletEmailMap.get(position.signerWallet);
          const displayLabel = email ? email.split('@')[0] : position.signerWallet.substring(0, 8) + '...';
          
          // ✅ NEW: Different color schemes for different signers
          const colorSchemes = [
            { border: 'border-emerald-400', bg: 'bg-emerald-50', label: 'bg-emerald-500', text: 'text-emerald-700', shadow: 'shadow-emerald-200' },
            { border: 'border-blue-400', bg: 'bg-blue-50', label: 'bg-blue-500', text: 'text-blue-700', shadow: 'shadow-blue-200' },
            { border: 'border-purple-400', bg: 'bg-purple-50', label: 'bg-purple-500', text: 'text-purple-700', shadow: 'shadow-purple-200' },
            { border: 'border-rose-400', bg: 'bg-rose-50', label: 'bg-rose-500', text: 'text-rose-700', shadow: 'shadow-rose-200' },
            { border: 'border-amber-400', bg: 'bg-amber-50', label: 'bg-amber-500', text: 'text-amber-700', shadow: 'shadow-amber-200' }
          ];
          
          const colorScheme = colorSchemes[index % colorSchemes.length];
          const isFirstSigner = index === 0; // Owner is usually first
          
          return (
            <div
              key={index}
              className={`absolute pointer-events-auto group transition-all duration-300 hover:scale-105 ${
                signatureMode === 'edit' 
                  ? 'hover:shadow-lg cursor-pointer' 
                  : 'hover:shadow-md'
              }`}
              style={{
                // ✅ FIXED: Subtract scroll position to keep boxes aligned with PDF content
                left: position.x - pdfScrollPosition.x,
                top: position.y - pdfScrollPosition.y,
                width: position.width,
                height: position.height,
              }}
            >
              {/* ✅ ENHANCED: Main signature box with gradient border and shadow */}
              <div className={`
                relative w-full h-full rounded-lg transition-all duration-300 group-hover:scale-[1.02]
                ${colorScheme.border} ${colorScheme.bg} ${colorScheme.shadow}
                border-2 border-dashed shadow-md bg-opacity-60
                backdrop-blur-sm
              `}>
                
                {/* ✅ NEW: Signature icon and placeholder text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center p-2">
                  <div className={`flex items-center gap-1 ${colorScheme.text} opacity-75`}>
                    {isFirstSigner ? (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M9.243 3.03a1 1 0 01.727 1.213L9.53 6h2.94l.56-2.243a1 1 0 111.94.486L14.53 6H16a1 1 0 110 2h-1.92l-1 4H15a1 1 0 110 2h-2.38l-.56 2.242a1 1 0 11-1.94-.485L10.47 14H7.53l-.56 2.242a1 1 0 11-1.94-.485L5.47 14H4a1 1 0 110-2h1.92l1-4H5a1 1 0 110-2h2.38l.56-2.243a1 1 0 011.213-.727zM9.53 8l-1 4h2.94l1-4H9.53z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.828 2.828 0 114 4L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    )}
                    <span className="text-xs font-medium hidden group-hover:inline">
                      {isFirstSigner ? 'Your signature' : 'Your client\'s signature'}
                    </span>
                  </div>
                  
                  {/* ✅ NEW: Decorative signature line */}
                  <div className={`mt-1 w-full max-w-[80%] h-px ${colorScheme.border.replace('border-', 'bg-')} opacity-50`}></div>
                </div>
                
                {/* ✅ NEW: Corner indicator for signer type */}
                {isFirstSigner && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-gradient-to-br from-yellow-400 to-yellow-500 rounded-full border border-white shadow-sm">
                    <div className="absolute inset-0.5 bg-gradient-to-br from-yellow-300 to-yellow-400 rounded-full"></div>
                  </div>
                )}
              </div>
              
              {/* ✅ ENHANCED: Label with improved styling and animations */}
              <div className="absolute -top-1 left-0 transform -translate-y-full">
                <div className={`
                  ${colorScheme.label} text-white text-xs px-3 py-1.5 rounded-t-lg rounded-br-lg
                  font-medium shadow-sm flex items-center gap-2 whitespace-nowrap
                  transition-all duration-300 group-hover:shadow-md
                  ${signatureMode === 'edit' ? 'group-hover:-translate-y-0.5' : ''}
                `}>
                  {/* ✅ NEW: User avatar/icon */}
                  <div className="w-4 h-4 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                    {isFirstSigner ? (
                      <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M9.243 3.03a1 1 0 01.727 1.213L9.53 6h2.94l.56-2.243a1 1 0 111.94.486L14.53 6H16a1 1 0 110 2h-1.92l-1 4H15a1 1 0 110 2h-2.38l-.56 2.242a1 1 0 11-1.94-.485L10.47 14H7.53l-.56 2.242a1 1 0 11-1.94-.485L5.47 14H4a1 1 0 110-2h1.92l1-4H5a1 1 0 110-2h2.38l.56-2.243a1 1 0 011.213-.727zM9.53 8l-1 4h2.94l1-4H9.53z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <User className="w-2.5 h-2.5 text-white" />
                    )}
                  </div>
                  
                  <span className="font-medium">{displayLabel}</span>
                  
                  {/* ✅ ENHANCED: Delete button with improved styling */}
                  {signatureMode === 'edit' && (
                    <button
                      onClick={() => removeSignatureBox(signaturePositions.indexOf(position))}
                      className="ml-1 opacity-0 group-hover:opacity-100 transition-all duration-200 hover:scale-110 hover:bg-white hover:bg-opacity-20 rounded p-0.5"
                      title="Remove signature box"
                    >
                      <Trash2 className="h-3 w-3 text-white" />
                    </button>
                  )}
                </div>
                
                {/* ✅ NEW: Small connection line from label to box */}
                <div className={`absolute top-full left-3 w-px h-1 ${colorScheme.label}`}></div>
              </div>
            </div>
          );
        })}
      
      {/* ✅ ENHANCED: Currently drawing box with scroll compensation */}
      {isDrawingSignatureBox && currentDrawingBox && currentDrawingBox.page === pageNumber && (
        <div
          className="absolute pointer-events-none transition-all duration-150"
          style={{
            // ✅ FIXED: Subtract scroll position for drawing box too
            left: Math.min(currentDrawingBox.x!, currentDrawingBox.x! + (currentDrawingBox.width || 0)) - pdfScrollPosition.x,
            top: Math.min(currentDrawingBox.y!, currentDrawingBox.y! + (currentDrawingBox.height || 0)) - pdfScrollPosition.y,
            width: Math.abs(currentDrawingBox.width || 0),
            height: Math.abs(currentDrawingBox.height || 0),
          }}
        >
          {/* ✅ NEW: Animated drawing preview with gradient border */}
          <div className="relative w-full h-full">
            {/* Outer glow effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg blur-sm opacity-30 animate-pulse"></div>
            
            {/* Main drawing box */}
            <div className="relative w-full h-full border-2 border-dashed border-blue-500 bg-gradient-to-br from-blue-100 to-purple-100 bg-opacity-60 rounded-lg backdrop-blur-sm">
              {/* Drawing indicator */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex items-center gap-2 text-blue-600 opacity-75">
                  <svg className="w-4 h-4 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.828 2.828 0 114 4L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  <span className="text-xs font-medium">Drawing...</span>
                </div>
              </div>
              
              {/* Animated corner indicators */}
              <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-blue-500 animate-pulse"></div>
              <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-blue-500 animate-pulse"></div>
              <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-blue-500 animate-pulse"></div>
              <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-blue-500 animate-pulse"></div>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // **UPDATED: Single initialization effect to prevent double loading**
  useEffect(() => {
    if (hasInitialized) return;
    
    console.log('[PDFEditor] Initializing component with contract:', {
      contractId: contract.id,
      title: contract.title,
      s3FileKey: contract.s3FileKey,
      s3FileName: contract.s3FileName,
      isEncrypted: contract.isEncrypted,
      sealAllowlistId: contract.sealAllowlistId,
      sealDocumentId: contract.sealDocumentId,
      sealCapId: contract.sealCapId,
      metadata: contract.metadata,
      walrusEncryption: contract.metadata?.walrus?.encryption
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
    
    // **NEW: Cache the decrypted PDF for future use**
    try {
      const { pdfCache } = await import('@/app/utils/pdfCache');
      await pdfCache.storeDecryptedPDF(
        contract.id,
        new Uint8Array(await decryptedBlob.arrayBuffer()),
        contract.s3FileName || 'decrypted-contract.pdf'
      );
      console.log('[PDFEditor] Cached decrypted PDF in IndexDB');
    } catch (cacheError) {
      console.warn('[PDFEditor] Failed to cache decrypted PDF:', cacheError);
    }
    
    console.log('[PDFEditor] State updated with decrypted PDF data');
    
    toast({
      title: "PDF Decrypted Successfully",
      description: "Your encrypted PDF is now ready to view and edit.",
      variant: "success",
    });
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

  // **NEW: Clear decrypted data to force re-decryption**
  const handleRedecrypt = async () => {
    console.log('[PDFEditor] Clearing decrypted data to force re-decryption');
    
    // Clean up current URLs
    if (decryptedPdfUrl) {
      URL.revokeObjectURL(decryptedPdfUrl);
    }
    
    // Clear state
    setDecryptedPdfBlob(null);
    setDecryptedPdfUrl(null);
    setCacheCheckComplete(false);
    
    // Clear cache
    try {
      const { pdfCache } = await import('@/app/utils/pdfCache');
      await pdfCache.clearDecryptedPDF(contract.id);
      console.log('[PDFEditor] Cleared cached decrypted PDF');
    } catch (error) {
      console.warn('[PDFEditor] Failed to clear cache:', error);
    }
    
    toast({
      title: "Cache Cleared",
      description: "Re-decrypting PDF...",
    });
  };

  // **UPDATED: Enhanced PDF viewer with cache check prevention**
  const renderPDFViewer = () => {
    console.log('[PDFEditor] Rendering PDF viewer...');
    
    const isEncrypted = isContractEncrypted(contract);
    
    console.log('[PDFEditor] Render state:', {
      isEncrypted,
      hasDecryptedBlob: !!decryptedPdfBlob,
      hasDecryptedUrl: !!decryptedPdfUrl,
      hasS3FileKey: !!contract.s3FileKey,
      hasInitialized,
      isCheckingCache,
      cacheCheckComplete
    });
    
    // **ENCRYPTED PDF HANDLING** - Only path for encrypted contracts
    if (isEncrypted) {
      
      
      // Show inline decrypted PDF viewer
      if (decryptedPdfBlob && decryptedPdfUrl) {
        
        return (
          <div className="h-full bg-gray-100 space-y-3">
            {/* ✅ NEW: Integrated header with signature controls */}
            <div className={`p-3 md:p-4 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 transition-all ${
              isSignatureBoxMode 
                ? 'bg-blue-50 border-blue-200' 
                : 'bg-white border-gray-200'  // ✅ CHANGED: bg-white instead of bg-gray-50
            }`}>
              {/* Left side - existing title and status */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-red-600" />  {/* ✅ CHANGED: text-red-600 to match original */}
                  <span className="font-normal text-gray-500">PDF Editor</span>  {/* ✅ CHANGED: font-normal and text-gray-500 to match original */}
                </div>
                
                {isContractEncrypted(contract) && (
                  <div className="flex items-center gap-1 ml-2">  {/* ✅ CHANGED: ml-2 to match original spacing */}
                    <Shield className="h-3 w-3 text-purple-500" />
                    <span className="text-xs text-purple-600">Encrypted</span>
                  </div>
                )}
              </div>
              
              {/* Right side - ALL controls in one row */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* ✅ ADD: Signature controls FIRST (when in edit mode) */}
                {signatureMode === 'edit' && signerWallets.length > 0 && (
                  <>
                    {/* ✅ ENLARGED: Combined selector + button with increased width for descriptive text */}
                    <div className="flex items-center h-8 border border-blue-200 rounded-md bg-white hover:bg-blue-50 transition-colors w-80">
                      {/* ✅ ADJUSTED: Left part - Signer selector with adjusted width */}
                      <div className="flex-1 min-w-0 w-52">
                        <Select value={selectedSignerWallet} onValueChange={setSelectedSignerWallet}>
                          <SelectTrigger className="h-full px-3 text-xs border-0 bg-transparent hover:bg-transparent w-full rounded-none">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <User className="h-3 w-3 text-blue-600 flex-shrink-0" />
                              <span className="truncate flex-1 text-left">
                                {(() => {
                                  const email = walletEmailMap.get(selectedSignerWallet);
                                  const displayText = email ? email : `Select Signer`;
                                  return displayText;
                                })()}
                              </span>
                            </div>
                          </SelectTrigger>
                          <SelectContent className="w-84">
                            {/* ✅ UPDATED: Dropdown width to match container */}
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
                      
                      {/* ✅ ENLARGED: Right part - Draw boxes button with increased width for descriptive text */}
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
                              <span className="whitespace-nowrap">Draw Signature Boxes </span>
                            </>
                          )}
                        </div>
                      </button>
                    </div>
                    
                    {/* Enhanced signature count indicator */}
                    {signaturePositions.length > 0 && (
                      <div className="flex items-center gap-1 text-xs text-blue-700 bg-blue-100 px-2 py-1 rounded-full border border-blue-200">
                        <MapPin className="h-3 w-3" />
                        <span className="font-medium">{signaturePositions.length}</span>
                        <span className="text-blue-600">
                          {signaturePositions.length === 1 ? 'box' : 'boxes'}
                        </span>
                      </div>
                    )}
                    
                    {/* ✅ ENHANCED: Separator with better styling */}
                    <div className="w-px h-6 bg-gray-300"></div>
                  </>
                )}
                
                {/* ✅ UPDATED: Standard PDF controls with original button styling */}
                {showDownloadButton && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={downloadPdf} 
                    className="h-8 px-3 text-xs border-blue-200 hover:bg-blue-100"  // ✅ RESTORED: Original button styling
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
                    className="h-8 px-3 text-xs border-blue-200 hover:bg-blue-100"  // ✅ RESTORED: Original button styling
                  >
                    <Upload className="h-3 w-3 mr-1" />
                    Replace
                  </Button>
                )}
              </div>
            </div>
            
            {/* ✅ REMOVE: The separate signature box controls card - DELETE IT COMPLETELY */}
            
            {/* ✅ OPTIONAL: Drawing mode indicator (if you want to keep it) */}
            {isSignatureBoxMode && (
              <div className="bg-blue-100 border-b border-blue-200 p-2 text-center">
                <div className="flex items-center justify-center gap-2 text-sm text-blue-800">
                  <Square className="h-4 w-4" />
                  <span className="font-medium">Drawing Mode Active</span>
                  <span className="text-xs opacity-75">Click and drag to create signature boxes</span>
                </div>
              </div>
            )}
            
            {/* PDF content area */}
            <div className="flex-1">
              {/* Your existing PDF rendering code */}
              <div 
                className="relative h-full bg-white rounded-lg border border-gray-200 overflow-hidden"
                onMouseDown={isSignatureBoxMode ? (e) => handleMouseDown(e, 1) : undefined}
                onMouseMove={isSignatureBoxMode ? handleMouseMove : undefined}
                onMouseUp={isSignatureBoxMode ? handleMouseUp : undefined}
                style={{ 
                  cursor: isSignatureBoxMode ? 'crosshair' : 'default',
                  minHeight: '600px' 
                }}
              >
                <iframe
                  id="pdf-iframe" // ✅ ADD: ID for scroll tracking
                  src={decryptedPdfUrl}
                  className={`w-full h-full border-0 ${isSignatureBoxMode ? 'pointer-events-none' : 'pointer-events-auto'}`}
                  title="Decrypted PDF Viewer"
                  style={{ minHeight: '600px' }}
                />
                
                {/* ✅ UPDATED: Signature boxes overlay - only show when in signature mode */}
                {isSignatureBoxMode && renderSignatureBoxes(1)}
              </div>
            </div>
          </div>
        );
      }
      
      // **NEW: Show cache checking state**
      if (isCheckingCache) {
        console.log('[PDFEditor] Showing cache check loading state');
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
      
      // **UPDATED: Only show AutoDecryptionView if cache check is complete and no cached PDF found**
      if (cacheCheckComplete && !decryptedPdfBlob) {
        console.log('[PDFEditor] Cache check complete, no cached PDF found, showing AutoDecryptionView');
        return (
          <AutoDecryptionView 
            contract={contract}
            onDecrypted={handleDecryptionSuccess}
          />
        );
      }
      
      // **NEW: Show waiting state if cache check hasn't completed yet**
      if (!cacheCheckComplete) {
        console.log('[PDFEditor] Cache check not complete yet, showing waiting state');
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
          <iframe
            src={pdfUrl}
            className="w-full h-full border-0"
            title="PDF Viewer"
            style={{ minHeight: '400px' }}
          />
        </div>
      );
    }
    
    // **LOADING STATE** for regular PDFs
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
    
    // **NO PDF UPLOADED**
    
    return (
      <div className="h-full flex items-center justify-center bg-white p-3 sm:p-6">
        <div className="w-full max-w-sm mx-auto text-center space-y-4">
          <FileText className="h-10 w-10 sm:h-12 sm:w-12 mx-auto text-gray-400" />
          <div className="space-y-2">
            <h3 className="text-base sm:text-lg font-medium text-gray-900">No PDF uploaded</h3>
            <p className="text-xs sm:text-sm text-gray-600 px-2">Upload a PDF file to get started</p>
          </div>
          <Button
            onClick={() => {
              console.log('[PDFEditor] Upload PDF button clicked');
              document.getElementById('pdf-file-input')?.click();
            }}
            className="w-full sm:w-auto px-6 py-3 text-sm font-medium min-h-[44px] touch-manipulation"
          >
            <Upload className="h-4 w-4 mr-2" />
            Upload PDF
          </Button>
        </div>
      </div>
    );
  };



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