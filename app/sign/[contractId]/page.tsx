'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useZkLogin } from '@/app/contexts/ZkLoginContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { FileText, AlertTriangle, CheckCircle2, LockKeyhole } from 'lucide-react'
import SignatureDrawingCanvas from '@/components/contracts/SignatureCanvas'
import { canUserSignContract, getUserSignatureStatus } from '@/app/utils/signatures'
import { format } from 'date-fns'
import { SignZkLoginModal } from '@/components/SignZkLoginModal'

// Define a proper interface for the contract object used in this component
interface ContractDetail {
  id: string;
  title: string;
  description: string | null;
  content: string;
  status: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  metadata?: {
    signers?: string[];
  } | null;
  owner?: {
    id: string;
    name: string | null;
    email: string;
  };
  signatures?: {
    id: string;
    status: string;
    signedAt: Date | null;
    user: {
      id: string;
      name: string | null;
      email: string;
    };
  }[];
}

// Near the top of the file, after the imports and interface definitions
// Add this helper function for generating contract document

function generateContractDocument(contractData: ContractDetail): string {
  console.log('[ContractDocument] Starting document generation for contract:', contractData.id);
  
  // Simple PDF-like content in base64
  // In a real app, this would create a proper PDF with signatures, etc.
  const contractText = contractData.content || '';
  const title = contractData.title || 'Untitled Contract';
  const signers = contractData.metadata?.signers?.join(', ') || 'No signers';
  
  console.log('[ContractDocument] Document details:', {
    title,
    status: contractData.status,
    contentLength: contractText.length,
    signerCount: contractData.metadata?.signers?.length || 0,
    signatureCount: contractData.signatures?.length || 0
  });
  
  // Create a simple text representation
  const documentContent = `
    TITLE: ${title}
    STATUS: ${contractData.status}
    CREATED: ${new Date(contractData.createdAt).toISOString()}
    SIGNERS: ${signers}
    
    CONTENT:
    ${contractText}
    
    SIGNATURES:
    ${contractData.signatures?.map(sig => 
      `${sig.user.email} - ${sig.signedAt ? new Date(sig.signedAt).toISOString() : 'Pending'}`
    ).join('\n') || 'No signatures'}
  `;
  
  // Convert to base64
  const base64Content = Buffer.from(documentContent).toString('base64');
  console.log('[ContractDocument] Document generated successfully. Base64 length:', base64Content.length);
  return base64Content;
}

