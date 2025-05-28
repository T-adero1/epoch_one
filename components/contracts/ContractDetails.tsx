'use client'

import { useState } from 'react'
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
  Lock
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
}

interface ContractDetailsProps {
  contract: Contract;
  onBack: () => void;
  onUpdate: (updatedContract: Contract) => void;
  defaultTab?: string;
  onSend?: () => void;
}

export default function ContractDetails({ 
  contract, 
  onBack, 
  onUpdate, 
  defaultTab = "content",
  onSend
}: ContractDetailsProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [copySuccess, setCopySuccess] = useState('')
  const { user } = useZkLogin();
  
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
              {contract.content ? (
                <div className="prose max-w-none">
                  <pre className="whitespace-pre-wrap font-mono text-xs sm:text-sm overflow-x-auto">{contract.content}</pre>
                </div>
              ) : contract.status === 'COMPLETED' ? (
                <div className="flex flex-col items-center justify-center h-full text-blue-600 px-4">
                  <div className="relative mb-4">
                    <FileText className="h-12 sm:h-16 w-12 sm:w-16 text-gray-300" />
                    <Lock className="h-6 sm:h-8 w-6 sm:w-8 absolute -bottom-1 -right-1 bg-white rounded-full p-1 text-blue-600" />
                  </div>
                  <p className="text-base sm:text-lg font-medium text-gray-700 text-center">Content Encrypted</p>
                  <p className="text-xs sm:text-sm text-gray-500 mt-2 text-center max-w-md">
                    This contract has been completed and its content is now securely encrypted. 
                    Use the "Decrypt and Download" option to access the document.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <FileText className="h-12 sm:h-16 w-12 sm:w-16 mb-4" />
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
            {/* Placeholder for status text to match editor layout */}
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