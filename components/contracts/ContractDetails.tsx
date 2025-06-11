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
  RefreshCw
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

// Updated Contract interface to include S3 fields
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
  } | null;
  owner?: {
    id: string;
    name: string | null;
    email: string;
  };
  signatures?: ContractSignature[];
  // Add S3 fields for PDF support
  s3FileKey?: string | null;
  s3FileName?: string | null;
  s3FileSize?: number | null;
  s3ContentType?: string | null;
  s3Bucket?: string | null;
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

  // PDF viewing state
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  
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

  // Load PDF URL when component mounts or contract changes
  useEffect(() => {
    let isMounted = true;
    
    const loadPdf = async () => {
      if (!contract.s3FileKey) return;
      
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
  }, [contract.s3FileKey, uploadedFileData]); // Add uploadedFileData to dependencies

  // Check if this contract has a PDF file
  const hasPdfFile = !!(contract.s3FileKey && contract.s3FileName);
  
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
              {/* Show PDF file info if available */}
              {hasPdfFile && (
                <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                  <FileText className="h-3 w-3 text-red-600" />
                  <span>{contract.s3FileName}</span>
                  {contract.s3FileSize && (
                    <span>• {(contract.s3FileSize / 1024 / 1024).toFixed(2)} MB</span>
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
              {/* Conditional rendering for PDF vs Text contracts */}
              {hasPdfFile ? (
                // PDF Contract Display - Mobile Optimized
                <div className="h-full flex flex-col -m-4 sm:-m-6">
                  {/* PDF Header */}
                  <div className="p-3 sm:p-4 border-b bg-gray-50">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-red-600 flex-shrink-0" />
                        <span className="text-sm font-medium text-gray-700">PDF Contract</span>
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {contract.s3FileName}
                      </div>
                    </div>
                  </div>
                  
                  {/* PDF Mobile View - Fully Responsive */}
                  <div className="flex-1 flex items-center justify-center bg-gray-50 p-3 sm:p-6">
                    <div className="w-full max-w-sm mx-auto text-center space-y-4 sm:space-y-6">
                      {/* PDF Icon - Responsive sizing */}
                      <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-red-100 rounded-full">
                        <FileText className="h-6 w-6 sm:h-8 sm:w-8 text-red-600" />
                      </div>
                      
                      {/* File Info - Mobile optimized */}
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
                      
                      {/* Description - Mobile friendly */}
                      <p className="text-xs sm:text-sm text-gray-600 leading-relaxed px-2">
                        <span className="hidden sm:inline">
                          Open the PDF in a new browser tab for optimal viewing on your device.
                        </span>
                        <span className="sm:hidden">
                          Tap to open PDF in your browser for better viewing.
                        </span>
                      </p>
                      
                      {/* Action Button - Touch friendly */}
                      <div className="pt-2">
                        <Button
                          onClick={async () => {
                            try {
                              const response = await fetch(`/api/contracts/download-pdf/${contract.id}?view=inline`);
                              if (response.ok) {
                                const blob = await response.blob();
                                const url = URL.createObjectURL(blob);
                                window.open(url, '_blank');
                                // Clean up the blob URL after a short delay
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
                      
                      {/* Additional info for mobile users */}
                      <div className="pt-2 sm:hidden">
                        <p className="text-xs text-gray-500 leading-relaxed">
                          Your device will use its preferred PDF viewer app or browser.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
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
                        {/* Mobile: Stack everything vertically */}
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
                        PDF file attached: {contract.s3FileName}
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
                PDF Contract
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