export default function ContractSigningPage() {
  const { contractId } = useParams() as { contractId: string }
  const { isAuthenticated, isLoading, user, userAddress } = useZkLogin()
  const router = useRouter()
  
  const [contract, setContract] = useState<ContractDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [canSign, setCanSign] = useState(false)
  const [signatureData, setSignatureData] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [signatureStatus, setSignatureStatus] = useState<'SIGNED' | 'PENDING' | 'NOT_REQUIRED'>('NOT_REQUIRED')
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [requiredEmail, setRequiredEmail] = useState<string | null>(null)
  
  // Fetch just enough contract info to get the required signer email
  const fetchContractBasicInfo = useCallback(async () => {
    console.log('[ContractSigning] Starting basic contract info fetch for contractId:', contractId)
    try {
      const apiUrl = `/api/contracts/${contractId}/public`
      console.log('[ContractSigning] Calling public contract API:', apiUrl)
      
      const response = await fetch(apiUrl)
      console.log('[ContractSigning] Public API response status:', response.status)
      
      if (!response.ok) {
        if (response.status === 404) {
          console.log('[ContractSigning] Contract not found')
          setError('Contract not found')
          return
        }
        throw new Error(`Failed to load contract information: ${response.status}`)
      }
      
      const data = await response.json()
      console.log('[ContractSigning] Public contract data received:', data)
      
      if (data.signers && data.signers.length > 0) {
        console.log('[ContractSigning] Setting required email to first signer:', data.signers[0])
        setRequiredEmail(data.signers[0])
      } else {
        console.log('[ContractSigning] No signers found in contract metadata')
      }
    } catch (err) {
      console.error('[ContractSigning] Error fetching basic contract info:', err)
    }
  }, [contractId, setError, setRequiredEmail])
  
  // Fetch full contract details when authenticated
  const fetchContract = useCallback(async () => {
    if (!user?.email) {
      console.log('[ContractSigning] Cannot fetch contract: No user email available')
      return
    }
    
    console.log('[ContractSigning] Fetching full contract details for:', { 
      contractId, 
      userEmail: user.email 
    })
    
    try {
      setLoading(true)
      const apiUrl = `/api/contracts/${contractId}`
      console.log('[ContractSigning] Calling contract API:', apiUrl)
      
      const response = await fetch(apiUrl)
      console.log('[ContractSigning] Contract API response status:', response.status)
      
      if (!response.ok) {
        if (response.status === 404) {
          console.log('[ContractSigning] Contract not found')
          setError('Contract not found')
          return
        }
        throw new Error(`Failed to load contract: ${response.status}`)
      }
      
      const contractData = await response.json()
      console.log('[ContractSigning] Contract data received:', {
        id: contractData.id,
        title: contractData.title,
        status: contractData.status,
        ownerId: contractData.ownerId,
        signers: contractData.metadata?.signers || [],
        signatureCount: contractData.signatures?.length || 0
      })
      
      setContract(contractData)
      
      // Check if user can sign
      if (user?.email) {
        const signerEmails = contractData.metadata?.signers || []
        console.log('[ContractSigning] Checking if user can sign:', { 
          userEmail: user.email, 
          contractSigners: signerEmails 
        })
        
        const userCanSign = canUserSignContract(user.email, signerEmails, contractData)
        console.log('[ContractSigning] User can sign:', userCanSign)
        setCanSign(userCanSign)
        
        // Check current signature status
        const status = getUserSignatureStatus(user.email, contractData)
        console.log('[ContractSigning] User signature status:', status)
        setSignatureStatus(status)
        
        // If this contract has specific required signers, save the first one
        if (!userCanSign && signerEmails.length > 0) {
          console.log('[ContractSigning] User cannot sign, required email is:', signerEmails[0])
          setRequiredEmail(signerEmails[0])
          setShowLoginModal(true)
        }
      }
    } catch (err) {
      const errorMsg = 'Error loading contract. Please try again.'
      console.error('[ContractSigning] Contract fetch error:', err)
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }, [contractId, user, setLoading, setContract, setCanSign, setSignatureStatus, setRequiredEmail, setShowLoginModal, setError])
  
  // Load contract data and check if login is needed
  useEffect(() => {
    console.log('[ContractSigning] Auth state update:', { 
      isLoading, 
      isAuthenticated, 
      userEmail: user?.email,
      contractId,
      location: typeof window !== 'undefined' ? window.location.href : 'SSR'
    });
    
    if (isLoading) {
      console.log('[ContractSigning] Still loading auth state...');
      return
    }
    
    if (!isAuthenticated) {
      console.log('[ContractSigning] User not authenticated, showing login modal');
      setShowLoginModal(true)
      
      // Check if we have a stored redirect path
      const storedPath = localStorage.getItem('zkLoginRedirectPath')
      console.log('[ContractSigning] Found stored redirect path:', storedPath)
      
      // Check if we have a stored contract ID
      const storedContractId = localStorage.getItem('pendingSignatureContractId')
      console.log('[ContractSigning] Found stored pending contract ID:', storedContractId)
      
      // Fetch basic contract info to get the signer email
      console.log('[ContractSigning] Fetching basic contract info to determine required email')
      fetchContractBasicInfo()
      return
    }
    
    console.log('[ContractSigning] User authenticated, fetching full contract')
    fetchContract()
  }, [contractId, isAuthenticated, isLoading, user?.email, fetchContractBasicInfo, fetchContract]);
  
  const handleSignatureCapture = (data: string) => {
    console.log('[ContractSigning] Signature captured, data length:', data.length)
    setSignatureData(data)
  }
  
  const handleSignContract = async () => {
    console.log('[ContractSigning] Starting signature process for contract:', contractId);
    
    if (!signatureData || !user?.email || !userAddress) {
      console.log('[ContractSigning] Cannot sign contract, missing required data:', {
        hasSignatureData: !!signatureData,
        hasUserEmail: !!user?.email,
        hasUserAddress: !!userAddress
      })
      return
    }
    
    console.log('[ContractSigning] Signature data validation passed, proceeding with signature process');
    console.log('[ContractSigning] User authenticated:', {
      userEmail: user.email,
      walletAddress: userAddress.substring(0, 10) + '...',
    });
    
    try {
      setSaving(true)
      console.log('[ContractSigning] Setting saving state to true');
      
      const apiUrl = '/api/signatures'
      console.log('[ContractSigning] Preparing API call to:', apiUrl)
      
      // Generate document data
      console.log('[ContractSigning] Generating document content from contract data');
      const documentBase64 = contract ? generateContractDocument(contract) : '';
      console.log('[ContractSigning] Document generation complete, base64 length:', documentBase64.length);
      
      const requestData = {
        contractId,
        userEmail: user.email,
        walletAddress: userAddress,
        signature: signatureData
      }
      console.log('[ContractSigning] Prepared signature request payload:', {
        contractId,
        userEmail: user.email,
        walletAddressLength: userAddress.length,
        signatureLength: signatureData.length
      });
      
      console.log('[ContractSigning] Sending POST request to signatures API');
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
      })
      
      console.log('[ContractSigning] Signature API response received:', {
        status: response.status,
        ok: response.ok,
        statusText: response.statusText
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('[ContractSigning] Signature API error details:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        })
        throw new Error(`Failed to sign contract: ${response.status} ${response.statusText}`)
      }
      
      const responseData = await response.json()
      console.log('[ContractSigning] Signature API success response:', responseData)
      
      // Update local state
      console.log('[ContractSigning] Updating local signature status to SIGNED')
      setSignatureStatus('SIGNED')
      
      // Refresh contract data to show updated state
      console.log('[ContractSigning] Fetching updated contract data after signature')
      const updatedContract = await fetch(`/api/contracts/${contractId}`).then(res => res.json())
      console.log('[ContractSigning] Updated contract data received:', {
        id: updatedContract.id,
        status: updatedContract.status,
        signatureCount: updatedContract.signatures?.length || 0,
        allRequiredSignersHaveSigned: updatedContract.status === 'COMPLETED' || updatedContract.status === 'ACTIVE'
      })
      setContract(updatedContract)
      
      // If contract is now COMPLETED and user is the owner, upload to Walrus
      if (updatedContract.status === 'COMPLETED' && updatedContract.owner?.email === user.email) {
        console.log('[ContractSigning] Contract COMPLETED and current user is owner, proceeding with Walrus upload');
        console.log('[ContractSigning] Contract owner details:', {
          ownerEmail: updatedContract.owner?.email,
          currentUserEmail: user.email,
          isMatch: updatedContract.owner?.email === user.email
        });
        
        try {
          console.log('[ContractSigning] Preparing Walrus upload request with document data');
          console.log('[ContractSigning] Document base64 length for Walrus upload:', documentBase64.length);
          
          // Get the document content from the base64 we generated above
          console.log('[DEBUG] Attempting to upload to URL:', apiUrl);
          console.log('[DEBUG] Request data:', {
            contractId,
            documentContent: documentBase64 ? documentBase64.length + ' bytes' : 'none',
            isBase64: true,
          });
          
          console.log('[ContractSigning] Sending POST request to upload_contract API');
          const walrusUploadResponse = await fetch('/api/upload_contract', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              contractId: contractId,
              contractContent: documentBase64,
              isBase64: true,
              context: 'testnet',
              deletable: false
            })
          })
          
          console.log('[ContractSigning] Walrus upload API response received:', {
            status: walrusUploadResponse.status,
            ok: walrusUploadResponse.ok,
            statusText: walrusUploadResponse.statusText
          });
          
          if (!walrusUploadResponse.ok) {
            console.error('[ContractSigning] Walrus upload failed with status:', walrusUploadResponse.status);
            const errorText = await walrusUploadResponse.text().catch(e => 'Could not parse error response');
            console.error('[ContractSigning] Walrus upload error details:', errorText);
            // Don't throw error here - contract is still signed, just not uploaded to Walrus
          } else {
            const walrusData = await walrusUploadResponse.json()
            console.log('[ContractSigning] ✅ Contract successfully uploaded to Walrus:', walrusData);
            console.log('[ContractSigning] Walrus response keys:', Object.keys(walrusData));
            
            if (walrusData.walrusResponse) {
              console.log('[ContractSigning] Walrus raw response analysis:');
              console.log('[ContractSigning] - Keys in response:', Object.keys(walrusData.walrusResponse));
              
              // If there's a blob ID in the response, log it
              const blobId = walrusData.walrusResponse.newlyCreated?.blobObject?.blobId || 
                            walrusData.walrusResponse.alreadyCertified?.blobId;
              
              if (blobId) {
                console.log('[ContractSigning] 🎉 Contract permanently stored on Walrus with blob ID:', blobId);
              }
            }
            
            // Update the contract record with Walrus blob ID if applicable
            // This would require an additional API endpoint to update contract metadata
            // For now, we just log the success
          }
        } catch (walrusErr: any) {
          console.error('[ContractSigning] Exception during Walrus upload:', walrusErr);
          console.error('[ContractSigning] Error details:', {
            name: walrusErr.name,
            message: walrusErr.message,
            stack: walrusErr.stack
          });
          // Don't throw error - contract is still signed, just not uploaded to Walrus
        }
      } else {
        console.log('[ContractSigning] Skipping Walrus upload:', {
          contractStatus: updatedContract.status,
          isCompleted: updatedContract.status === 'COMPLETED',
          ownerEmail: updatedContract.owner?.email,
          currentUserEmail: user.email,
          isOwner: updatedContract.owner?.email === user.email
        });
      }
      
    } catch (err: any) {
      const errorMsg = 'Error signing contract. Please try again.'
      console.error('[ContractSigning] Exception in signing process:', {
        error: err,
        message: err.message,
        stack: err.stack
      });
      setError(errorMsg)
    } finally {
      console.log('[ContractSigning] Signature process complete, resetting saving state');
      setSaving(false)
    }
  }
  
  if (isLoading || loading) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>Contract</CardTitle>
          </CardHeader>
          <CardContent className="min-h-[500px]">
            <div className="opacity-40">
              <div className="border rounded-md p-6 bg-gray-50 mb-4">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="h-5 w-5 text-blue-600" />
                  <h3 className="text-lg font-medium">Contract Details</h3>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-500">Created By:</span>
                      <p className="h-4 bg-slate-200 rounded w-32 mb-2"></p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-500">Created On:</span>
                      <p className="h-4 bg-slate-200 rounded w-24"></p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-500">Status:</span>
                      <p className="h-4 bg-slate-200 rounded w-24"></p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-500">Signers:</span>
                      <p className="h-4 bg-slate-200 rounded w-24"></p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="border rounded-md p-6">
                <div className="prose max-w-none">
                  <h3 className="text-lg font-medium mb-4">Contract Content</h3>
                  <div className="h-4 bg-slate-200 rounded w-full mb-2"></div>
                  <div className="h-4 bg-slate-200 rounded w-full mb-2"></div>
                  <div className="h-4 bg-slate-200 rounded w-3/4 mb-2"></div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {showLoginModal && (
          <SignZkLoginModal 
            open={showLoginModal} 
            onOpenChange={setShowLoginModal}
            requiredEmail={requiredEmail}
          />
        )}
      </div>
    )
  }
  
  if (error) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>Error</CardTitle>
          </CardHeader>
          <CardContent className="min-h-[300px] flex flex-col items-center justify-center">
            <AlertTriangle className="h-16 w-16 text-red-500 mb-4" />
            <p className="text-center text-gray-700 mb-6">{error}</p>
            <Button onClick={() => router.push('/sign')}>
              Back to Documents
            </Button>
          </CardContent>
        </Card>
        
        {showLoginModal && (
          <SignZkLoginModal 
            open={showLoginModal} 
            onOpenChange={setShowLoginModal}
            requiredEmail={requiredEmail}
          />
        )}
      </div>
    )
  }
  
  if (!isAuthenticated) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>Sign In Required</CardTitle>
            <CardDescription>
              {requiredEmail 
                ? `Please sign in with ${requiredEmail} to view and sign this document`
                : 'Please sign in to view and sign this document'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center min-h-[300px]">
            <LockKeyhole className="h-16 w-16 text-gray-400 mb-4" />
            <p className="text-center text-gray-600 mb-6">
              Authentication is required to access this contract
            </p>
          </CardContent>
        </Card>
        
        {showLoginModal && (
          <SignZkLoginModal 
            open={showLoginModal} 
            onOpenChange={setShowLoginModal}
            requiredEmail={requiredEmail}
          />
        )}
      </div>
    )
  }
  
  if (!canSign) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>Not Authorized</CardTitle>
            <CardDescription>You are not authorized to sign this contract</CardDescription>
          </CardHeader>
          <CardContent className="min-h-[300px] flex flex-col items-center justify-center">
            <AlertTriangle className="h-16 w-16 text-yellow-500 mb-4" />
            <p className="text-center text-gray-700 mb-6">
              {requiredEmail 
                ? `This document must be signed with ${requiredEmail}. You are currently signed in as ${user?.email}.`
                : 'This contract is not addressed to you. Only authorized signers can view and sign this contract.'}
            </p>
            <div className="flex gap-4">
              <Button onClick={() => router.push('/sign')} variant="outline">
                Back to Documents
              </Button>
              {requiredEmail && (
                <Button onClick={() => setShowLoginModal(true)}>
                  Sign in with {requiredEmail}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        
        {showLoginModal && (
          <SignZkLoginModal 
            open={showLoginModal} 
            onOpenChange={setShowLoginModal}
            requiredEmail={requiredEmail}
          />
        )}
      </div>
    )
  }
  
  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{contract?.title || 'Contract'}</CardTitle>
              <CardDescription>
                {contract?.description || ''}
              </CardDescription>
            </div>
            {signatureStatus === 'SIGNED' && (
              <div className="flex items-center bg-green-50 text-green-700 px-3 py-1 rounded-full">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                <span className="text-sm font-medium">Signed</span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="border rounded-md p-6 bg-gray-50">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="h-5 w-5 text-blue-600" />
                <h3 className="text-lg font-medium">Contract Details</h3>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-500">Created By:</span>
                    <p>{contract?.owner?.name || contract?.owner?.email || 'Unknown'}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-500">Created On:</span>
                    <p>{contract ? format(new Date(contract.createdAt), 'MMM dd, yyyy') : 'Unknown'}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-500">Status:</span>
                    <p>{contract ? contract.status.charAt(0) + contract.status.slice(1).toLowerCase() : 'Unknown'}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-500">Signers:</span>
                    <p>{contract?.metadata?.signers?.length || 0} signers required</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="border rounded-md p-6">
              <div className="prose max-w-none">
                <h3 className="text-lg font-medium mb-4">Contract Content</h3>
                {contract?.content ? (
                  <pre className="whitespace-pre-wrap text-sm p-4 border rounded-md bg-gray-50">{contract.content}</pre>
                ) : (
                  <p className="text-gray-500 italic">No content available</p>
                )}
              </div>
            </div>
            
            {signatureStatus === 'PENDING' && (
              <SignatureDrawingCanvas 
                onSave={handleSignatureCapture}
                disabled={signatureStatus !== 'PENDING'}
              />
            )}
            
            {signatureStatus === 'SIGNED' && (
              <div className="border rounded-md p-6 bg-green-50">
                <div className="flex items-center justify-center flex-col">
                  <CheckCircle2 className="h-12 w-12 text-green-600 mb-4" />
                  <h3 className="text-lg font-medium text-green-700">Contract Successfully Signed</h3>
                  <p className="text-sm text-green-600 mt-2">
                    You have successfully signed this contract.
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={() => router.push('/sign')}>
            Back to Documents
          </Button>
          
          {signatureStatus === 'PENDING' && (
            <Button 
              onClick={handleSignContract} 
              disabled={!signatureData || saving}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saving ? 'Saving...' : 'Sign Contract'}
            </Button>
          )}
        </CardFooter>
      </Card>
      
      {showLoginModal && (
        <SignZkLoginModal 
          open={showLoginModal} 
          onOpenChange={setShowLoginModal}
          requiredEmail={requiredEmail}
        />
      )}
    </div>
  )
} 