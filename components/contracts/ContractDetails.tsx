'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
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
  Share2 
} from 'lucide-react'
import { format } from 'date-fns'
import { ContractStatus, SignatureStatus } from '@prisma/client'
import ContractEditor from './ContractEditor'
import { Avatar, AvatarFallback} from '@/components/ui/avatar'
import { generateSigningLink, areAllSignaturesDone } from '@/app/utils/signatures'

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
}

export default function ContractDetails({ contract, onBack, onUpdate }: ContractDetailsProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [copySuccess, setCopySuccess] = useState('')
  
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
        {status.charAt(0) + status.slice(1).toLowerCase()}
      </Badge>
    );
  };

  return (
    <Card className="w-full h-full border-none shadow-none">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div>
              <CardTitle className="text-xl font-semibold flex items-center gap-2">
                {contract.title}
                {getStatusBadge(contract.status)}
              </CardTitle>
              <CardDescription>{contract.description}</CardDescription>
            </div>
          </div>
          <div className="flex gap-2">
            {contract.status === ContractStatus.DRAFT && (
              <>
                <Button variant="outline" onClick={() => setIsEditing(true)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <Button>
                  <Send className="h-4 w-4 mr-2" />
                  Send for Signature
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="content">
          <TabsList className="mb-4">
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="signers">Signers</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
          <TabsContent value="content" className="min-h-[500px]">
            <div className="border rounded-md p-4 min-h-[500px] bg-white">
              {contract.content ? (
                <div className="prose max-w-none">
                  <pre className="whitespace-pre-wrap">{contract.content}</pre>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <FileText className="h-16 w-16 mb-4" />
                  <p>No content available</p>
                </div>
              )}
            </div>
          </TabsContent>
          <TabsContent value="signers" className="min-h-[500px]">
            <div className="border rounded-md p-4 min-h-[500px] bg-white">
              <h3 className="text-lg font-medium mb-4">Signers</h3>
              {contract.metadata?.signers?.length ? (
                <div className="space-y-4">
                  {contract.metadata.signers.map((signer: string, i: number) => {
                    const signature = contract.signatures?.find(
                      (sig: ContractSignature) => sig.user.email.toLowerCase() === signer.toLowerCase()
                    );
                    const hasSigned = signature?.status === 'SIGNED';
                    
                    return (
                      <div key={i} className="flex items-center justify-between p-3 border rounded-md">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-blue-100 text-blue-600">
                              {signer.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{signer}</p>
                            <p className="text-sm text-gray-500">
                              {hasSigned 
                                ? `Signed on ${format(new Date(signature.signedAt!), 'MMM dd, yyyy')}`
                                : 'Pending signature'}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {hasSigned ? (
                            <Badge variant="outline" className="text-green-600 bg-green-50">
                              Signed
                            </Badge>
                          ) : (
                            <>
                              <Badge variant="outline" className="text-yellow-600 bg-yellow-50">
                                Pending
                              </Badge>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => copySigningLink(signer)}
                                className="ml-2"
                              >
                                <Share2 className="h-4 w-4 mr-2" />
                                Share Link
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[400px] text-gray-400">
                  <UserCheck className="h-16 w-16 mb-4" />
                  <p>No signers added to this contract</p>
                </div>
              )}
              
              {copySuccess && (
                <div className="mt-4 p-2 bg-green-50 text-green-700 rounded-md text-sm">
                  {copySuccess}
                </div>
              )}
              
              <div className="mt-6 p-4 border rounded-md bg-gray-50">
                <h4 className="font-medium mb-2">Contract Status</h4>
                <p className="text-sm text-gray-600">
                  {areAllSignaturesDone(contract.metadata?.signers || [], contract.signatures)
                    ? "All signatures collected! The contract is now complete."
                    : `Waiting for ${contract.metadata?.signers?.length || 0 - (contract.signatures?.length || 0)} more signatures.`
                  }
                </p>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="history" className="min-h-[500px]">
            <div className="border rounded-md p-4 min-h-[500px] bg-white">
              <h3 className="text-lg font-medium mb-4">History</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="mt-1 bg-blue-100 text-blue-600 p-2 rounded-full">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium">Contract Created</p>
                    <p className="text-sm text-gray-500">
                      {format(new Date(contract.createdAt), 'MMM dd, yyyy HH:mm')}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-1 bg-blue-100 text-blue-600 p-2 rounded-full">
                    <Clock className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium">Last Updated</p>
                    <p className="text-sm text-gray-500">
                      {format(new Date(contract.updatedAt), 'MMM dd, yyyy HH:mm')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
} 