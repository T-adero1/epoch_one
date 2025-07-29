'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle,
  CardFooter
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  ChevronLeft, 
  FileText, 
  Clock, 
  Edit, 
  UserCheck, 
  Send, 
  Share2,
  Lock,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Shield,
  ExternalLink,
  Download
} from 'lucide-react'
import { format } from 'date-fns'
import { ContractStatus, SignatureStatus } from '@prisma/client'
import ContractEditor from './ContractEditor'
import { Avatar, AvatarFallback} from '@/components/ui/avatar'
import { generateSigningLink, areAllSignaturesDone } from '@/app/utils/signatures'
import { useZkLogin } from '@/app/contexts/ZkLoginContext'
import { toast } from '@/components/ui/use-toast'
import EncryptedEmailDisplay from '@/components/contracts/EncryptedEmailDisplay';
// **NEW: Import email decryption utilities**
import { decryptSignerEmails, canDecryptEmails } from '@/app/utils/emailEncryption';

// Define interface for the contract used in this component
interface ContractSignature {
  id: string;
  status: SignatureStatus;
  signedAt: Date | null;
  userGoogleIdHash: string; // ✅ Fix: was userId
  email: string | null;
  walletAddress: string;
  user: {  // ✅ Add user object
    id: string;
    name: string | null;
    email: string;
  };
}

// Update the Contract interface to match what's actually used
interface Contract {
  id: string;
  title: string;
  description: string | null;
  content: string;
  status: ContractStatus;
  ownerId: string;
  ownerGoogleIdHash: string; // ✅ Add this missing property
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
  metadata?: {
    signers?: string[];
    walrus?: {
      encryption?: {
        allowlistId?: string;
        documentId?: string;
        capId?: string;
      };
    };
    encryptedSignerEmails?: string[];
  } | null;
  owner?: {
    id: string;
    name: string | null;
    email: string;
  };
  signatures?: ContractSignature[];
  // Add S3 and encryption fields
  s3FileKey?: string | null;
  s3FileName?: string | null;
  s3FileSize?: number | null;
  s3ContentType?: string | null;
  s3Bucket?: string | null;
  // **NEW: Add encryption fields**
  isEncrypted?: boolean;
  sealAllowlistId?: string | null;
  sealDocumentId?: string | null;
  sealCapId?: string | null;
}

interface ContractDetailsProps {
  contract: Contract;
  onBack: () => void;
  onUpdate: (updatedContract: Contract) => void;
  defaultTab?: string;
  onSend?: () => void;
  uploadedFileData?: {
    blob: Blob;
    fileName: string;
  } | null;
  // **ADD: SessionKey props**
  currentSessionKey?: any;
  setCurrentSessionKey?: (sessionKey: any) => void;
}

