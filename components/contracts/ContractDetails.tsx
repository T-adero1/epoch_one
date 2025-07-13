'use client'

import { useState, useEffect } from 'react'
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

// Define interface for the contract used in this component
interface ContractSignature {
  id: string;
  status: SignatureStatus;
  signedAt: Date | null;
  user: {
    id: string;
    name: string | null;
    email: string;
  };
}

// Updated Contract interface to include encryption fields
interface Contract {
  id: string;
  title: string;
  description: string | null;
  content: string;
  status: ContractStatus;
  ownerId: string;
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
}

export default function ContractDetails({ 
  contract, 
  onBack, 
  onUpdate, 
  defaultTab = "content",
  onSend,
  uploadedFileData
}: ContractDetailsProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [copySuccess, setCopySuccess] = useState('')
  const { user } = useZkLogin();

  // **UPDATED: Enhanced PDF viewing state with encryption support**
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [decryptedPdfBlob, setDecryptedPdfBlob] = useState<Blob | null>(null);
  const [decryptedPdfUrl, setDecryptedPdfUrl] = useState<string | null>(null);
  
  const handleSave = (updatedContract: Contract) => {
    setIsEditing(false)
    onUpdate(updatedContract)
  }
  
  const copySigningLink = (email: string) => {
    const link = generateSigningLink(contract.id)
    navigator.clipboard.writeText(link)
    setCopySuccess(`Link for ${email} copied!`)
    setTimeout(() => setCopySuccess(''), 3000)
  }

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
    try {
      const { pdfCache } = await import('@/app/utils/pdfCache');
      await pdfCache.storeDecryptedPDF(
        contract.id,
        new Uint8Array(await decryptedBlob.arrayBuffer()),
        contract.s3FileName || 'decrypted-contract.pdf'
      );
      console.log('[ContractDetails] Cached decrypted PDF in IndexDB');
    } catch (cacheError) {
      console.warn('[ContractDetails] Failed to cache decrypted PDF:', cacheError);
    }
    
    console.log('[ContractDetails] State updated with decrypted PDF data');
    
    toast({
      title: "PDF Decrypted Successfully",
      description: "Your encrypted PDF is now ready to view.",
      variant: "success",
    });
  };

  // **NEW: Check IndexDB cache on mount**
  useEffect(() => {
    const checkCacheForDecryptedPDF = async () => {
      if (!isContractEncrypted() || decryptedPdfBlob) return;
      
      console.log('[ContractDetails] Checking IndexDB cache for decrypted PDF...');
      try {
        const { pdfCache } = await import('@/app/utils/pdfCache');
        const cachedPDF = await pdfCache.getDecryptedPDF(contract.id);
        
        if (cachedPDF) {
          console.log('[ContractDetails] Found decrypted PDF in cache!');
          const blob = new Blob([cachedPDF.decryptedData], { type: 'application/pdf' });
          handleDecryptionSuccess(blob);
        } else {
          console.log('[ContractDetails] No decrypted PDF found in cache');
        }
      } catch (error) {
        console.warn('[ContractDetails] Cache check failed:', error);
      }
    };

    checkCacheForDecryptedPDF();
  }, [contract.id]);

  // **UPDATED: Load PDF with encryption awareness**
  useEffect(() => {
    let isMounted = true;
    
    const loadPdf = async () => {
      if (!contract.s3FileKey) return;
      
      // **NEW: Skip regular PDF loading if encrypted**
      if (isContractEncrypted()) {
        console.log('[ContractDetails] Contract is encrypted, skipping regular PDF load');
        return;
      }
      
      // If we have uploaded file data, use it directly (much faster!)
      if (uploadedFileData?.blob) {
        console.log('[ContractDetails] Using uploaded file data directly - no S3 request needed!');
        const url = URL.createObjectURL(uploadedFileData.blob);
        if (isMounted) {
          setPdfUrl(url);
          setIsLoadingPdf(false);
        }
        return;
      }
      
      // Fallback: fetch from S3 only if we don't have local data
      console.log('[ContractDetails] No local file data, fetching from S3...');
      setIsLoadingPdf(true);
      try {
        const response = await fetch(`/api/contracts/download-pdf/${contract.id}?view=inline`);
        if (response.ok && isMounted) {
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          setPdfUrl(url);
        } else if (isMounted) {
          throw new Error('Failed to load PDF');
        }
      } catch (error) {
        if (isMounted) {
          console.error('Error loading PDF:', error);
          toast({
            title: "Error Loading PDF",
            description: "Failed to load the PDF file. Please try again.",
            variant: "destructive",
          });
        }
      } finally {
        if (isMounted) {
          setIsLoadingPdf(false);
        }
      }
    };

    if (contract.s3FileKey) {
      loadPdf();
    }

    // Cleanup function
    return () => {
      isMounted = false;
      if (pdfUrl && pdfUrl.startsWith('blob:')) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [contract.s3FileKey, uploadedFileData]);

  // **NEW: Clean up decrypted URLs on unmount**
  useEffect(() => {
    return () => {
      if (decryptedPdfUrl) {
        console.log('[ContractDetails] Cleaning up decrypted PDF URL on unmount');
        URL.revokeObjectURL(decryptedPdfUrl);
      }
    };
  }, [decryptedPdfUrl]);

  // **NEW: Reset decryption state when contract changes**
  useEffect(() => {
    if (decryptedPdfUrl) {
      URL.revokeObjectURL(decryptedPdfUrl);
    }
    setDecryptedPdfBlob(null);
    setDecryptedPdfUrl(null);
  }, [contract.id]);

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

  // **NEW: Download handler for decrypted PDFs**
  const downloadPdf = async () => {
    console.log('[ContractDetails] Download PDF requested');
    try {
      // Handle decrypted PDF download
      if (decryptedPdfBlob && decryptedPdfUrl) {
        console.log('[ContractDetails] Downloading decrypted PDF blob');
        const link = document.createElement('a');
        link.href = decryptedPdfUrl;
        link.download = contract.s3FileName?.replace('.encrypted.', '.') || 'decrypted-contract.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }
      
      // Handle regular PDF download
      console.log('[ContractDetails] Downloading regular PDF from server');
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
      console.error('[ContractDetails] Error downloading PDF:', error);
      toast({
        title: "Download Failed", 
        description: "Failed to download PDF. Please try again.",
        variant: "destructive",
      });
    }
  };

  // **NEW: Enhanced PDF rendering with encryption support**
  const renderPDFContent = () => {
    if (!hasPdfFile) return null;

    // **ENCRYPTED PDF HANDLING**
    if (isEncrypted) {
      console.log('[ContractDetails] Rendering encrypted PDF content');
      
      // Show decrypted PDF if available
      if (decryptedPdfBlob && decryptedPdfUrl) {
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

      // Show auto-decryption component
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
            />
          </div>
        </div>
      );
    }

    // **REGULAR PDF HANDLING**
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
                      const response = await fetch(`/api/contracts/download-pdf/${contract.id}?view=inline`);
                      if (response.ok) {
                        const blob = await response.blob();
                        const url = URL.createObjectURL(blob);
                        window.open(url, '_blank');
                        setTimeout(() => URL.revokeObjectURL(url), 1000);
                      } else {
                        throw new Error('Failed to load PDF');
                      }
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
            ) : pdfUrl ? (
              <iframe
                src={pdfUrl}
                className="absolute inset-0 w-full h-full border-0"
                title="Contract PDF"
                style={{ minHeight: '450px' }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-white">
                <div className="text-center">
                  <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-amber-500" />
                  <p className="text-sm text-gray-600 mb-3">Failed to load PDF</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.location.reload()}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry
                  </Button>
                </div>
              </div>
            )}
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

  return (
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
              {contract.metadata?.signers?.length ? (
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
                                  onClick={() => copySigningLink(signer)}
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
              
              <div className="mt-6 p-3 sm:p-4 border rounded-md bg-gray-50">
                <h4 className="font-medium mb-2 text-sm sm:text-base">Contract Status</h4>
                <p className="text-xs sm:text-sm text-gray-600">
                  {areAllSignaturesDone(contract.metadata?.signers || [], contract.signatures)
                    ? "All signatures collected! The contract is now complete."
                    : `Waiting for ${contract.metadata?.signers?.length || 0 - (contract.signatures?.length || 0)} more signatures.`
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
  )
}

// **NEW: Auto-Decryption Component (same as PDFEditor)**
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
      console.log('[ContractDetails:AutoDecryptionView] Starting auto-decryption...');
      setDecryptionStep('loading-metadata');
      setError(null);
      setProgress(10);

      try {
        // Load encryption metadata
        console.log('[ContractDetails:AutoDecryptionView] Loading encryption metadata...');
        let allowlistId = contract.sealAllowlistId || contract.metadata?.walrus?.encryption?.allowlistId;
        let documentId = contract.sealDocumentId || contract.metadata?.walrus?.encryption?.documentId;
        let capId = contract.sealCapId || contract.metadata?.walrus?.encryption?.capId;

        // If missing, fetch fresh data from database
        if (!allowlistId) {
          console.log('[ContractDetails:AutoDecryptionView] Fetching fresh contract data...');
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
            console.log('[ContractDetails:AutoDecryptionView] Using cached encrypted PDF');
            encryptedData = cachedPDF.encryptedData.buffer;
          } else {
            throw new Error('Not in cache');
          }
        } catch (cacheError) {
          // Fallback to AWS download
          console.log('[ContractDetails:AutoDecryptionView] Cache miss, downloading from AWS');
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
            console.log('[ContractDetails:AutoDecryptionView] Cached downloaded encrypted PDF');
          } catch (cacheError) {
            console.warn('[ContractDetails:AutoDecryptionView] Failed to cache downloaded PDF:', cacheError);
          }
        }

        setProgress(40);
        setDecryptionStep('initializing-seal');

        // Initialize SEAL client
        const { SealClient, getAllowlistedKeyServers, SessionKey } = await import('@mysten/seal');
        const { SuiClient, getFullnodeUrl } = await import('@mysten/sui/client');
        const { Ed25519Keypair } = await import('@mysten/sui/keypairs/ed25519');
        const { Transaction } = await import('@mysten/sui/transactions');
        const { fromHEX } = await import('@mysten/sui/utils');
        const { bech32 } = await import('bech32');
        const { genAddressSeed, getZkLoginSignature } = await import('@mysten/sui/zklogin');

        const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
        const sealClient = new SealClient({
          suiClient: suiClient as any,
          serverConfigs: getAllowlistedKeyServers('testnet').map((id) => ({
            objectId: id,
            weight: 1,
          })),
          verifyKeyServers: true
        });

        setProgress(50);
        setDecryptionStep('authorizing');

        // Get ephemeral keypair from session
        const sessionData = localStorage.getItem("epochone_session");
        if (!sessionData) {
          throw new Error("No session data found in localStorage");
        }
        
        const sessionObj = JSON.parse(sessionData);
        const zkLoginState = sessionObj.zkLoginState || sessionObj.user.zkLoginState;
        
        if (!zkLoginState?.ephemeralKeyPair?.privateKey) {
          throw new Error("No ephemeral key private key found in session data");
        }

        // Decode the private key
        function decodeSuiPrivateKey(suiPrivateKey: string): Uint8Array {
          if (!suiPrivateKey.startsWith('suiprivkey1')) {
            throw new Error('Not a valid Sui bech32 private key format');
          }
          
          const decoded = bech32.decode(suiPrivateKey);
          const privateKeyBytes = Buffer.from(bech32.fromWords(decoded.words));
          const secretKey = privateKeyBytes.slice(1); // Remove the first byte (flag)
          
          if (secretKey.length !== 32) {
            throw new Error(`Expected 32 bytes after removing flag, got ${secretKey.length}`);
          }
          
          return new Uint8Array(secretKey);
        }

        const privateKeyBytes = decodeSuiPrivateKey(zkLoginState.ephemeralKeyPair.privateKey);
        const ephemeralKeypair = Ed25519Keypair.fromSecretKey(privateKeyBytes);
        const ephemeralAddress = ephemeralKeypair.getPublicKey().toSuiAddress();

        // Get user address from session
        const userAddress = sessionObj.user?.address || sessionObj.userAddress;
        if (!userAddress) {
          throw new Error('User address not found');
        }

        setProgress(60);
        setDecryptionStep('creating-session');

        // Create session key
        const SEAL_PACKAGE_ID = process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID || 
          '0xb5c84864a69cb0b495caf548fa2bf0d23f6b69b131fa987d6f896d069de64429';
        const TTL_MIN = 30;

        // Format document ID
        const docId = documentId.startsWith('0x') ? documentId.substring(2) : documentId;

        // Authorize ephemeral key with sponsored transaction
        const sponsorResponse = await fetch('/api/auth/sponsor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: userAddress,
            allowlistId,
            ephemeralAddress,
            documentId: docId,
            validityMs: 60 * 60 * 1000 // 1 hour
          })
        });

        if (!sponsorResponse.ok) {
          const errorText = await sponsorResponse.text();
          throw new Error(`Sponsorship failed: ${sponsorResponse.status} ${errorText}`);
        }
        
        const { sponsoredTxBytes } = await sponsorResponse.json();
        
        // Sign the sponsored bytes with ephemeral key
        const { fromB64 } = await import('@mysten/sui/utils');
        const txBlock = Transaction.from(fromB64(sponsoredTxBytes));
        const { signature: userSignature } = await txBlock.sign({
          client: suiClient,
          signer: ephemeralKeypair
        });
        
        // Create zkLogin signature
        const salt = zkLoginState.salt;
        if (!salt) {
          throw new Error("No salt found in zkLoginState!");
        }
        
        const jwt = zkLoginState.jwt;
        const jwtBody = JSON.parse(atob(jwt.split('.')[1]));
        const addressSeed = genAddressSeed(
          BigInt(salt),
          'sub',
          jwtBody.sub,
          jwtBody.aud
        ).toString();
        
        const zkLoginSignature = getZkLoginSignature({
          inputs: {
            ...zkLoginState.zkProofs,
            addressSeed,
          },
          maxEpoch: zkLoginState.maxEpoch,
          userSignature,
        });
        
        // Execute authorization
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
        await suiClient.waitForTransaction({
          digest: digest,
          options: { showEffects: true }
        });

        setProgress(70);
        setDecryptionStep('fetching-keys');

        // Create session key for decryption
        const sessionKey = new SessionKey({
          address: ephemeralAddress,
          packageId: SEAL_PACKAGE_ID,
          ttlMin: TTL_MIN,
          signer: ephemeralKeypair,
          suiClient: suiClient as any
        });
        
        // Sign personal message
        const personalMessage = sessionKey.getPersonalMessage();
        const signature = await ephemeralKeypair.signPersonalMessage(personalMessage);
        await sessionKey.setPersonalMessageSignature(signature.signature);
        
        // Create seal_approve transaction
        const tx = new Transaction();
        tx.setSender(ephemeralAddress);
        
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
        await sealClient.fetchKeys({
          ids: [rawId],
          txBytes: txKindBytes,
          sessionKey,
          threshold: 1
        });

        setProgress(90);
        setDecryptionStep('decrypting');

        // Decrypt the data
        const decryptedData = await sealClient.decrypt({
          data: new Uint8Array(encryptedData),
          sessionKey: sessionKey,
          txBytes: txKindBytes
        });

        setProgress(100);
        setDecryptionStep('complete');

        // Create blob and call success handler
        const decryptedBlob = new Blob([decryptedData], { type: 'application/pdf' });
        onDecrypted(decryptedBlob);

      } catch (err) {
        console.error('[ContractDetails:AutoDecryptionView] Auto-decryption failed:', err);
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
        {/* Decryption Icon */}
        <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-purple-100 rounded-full">
          <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 text-purple-600 animate-spin" />
        </div>
        
        {/* File Info */}
        <div className="space-y-2">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 break-words px-2">
            Auto-Decrypting PDF
          </h3>
          <p className="text-xs sm:text-sm text-purple-600">
            {getStepMessage()}
          </p>
        </div>
        
        {/* Progress Bar */}
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