export default function ContractDetails({ 
  contract, 
  onBack, 
  onUpdate, 
  defaultTab = "content",
  onSend,
  uploadedFileData,
  currentSessionKey,
  setCurrentSessionKey
}: ContractDetailsProps) {
  // ✅ ALL HOOKS MUST BE HERE AT THE TOP
  const [isEditing, setIsEditing] = useState(false)
  const [copySuccess, setCopySuccess] = useState('')
  const { user } = useZkLogin();

  // **UPDATED: Enhanced PDF viewing state with encryption support**
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [decryptedPdfBlob, setDecryptedPdfBlob] = useState<Blob | null>(null);
  const [decryptedPdfUrl, setDecryptedPdfUrl] = useState<string | null>(null);
  
  // **NEW: Add cache check state to prevent double loading**
  const [isCheckingCache, setIsCheckingCache] = useState(false);
  const [cacheCheckComplete, setCacheCheckComplete] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  
  // **NEW: Track previous contract ID to prevent unnecessary resets**
  const prevContractIdRef = useRef<string | null>(null);
  
  // ✅ MOVE THESE FROM LINE 785-788 TO HERE!
  const [decryptedSigners, setDecryptedSigners] = useState<string[]>([]);
  const [isDecryptingSigners, setIsDecryptingSigners] = useState(false);
  const [canDecryptSigners, setCanDecryptSigners] = useState(false);
  const [signersDecrypted, setSignersDecrypted] = useState(false);
  
  const handleSave = (updatedContract: Contract) => {
    setIsEditing(false)
    onUpdate(updatedContract)
  }
  
  // **UPDATED: Fix copySigningLink to handle both signature objects and signer emails**
  const copySigningLink = (signerIdentifier: ContractSignature | string) => {
    
    
    const url = `${window.location.origin}/sign/${contract.id}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link copied!",
      description: "Signing link copied to clipboard",
    });
  };

  // **NEW: Enhanced encryption detection**
  const isContractEncrypted = (): boolean => {
    console.log('[ContractDetails] Checking if contract is encrypted...');
    
    const checks = {
      isEncrypted: !!contract.isEncrypted,
      sealAllowlistId: !!contract.sealAllowlistId,
      metadataAllowlistId: !!contract.metadata?.walrus?.encryption?.allowlistId,
      filenameIndicatesEncrypted: !!(contract.s3FileName?.includes('.encrypted.') || contract.s3FileKey?.includes('.encrypted.'))
    };
    
    const result = !!(
      contract.isEncrypted ||
      contract.sealAllowlistId ||
      contract.metadata?.walrus?.encryption?.allowlistId ||
      contract.s3FileName?.includes('.encrypted.') ||
      contract.s3FileKey?.includes('.encrypted.')
    );
    
    console.log('[ContractDetails] Encryption check results:', {
      checks,
      finalResult: result
    });
    
    return result;
  };

  // **NEW: Handle decryption success**
  const handleDecryptionSuccess = async (decryptedBlob: Blob) => {
    console.log('[ContractDetails] PDF decrypted successfully, creating object URL');
    console.log('[ContractDetails] Decrypted blob size:', decryptedBlob.size);
    
    // Clean up previous URL if it exists
    if (decryptedPdfUrl) {
      console.log('[ContractDetails] Cleaning up previous object URL');
      URL.revokeObjectURL(decryptedPdfUrl);
    }
    
    // Create new object URL for the decrypted PDF
    const newUrl = URL.createObjectURL(decryptedBlob);
    console.log('[ContractDetails] Created new object URL:', newUrl);
    
    setDecryptedPdfBlob(decryptedBlob);
    setDecryptedPdfUrl(newUrl);
    
    // Cache the decrypted PDF
    // try {
    //   const { pdfCache } = await import('@/app/utils/pdfCache');
    //   await pdfCache.storeDecryptedPDF(
    //     contract.id,
    //     new Uint8Array(await decryptedBlob.arrayBuffer()),
    //     contract.s3FileName || 'decrypted-contract.pdf'
    //   );
    //   console.log('[ContractDetails] Cached decrypted PDF in IndexDB');
    // } catch (cacheError) {
    //   console.warn('[ContractDetails] Failed to cache decrypted PDF:', cacheError);
    // }
    
    console.log('[ContractDetails] State updated with decrypted PDF data');
    
    toast({
      title: "PDF Decrypted Successfully",
      description: "Your encrypted PDF is now ready to view.",
      variant: "success",
    });
  };

  // **UPDATED: Enhanced cache check with proper state management**
  const checkCacheForDecryptedPDF = async () => {
    if (!isContractEncrypted() || decryptedPdfBlob) return;
    
    setIsCheckingCache(true);
    console.log('[ContractDetails] Checking IndexDB cache for decrypted PDF...');
    
    try {
      const { pdfCache } = await import('@/app/utils/pdfCache');
      const cachedPDF = await pdfCache.getDecryptedPDF(contract.id);
      
      if (cachedPDF) {
        console.log('[ContractDetails] Found decrypted PDF in cache!');
        const blob = new Blob([cachedPDF.decryptedData], { type: 'application/pdf' });
        await handleDecryptionSuccess(blob);
      } else {
        console.log('[ContractDetails] No decrypted PDF found in cache');
      }
    } catch (error) {
      console.warn('[ContractDetails] Cache check failed:', error);
    } finally {
      setIsCheckingCache(false);
      setCacheCheckComplete(true);
      console.log('[ContractDetails] Cache check complete');
    }
  };

  // **NEW: Single initialization effect to prevent double loading**
  useEffect(() => {
    if (hasInitialized) return;
    
    console.log('[ContractDetails] Initializing component with contract:', {
      contractId: contract.id,
      s3FileKey: contract.s3FileKey,
      s3FileName: contract.s3FileName,
      isEncrypted: contract.isEncrypted,
      sealAllowlistId: contract.sealAllowlistId,
      metadata: contract.metadata
    });

    const isEncrypted = isContractEncrypted();
    console.log('[ContractDetails] Encryption detection result:', isEncrypted);
    
    if (isEncrypted) {
      console.log('[ContractDetails] Contract is encrypted - checking cache first');
      checkCacheForDecryptedPDF();
    } else if (contract.s3FileKey) {
      console.log('[ContractDetails] Contract is not encrypted - loading regular PDF');
      loadPdf();
    } else {
      console.log('[ContractDetails] No PDF file available');
    }
    
    setHasInitialized(true);
    prevContractIdRef.current = contract.id;
  }, [contract.id, hasInitialized]);

  // **UPDATED: Smarter reset logic - only reset if contract ID actually changed**
  useEffect(() => {
    if (hasInitialized && prevContractIdRef.current !== contract.id) {
      console.log('[ContractDetails] Contract ID changed, resetting state');
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
      
      prevContractIdRef.current = contract.id;
    } else if (hasInitialized && prevContractIdRef.current === contract.id) {
      console.log('[ContractDetails] Contract metadata updated, preserving current PDF display');
      // Contract metadata updated but ID is the same - preserve current display
      // Don't reset anything, just update the ref
      prevContractIdRef.current = contract.id;
    }
  }, [contract.id, hasInitialized]);

  // **NEW: Handle contract encryption metadata updates without resetting display**
  useEffect(() => {
    if (hasInitialized && prevContractIdRef.current === contract.id) {
      const isEncrypted = isContractEncrypted();
      
      // If contract became encrypted but we already have a working PDF display, 
      // don't switch to encrypted mode - preserve the current display
      if (isEncrypted && (pdfUrl || decryptedPdfUrl)) {
        console.log('[ContractDetails] Contract became encrypted but preserving current PDF display');
        // Don't do anything - keep the current display working
        return;
      }
      
      // If contract became encrypted and we don't have a working display,
      // then we can safely switch to encrypted mode
      if (isEncrypted && !pdfUrl && !decryptedPdfUrl && !isCheckingCache && !cacheCheckComplete) {
        console.log('[ContractDetails] Contract became encrypted, switching to encrypted mode');
        setCacheCheckComplete(false);
        setIsCheckingCache(false);
        checkCacheForDecryptedPDF();
      }
    }
  }, [contract.isEncrypted, contract.sealAllowlistId, contract.metadata?.walrus?.encryption?.allowlistId]);

  // **NEW: Enhanced PDF loading with encryption awareness**
  const loadPdf = async () => {
    if (!contract.s3FileKey) return;
    
    // **NEW: Skip regular PDF loading if encrypted**
    if (isContractEncrypted()) {
      console.log('[ContractDetails] Contract is encrypted, skipping regular PDF load');
      return;
    }
    
    console.log('[ContractDetails] Loading non-encrypted PDF...');
    
    // If we have uploaded file data, use it directly (much faster!)
    if (uploadedFileData?.blob) {
      console.log('[ContractDetails] Using uploaded file data directly - no S3 request needed!');
      const url = URL.createObjectURL(uploadedFileData.blob);
      setPdfUrl(url);
      setIsLoadingPdf(false);
      return;
    }
    
    // Fallback: fetch from S3 only if we don't have local data
    console.log('[ContractDetails] No local file data, fetching from S3...');
    setIsLoadingPdf(true);
    try {
      const response = await fetch(`/api/contracts/download-pdf/${contract.id}?view=inline`);
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
      } else {
        throw new Error('Failed to load PDF');
      }
    } catch (error) {
      console.error('[ContractDetails] Error loading PDF:', error);
      toast({
        title: "Error Loading PDF",
        description: "Failed to load the PDF file. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingPdf(false);
    }
  };

  // **NEW: Clean up decrypted URLs on unmount**
  useEffect(() => {
    return () => {
      if (decryptedPdfUrl) {
        console.log('[ContractDetails] Cleaning up decrypted PDF URL on unmount');
        URL.revokeObjectURL(decryptedPdfUrl);
      }
      if (pdfUrl && pdfUrl.startsWith('blob:')) {
        console.log('[ContractDetails] Cleaning up PDF URL on unmount');
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [decryptedPdfUrl, pdfUrl]);

  // Check if this contract has a PDF file
  const hasPdfFile = !!(contract.s3FileKey && contract.s3FileName);
  const isEncrypted = isContractEncrypted();
  
  const handleSendContract = async () => {
    try {
      toast({
        title: "Sending contract...",
        description: "Preparing signing invitations.",
      });

      const response = await fetch(`/api/contracts/${contract.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'PENDING' }),
      });

      if (!response.ok) {
        throw new Error('Failed to update contract status');
      }

      const updatedContract = await response.json();

      const signerEmails = contract.metadata?.signers || [];
      
      if (signerEmails.length > 0) {
        const emailResponse = await fetch('/api/email/send-contract', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contractId: contract.id,
            contractTitle: contract.title,
            ownerName: contract.owner?.name || contract.owner?.email,
            signerEmails,
          }),
        });

        const emailResult = await emailResponse.json();

        if (emailResponse.ok) {
          if (emailResult.partialFailure && emailResult.partialFailure.length > 0) {
            toast({
              title: "Contract sent with warnings",
              description: `Contract sent, but ${emailResult.partialFailure.length} email(s) failed to send.`,
              variant: "destructive",
            });
          } else {
            toast({
              title: "Contract sent successfully",
              description: `Signing invitations sent to ${signerEmails.length} recipient(s).`,
              variant: "success",
            });
          }
        } else {
          toast({
            title: "Contract sent with warning",
            description: "Contract status updated but emails may not have been sent.",
            variant: "destructive",
          });
        }
      }

      onUpdate(updatedContract);
      
      if (onSend) {
        onSend();
      }

    } catch (error) {
      console.error('Error sending contract:', error);
      toast({
        title: "Error",
        description: "Failed to send contract. Please try again.",
        variant: "destructive",
      });
    }
  };


  // **UPDATED: Enhanced PDF rendering with encryption support and no double loading**
  const renderPDFContent = () => {
    if (!hasPdfFile) return null;

    // **NEW: Preserve existing working PDF display - priority order**
    // 1. If we have a working decrypted PDF, always show it
    if (decryptedPdfBlob && decryptedPdfUrl) {
      console.log('[ContractDetails] Using existing decrypted PDF display');
      return (
        <div className="h-full flex flex-col -m-4 sm:-m-6">
          {/* PDF Content */}
          <div className="flex-1 flex items-center justify-center bg-white">
            {/* Mobile: Button to open PDF in browser */}
            <div className="lg:hidden w-full p-3 sm:p-6">
              <div className="w-full max-w-sm mx-auto text-center space-y-4 sm:space-y-6">
                <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-purple-100 rounded-full">
                  <Shield className="h-6 w-6 sm:h-8 sm:w-8 text-purple-600" />
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 break-words px-2">
                    {contract.s3FileName?.replace('.encrypted.', '.') || 'Decrypted Contract'}
                  </h3>
                  <p className="text-xs sm:text-sm text-purple-600">
                    Decrypted • Ready to view
                  </p>
                </div>
                
                <p className="text-xs sm:text-sm text-gray-600 leading-relaxed px-2">
                  <span className="hidden sm:inline">
                    Open the decrypted PDF in a new browser tab for optimal viewing.
                  </span>
                  <span className="sm:hidden">
                    Tap to open decrypted PDF in your browser.
                  </span>
                </p>
                
                <div className="pt-2">
                  <Button
                    onClick={() => window.open(decryptedPdfUrl, '_blank')}
                    className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 sm:px-8 sm:py-3 text-sm sm:text-base font-medium min-h-[44px] touch-manipulation"
                    size="lg"
                  >
                    <Shield className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span className="hidden sm:inline">Open Decrypted PDF</span>
                    <span className="sm:hidden">Open PDF</span>
                  </Button>
                </div>
              </div>
            </div>

            {/* Desktop: Inline iframe */}
            <div className="hidden lg:block w-full h-full relative">
              <iframe
                src={decryptedPdfUrl}
                className="absolute inset-0 w-full h-full border-0"
                title="Decrypted Contract PDF"
                style={{ minHeight: '450px' }}
              />
            </div>
          </div>
        </div>
      );
    }

    // 2. If we have a working regular PDF, always show it
    if (pdfUrl) {
      console.log('[ContractDetails] Using existing regular PDF display');
      return (
        <div className="h-full flex flex-col -m-4 sm:-m-6">
          {/* PDF content starts directly here */}
          <div className="flex-1 flex items-center justify-center bg-white">
            {/* Mobile: Button to open PDF in browser */}
            <div className="lg:hidden w-full p-3 sm:p-6">
              <div className="w-full max-w-sm mx-auto text-center space-y-4 sm:space-y-6">
                <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-red-100 rounded-full">
                  <FileText className="h-6 w-6 sm:h-8 sm:w-8 text-red-600" />
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 break-words px-2">
                    {contract.s3FileName}
                  </h3>
                  {contract.s3FileSize && (
                    <p className="text-xs sm:text-sm text-gray-600">
                      File size: {(contract.s3FileSize / 1024 / 1024).toFixed(1)} MB
                    </p>
                  )}
                </div>
                
                <p className="text-xs sm:text-sm text-gray-600 leading-relaxed px-2">
                  <span className="hidden sm:inline">
                    Open the PDF in a new browser tab for optimal viewing on your device.
                  </span>
                  <span className="sm:hidden">
                    Tap to open PDF in your browser for better viewing.
                  </span>
                </p>
                
                <div className="pt-2">
                  <Button
                    onClick={async () => {
                      try {
                        window.open(pdfUrl, '_blank');
                      } catch (error) {
                        console.error('Error opening PDF:', error);
                        toast({
                          title: "Error",
                          description: "Failed to open PDF. Please try again.",
                          variant: "destructive",
                        });
                      }
                    }}
                    className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 sm:px-8 sm:py-3 text-sm sm:text-base font-medium min-h-[44px] touch-manipulation"
                    size="lg"
                  >
                    <FileText className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span className="hidden sm:inline">Open PDF in Browser</span>
                    <span className="sm:hidden">Open PDF</span>
                  </Button>
                </div>
              </div>
            </div>

            {/* Desktop: Inline iframe */}
            <div className="hidden lg:block w-full h-full relative">
              {isLoadingPdf ? (
                <div className="absolute inset-0 flex items-center justify-center bg-white">
                  <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-blue-600" />
                    <p className="text-sm text-gray-600">Loading PDF...</p>
                  </div>
                </div>
              ) : (
                <iframe
                  src={pdfUrl}
                  className="absolute inset-0 w-full h-full border-0"
                  title="Contract PDF"
                  style={{ minHeight: '450px' }}
                />
              )}
            </div>
          </div>
        </div>
      );
    }

    // 3. Only now check if we need to handle encryption (when no working display exists)
    const isEncrypted = isContractEncrypted();
    
    console.log('[ContractDetails] No existing PDF display found, checking encryption state:', {
      isEncrypted,
      hasDecryptedBlob: !!decryptedPdfBlob,
      hasDecryptedUrl: !!decryptedPdfUrl,
      isCheckingCache,
      cacheCheckComplete,
      hasInitialized
    });

    // **ENCRYPTED PDF HANDLING** - Only when no working display exists
    if (isEncrypted) {
      console.log('[ContractDetails] Rendering encrypted PDF content');
      
      // **NEW: Show cache checking state**
      if (isCheckingCache) {
        console.log('[ContractDetails] Showing cache check loading state');
        return (
          <div className="h-full flex flex-col -m-4 sm:-m-6">
            <div className="bg-purple-50 border-b border-purple-200 p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-medium text-purple-800">Encrypted PDF</span>
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center bg-white">
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
          </div>
        );
      }

      // **UPDATED: Only show AutoDecryptionView if cache check is complete and no cached PDF found**
      if (cacheCheckComplete && !decryptedPdfBlob) {
        console.log('[ContractDetails] Cache check complete, no cached PDF found, showing AutoDecryptionView');
        return (
          <div className="h-full flex flex-col -m-4 sm:-m-6">
            <div className="bg-purple-50 border-b border-purple-200 p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-medium text-purple-800">Encrypted PDF</span>
              </div>
            </div>
            <div className="flex-1">
              <AutoDecryptionView 
                contract={contract}
                onDecrypted={handleDecryptionSuccess}
                // **ADD: Pass SessionKey props down**
                currentSessionKey={currentSessionKey}
                setCurrentSessionKey={setCurrentSessionKey}
              />
            </div>
          </div>
        );
      }

      // **NEW: Show waiting state if cache check hasn't completed yet**
      if (!cacheCheckComplete) {
        console.log('[ContractDetails] Cache check not complete yet, showing waiting state');
        return (
          <div className="h-full flex flex-col -m-4 sm:-m-6">
            <div className="bg-purple-50 border-b border-purple-200 p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-medium text-purple-800">Encrypted PDF</span>
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center bg-white">
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
          </div>
        );
      }
    }

    // 4. Handle loading states for regular PDFs
    if (isLoadingPdf) {
      return (
        <div className="h-full flex flex-col -m-4 sm:-m-6">
          <div className="flex-1 flex items-center justify-center bg-white">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-blue-600" />
              <p className="text-sm text-gray-600">Loading PDF...</p>
            </div>
          </div>
        </div>
      );
    }

    // 5. Fallback: No PDF available
    return (
      <div className="h-full flex flex-col -m-4 sm:-m-6">
        <div className="flex-1 flex items-center justify-center bg-white">
          <div className="text-center">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-amber-500" />
            <p className="text-sm text-gray-600 mb-3">No PDF available</p>
          </div>
        </div>
      </div>
    );
  };
  
  if (isEditing) {
    return (
      <ContractEditor 
        contract={contract} 
        onSave={handleSave} 
        onCancel={() => setIsEditing(false)} 
      />
    )
  }

  const getStatusBadge = (status: ContractStatus) => {
    const variants: Record<string, string> = {
      DRAFT: 'bg-blue-100 text-blue-800',
      PENDING: 'bg-yellow-100 text-yellow-800',
      ACTIVE: 'bg-green-100 text-green-800',
      COMPLETED: 'bg-purple-100 text-purple-800',
      EXPIRED: 'bg-gray-100 text-gray-800',
      CANCELLED: 'bg-red-100 text-red-800',
    };

    return (
      <Badge className={variants[status]}>
        {contract.status === 'ACTIVE' && 
         contract.ownerId === user?.id && 
         !contract.signatures?.some(sig => 
           sig.userId === contract.ownerId && 
           sig.status === 'SIGNED'
         ) ? (
          <span className="text-green-600 font-medium">Ready for Your Signature</span>
        ) : (
          <span>
            {status.charAt(0) + status.slice(1).toLowerCase()}
          </span>
        )}
      </Badge>
    );
  };

  // **NEW: Add state for managing decrypted emails**
  // const [decryptedSigners, setDecryptedSigners] = useState<string[]>([]);
  // const [isDecryptingSigners, setIsDecryptingSigners] = useState(false);
  // const [canDecryptSigners, setCanDecryptSigners] = useState(false);
  // const [signersDecrypted, setSignersDecrypted] = useState(false);

  // **NEW: Helper function to detect if emails are encrypted**
  const areEmailsEncrypted = (emails: string[]): boolean => {
    if (!emails || emails.length === 0) return false;
    
    // Check if emails look like encrypted data (base64-like strings, not email format)
    return emails.some(email => {
      // Encrypted emails will be base64 strings, much longer than typical emails
      // and won't contain @ symbol or common email patterns
      return email.length > 50 && 
             !email.includes('@') && 
             /^[A-Za-z0-9+/=]+$/.test(email);
    });
  };

  // **NEW: Check if current user can decrypt emails**
  useEffect(() => {
    const checkDecryptPermissions = async () => {
      if (!user?.googleId || !contract.ownerGoogleIdHash) {
        setCanDecryptSigners(false);
        return;
      }

      try {
        const allowed = await canDecryptEmails(contract.ownerGoogleIdHash, user.googleId);
        setCanDecryptSigners(allowed);
      } catch (error) {
        console.error('[ContractDetails] Error checking decrypt permissions:', error);
        setCanDecryptSigners(false);
      }
    };

    checkDecryptPermissions();
  }, [user?.googleId, contract.ownerGoogleIdHash]);

  // **NEW: Auto-decrypt emails if user is owner and emails are encrypted**
  useEffect(() => {
    const autoDecryptSigners = async () => {
      const signers = contract.metadata?.signers || [];
      
      if (!signers.length || !canDecryptSigners || signersDecrypted) return;
      
      // Check if emails look encrypted
      if (!areEmailsEncrypted(signers)) {
        // Emails are not encrypted, use them as-is
        setDecryptedSigners(signers);
        setSignersDecrypted(true);
        return;
      }

      // Emails are encrypted, attempt to decrypt
      if (user?.googleId) {
        setIsDecryptingSigners(true);
        try {
          console.log('[ContractDetails] Auto-decrypting signer emails...');
          const decrypted = await decryptSignerEmails(signers, user.googleId);
          setDecryptedSigners(decrypted);
          setSignersDecrypted(true);
          console.log('[ContractDetails] Successfully decrypted', decrypted.length, 'signer emails');
        } catch (error) {
          console.error('[ContractDetails] Auto-decryption failed:', error);
          // Keep encrypted emails to show encrypted state
          setDecryptedSigners([]);
        } finally {
          setIsDecryptingSigners(false);
        }
      }
    };

    autoDecryptSigners();
  }, [contract.metadata?.signers, canDecryptSigners, user?.googleId, signersDecrypted]);

  return (
    <>
      {isEditing ? (
        <ContractEditor 
          contract={contract} 
          onSave={handleSave} 
          onCancel={() => setIsEditing(false)} 
        />
      ) : (
        <Card className="w-full h-full border-none shadow-none">
          <CardHeader className="pb-4 px-4 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-2 min-w-0 flex-1">
                <Button variant="ghost" size="icon" onClick={onBack} className="mt-1 flex-shrink-0">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-lg sm:text-xl font-semibold flex flex-col sm:flex-row sm:items-center gap-2">
                    <span className="truncate">{contract.title}</span>
                    {getStatusBadge(contract.status)}
                  </CardTitle>
                  {contract.description && (
                    <CardDescription className="mt-1 text-sm">{contract.description}</CardDescription>
                  )}
                  {/* **UPDATED: Show PDF file info with encryption indicator** */}
                  {hasPdfFile && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                      <FileText className="h-3 w-3 text-red-600" />
                      <span>{contract.s3FileName}</span>
                      {contract.s3FileSize && (
                        <span>• {(contract.s3FileSize / 1024 / 1024).toFixed(2)} MB</span>
                      )}
                      {/* **NEW: Encryption indicator** */}
                      {isEncrypted && (
                        <div className="flex items-center gap-1 ml-2">
                          <Shield className="h-3 w-3 text-purple-500" />
                          <span className="text-purple-600">Encrypted</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-4 sm:px-6">
            <Tabs defaultValue={defaultTab}>
              <TabsList className="mb-4 w-full grid grid-cols-3">
                <TabsTrigger value="content" className="text-xs sm:text-sm">Content</TabsTrigger>
                <TabsTrigger value="signers" className="text-xs sm:text-sm">Signers</TabsTrigger>
                <TabsTrigger value="history" className="text-xs sm:text-sm">History</TabsTrigger>
              </TabsList>
              
              <TabsContent value="content" className="min-h-[400px] sm:min-h-[500px]">
                <div className="border rounded-md p-4 sm:p-6 min-h-[400px] sm:min-h-[500px] bg-white">
                  {/* **UPDATED: Enhanced PDF/Text content rendering** */}
                  {hasPdfFile ? (
                    renderPDFContent()
                  ) : contract.content ? (
                    // Text Contract Display
                    <div className="prose prose-sm sm:prose max-w-none">
                      <pre className="whitespace-pre-wrap font-mono text-xs sm:text-sm overflow-x-auto bg-gray-50 p-3 sm:p-4 rounded border">{contract.content}</pre>
                    </div>
                  ) : contract.status === 'COMPLETED' ? (
                    // Completed Contract with Encrypted Content
                    <div className="flex flex-col items-center justify-center h-full text-blue-600 px-3 sm:px-4">
                      <div className="relative mb-4">
                        <FileText className="h-10 w-10 sm:h-12 sm:w-12 md:h-16 md:w-16 text-gray-300" />
                        <Lock className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8 absolute -bottom-1 -right-1 bg-white rounded-full p-1 text-blue-600" />
                      </div>
                      <p className="text-sm sm:text-base md:text-lg font-medium text-gray-700 text-center">Content Encrypted</p>
                      <p className="text-xs sm:text-sm text-gray-500 mt-2 text-center max-w-sm sm:max-w-md leading-relaxed">
                        This contract has been completed and its content is now securely encrypted. 
                        Use the "Decrypt and Download" option to access the document.
                      </p>
                    </div>
                  ) : (
                    // No Content Available
                    <div className="flex flex-col items-center justify-center h-full text-gray-400">
                      <FileText className="h-10 w-10 sm:h-12 sm:w-12 md:h-16 md:w-16 mb-4" />
                      <p className="text-sm sm:text-base">No content available</p>
                    </div>
                  )}
                </div>
              </TabsContent>
              
              <TabsContent value="signers" className="min-h-[400px] sm:min-h-[500px]">
                <div className="border rounded-md p-4 sm:p-6 min-h-[400px] sm:min-h-[500px] bg-white">
                  <h3 className="text-base sm:text-lg font-medium mb-4">Signers</h3>
                  
                  {/* **NEW: Show loading state while decrypting** */}
                  {isDecryptingSigners ? (
                    <div className="flex items-center justify-center h-[200px]">
                      <div className="text-center">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-600" />
                        <p className="text-sm text-gray-600">Decrypting signer emails...</p>
                      </div>
                    </div>
                  ) : contract.metadata?.signers?.length ? (
                    <div className="space-y-4">
                      {/* **NEW: Show encryption status** */}
                      {areEmailsEncrypted(contract.metadata.signers) && (
                        <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                          <div className="flex items-start gap-2">
                            <Shield className="h-4 w-4 text-purple-600 mt-0.5 flex-shrink-0" />
                            <div className="text-sm">
                              <p className="font-medium text-purple-800">Encrypted Signer Emails</p>
                              <p className="text-purple-700 mt-1">
                                {canDecryptSigners 
                                  ? 'Signer emails have been decrypted below as you are the contract owner.'
                                  : 'Signer emails are encrypted. Only the contract owner can view them.'
                                }
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* **UPDATED: Use decrypted emails if available, otherwise show encrypted state** */}
                      {canDecryptSigners && signersDecrypted && decryptedSigners.length > 0 ? (
                        // **Show decrypted emails for contract owner**
                        <div className="space-y-3 sm:space-y-4">
                          {decryptedSigners.map((signer: string, i: number) => {
                            const signature = contract.signatures?.find(
                              (sig: ContractSignature) => sig.user.email.toLowerCase() === signer.toLowerCase()
                            );
                            const hasSigned = signature?.status === 'SIGNED';
                            
                            return (
                              <div key={i} className="border rounded-md p-3 sm:p-4">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                  <div className="flex items-center gap-3">
                                    <Avatar className="h-8 w-8 flex-shrink-0">
                                      <AvatarFallback className="bg-blue-100 text-blue-600">
                                        {signer.slice(0, 2).toUpperCase()}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0 flex-1">
                                      <p className="font-medium text-sm sm:text-base truncate">{signer}</p>
                                      <p className="text-xs sm:text-sm text-gray-500">
                                        {hasSigned 
                                          ? `Signed on ${format(new Date(signature.signedAt!), 'MMM dd, yyyy')}`
                                          : 'Pending signature'}
                                      </p>
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center justify-between sm:justify-end gap-2">
                                    {hasSigned ? (
                                      <Badge variant="outline" className="text-green-600 bg-green-50 text-xs">
                                        Signed
                                      </Badge>
                                    ) : (
                                      <>
                                        <Badge variant="outline" className="text-yellow-600 bg-yellow-50 text-xs">
                                          Pending
                                        </Badge>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => copySigningLink(signature || signer)} // ✅ Fix: Use signer email if no signature exists
                                          className="text-xs sm:text-sm"
                                        >
                                          <Share2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                                          <span className="hidden sm:inline">Share Link</span>
                                          <span className="sm:hidden">Share</span>
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : areEmailsEncrypted(contract.metadata.signers) ? (
                        // **Show encrypted state for non-owners or when decryption failed**
                        <div className="space-y-3 sm:space-y-4">
                          {contract.metadata.signers.map((_, i: number) => (
                            <div key={i} className="border rounded-md p-3 sm:p-4 bg-gray-50">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  <Avatar className="h-8 w-8 flex-shrink-0">
                                    <AvatarFallback className="bg-gray-100 text-gray-500">
                                      <Lock className="h-4 w-4" />
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium text-sm sm:text-base text-gray-600">
                                      Encrypted Signer Email
                                    </p>
                                    <p className="text-xs sm:text-sm text-gray-500">
                                      {canDecryptSigners ? 'Decryption failed' : 'View not authorized'}
                                    </p>
                                  </div>
                                </div>
                                
                                <div className="flex items-center justify-between sm:justify-end gap-2">
                                  <Badge variant="outline" className="text-gray-600 bg-gray-100 text-xs">
                                    <Lock className="h-3 w-3 mr-1" />
                                    Encrypted
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        // **Show non-encrypted emails (backward compatibility)**
                        <div className="space-y-3 sm:space-y-4">
                          {contract.metadata.signers.map((signer: string, i: number) => {
                            const signature = contract.signatures?.find(
                              (sig: ContractSignature) => sig.user.email.toLowerCase() === signer.toLowerCase()
                            );
                            const hasSigned = signature?.status === 'SIGNED';
                            
                            return (
                              <div key={i} className="border rounded-md p-3 sm:p-4">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                  <div className="flex items-center gap-3">
                                    <Avatar className="h-8 w-8 flex-shrink-0">
                                      <AvatarFallback className="bg-blue-100 text-blue-600">
                                        {signer.slice(0, 2).toUpperCase()}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0 flex-1">
                                      <p className="font-medium text-sm sm:text-base truncate">{signer}</p>
                                      <p className="text-xs sm:text-sm text-gray-500">
                                        {hasSigned 
                                          ? `Signed on ${format(new Date(signature.signedAt!), 'MMM dd, yyyy')}`
                                          : 'Pending signature'}
                                      </p>
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center justify-between sm:justify-end gap-2">
                                    {hasSigned ? (
                                      <Badge variant="outline" className="text-green-600 bg-green-50 text-xs">
                                        Signed
                                      </Badge>
                                    ) : (
                                      <>
                                        <Badge variant="outline" className="text-yellow-600 bg-yellow-50 text-xs">
                                          Pending
                                        </Badge>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => copySigningLink(signature || signer)} // ✅ Fix: Use signer email if no signature exists
                                          className="text-xs sm:text-sm"
                                        >
                                          <Share2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                                          <span className="hidden sm:inline">Share Link</span>
                                          <span className="sm:hidden">Share</span>
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-[300px] sm:h-[400px] text-gray-400">
                      <UserCheck className="h-12 sm:h-16 w-12 sm:w-16 mb-4" />
                      <p className="text-sm sm:text-base">No signers added to this contract</p>
                    </div>
                  )}
                  
                  {copySuccess && (
                    <div className="mt-4 p-3 bg-green-50 text-green-700 rounded-md text-xs sm:text-sm">
                      {copySuccess}
                    </div>
                  )}
                  
                  {/* **UPDATED: Show status based on decrypted emails** */}
                  <div className="mt-6 p-3 sm:p-4 border rounded-md bg-gray-50">
                    <h4 className="font-medium mb-2 text-sm sm:text-base">Contract Status</h4>
                    <p className="text-xs sm:text-sm text-gray-600">
                      {areAllSignaturesDone(
                        signersDecrypted ? decryptedSigners : (contract.metadata?.signers || []), 
                        contract.signatures
                      )
                        ? "All signatures collected! The contract is now complete."
                        : `Waiting for ${(signersDecrypted ? decryptedSigners.length : (contract.metadata?.signers?.length || 0)) - (contract.signatures?.length || 0)} more signatures.`
                      }
                    </p>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="history" className="min-h-[400px] sm:min-h-[500px]">
                <div className="border rounded-md p-4 sm:p-6 min-h-[400px] sm:min-h-[500px] bg-white">
                  <h3 className="text-base sm:text-lg font-medium mb-4">History</h3>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-1 bg-blue-100 text-blue-600 p-2 rounded-full flex-shrink-0">
                        <FileText className="h-3 w-3 sm:h-4 sm:w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm sm:text-base">Contract Created</p>
                        <p className="text-xs sm:text-sm text-gray-500">
                          {format(new Date(contract.createdAt), 'MMM dd, yyyy HH:mm')}
                        </p>
                        {hasPdfFile && (
                          <p className="text-xs text-gray-500 mt-1">
                            {isEncrypted ? 'Encrypted PDF' : 'PDF file'} attached: {contract.s3FileName}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="mt-1 bg-blue-100 text-blue-600 p-2 rounded-full flex-shrink-0">
                        <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm sm:text-base">Last Updated</p>
                        <p className="text-xs sm:text-sm text-gray-500">
                          {format(new Date(contract.updatedAt), 'MMM dd, yyyy HH:mm')}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
          
          {contract.status === ContractStatus.DRAFT && (
            <CardFooter className="flex flex-col sm:flex-row sm:justify-between gap-3 pt-4 border-t px-4 sm:px-6">
              <div className="text-xs sm:text-sm text-gray-500 hidden sm:block">
                {hasPdfFile && (
                  <span className="flex items-center gap-1">
                    <FileText className="h-3 w-3 text-red-600" />
                    {isEncrypted ? 'Encrypted PDF Contract' : 'PDF Contract'}
                  </span>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <Button variant="outline" onClick={() => setIsEditing(true)} className="w-full sm:w-auto">
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <Button 
                  onClick={handleSendContract}
                  className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
                  disabled={!contract.metadata?.signers?.length}
                >
                  <Send className="h-4 w-4 mr-2" />
                  Send for Signature
                </Button>
              </div>
            </CardFooter>
          )}
        </Card>
      )}
    </>
  )
}

// **NEW: Add SessionKey state at the component level (like the working example)**
const AutoDecryptionView = ({ 
  contract, 
  onDecrypted,
  currentSessionKey,
  setCurrentSessionKey
}: { 
  contract: any; 
  onDecrypted: (blob: Blob) => void;
  currentSessionKey?: any;
  setCurrentSessionKey?: (sessionKey: any) => void;
}) => {
  const [decryptionStep, setDecryptionStep] = useState<string>('loading-metadata');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const autoDecrypt = async () => {
      try {
        // **ENTIRE LOGIC MOVED TO UTILITY!**
        const { decryptContractPDF } = await import('@/app/utils/sealDecryption');
        
        const result = await decryptContractPDF({
          contract,
          cachedSessionKey: currentSessionKey,
          onProgress: setProgress,
          onStepChange: setDecryptionStep
        });

        // Cache the SessionKey for next time
        if (!result.wasFromCache && setCurrentSessionKey) {
          setCurrentSessionKey(result.sessionKey);
          console.log('[AutoDecryptionView] ✅ Cached new SessionKey for future use');
        }

        // Convert to blob and notify parent
        const decryptedBlob = new Blob([result.decryptedData], { type: 'application/pdf' });
        onDecrypted(decryptedBlob);

        if (result.wasFromCache) {
          console.log('[AutoDecryptionView] ⚡ Lightning-fast decryption using cached SessionKey!');
        }

      } catch (err) {
        console.error('[AutoDecryptionView] Decryption failed:', err);
        setError(err instanceof Error ? err.message : 'Failed to decrypt PDF');
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
            {getStepMessage()}
          </p>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-purple-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="pt-2 text-xs text-gray-500 leading-relaxed">
          Decryption happens entirely on your device - the file never leaves encrypted
        </div>
      </div>
    </div>
  );
}; 