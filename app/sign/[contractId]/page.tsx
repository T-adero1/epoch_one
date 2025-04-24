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
        
        const userCanSign = canUserSignContract(user.email, signerEmails)
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
    if (!signatureData || !user?.email || !userAddress) {
      console.log('[ContractSigning] Cannot sign contract, missing required data:', {
        hasSignatureData: !!signatureData,
        hasUserEmail: !!user?.email,
        hasUserAddress: !!userAddress
      })
      return
    }
    
    console.log('[ContractSigning] Starting contract signing process for:', {
      contractId,
      userEmail: user.email,
      hasWalletAddress: !!userAddress,
      signatureDataLength: signatureData.length
    })
    
    try {
      setSaving(true)
      
      const apiUrl = '/api/signatures'
      console.log('[ContractSigning] Calling signatures API:', apiUrl)
      
      const requestData = {
        contractId,
        userEmail: user.email,
        walletAddress: userAddress,
        signature: signatureData
      }
      console.log('[ContractSigning] Signature request data:', {
        ...requestData,
        signature: signatureData ? `${signatureData.substring(0, 30)}...` : null
      })
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
      })
      
      console.log('[ContractSigning] Signature API response status:', response.status)
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('[ContractSigning] Signature API error:', {
          status: response.status,
          error: errorData
        })
        throw new Error('Failed to sign contract')
      }
      
      const responseData = await response.json()
      console.log('[ContractSigning] Signature created successfully:', responseData)
      
      // Update local state
      console.log('[ContractSigning] Updating signature status to SIGNED')
      setSignatureStatus('SIGNED')
      
      // Refresh contract data to show updated state
      console.log('[ContractSigning] Refreshing contract data')
      const updatedContract = await fetch(`/api/contracts/${contractId}`).then(res => res.json())
      console.log('[ContractSigning] Updated contract data received:', {
        id: updatedContract.id,
        status: updatedContract.status,
        signatureCount: updatedContract.signatures?.length || 0
      })
      setContract(updatedContract)
      
    } catch (err) {
      const errorMsg = 'Error signing contract. Please try again.'
      console.error('[ContractSigning] Contract signing error:', err)
      setError(errorMsg)
    } finally {
      setSaving(false)
    }
  }
  
  if (isLoading || loading) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>Loading Contract...</CardTitle>
          </CardHeader>
          <CardContent className="min-h-[500px] flex items-center justify-center">
            <div className="animate-pulse flex flex-col items-center">
              <div className="rounded-full bg-slate-200 h-16 w-16 mb-4"></div>
              <div className="h-4 bg-slate-200 rounded w-32 mb-2"></div>
              <div className="h-4 bg-slate-200 rounded w-24"></div>
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
              <CardTitle>{contract.title}</CardTitle>
              <CardDescription>
                {contract.description}
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
                    <p>{contract.owner?.name || contract.owner?.email}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-500">Created On:</span>
                    <p>{format(new Date(contract.createdAt), 'MMM dd, yyyy')}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-500">Status:</span>
                    <p>{contract.status.charAt(0) + contract.status.slice(1).toLowerCase()}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-500">Signers:</span>
                    <p>{contract.metadata?.signers?.length || 0} signers required</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="border rounded-md p-6">
              <div className="prose max-w-none">
                <h3 className="text-lg font-medium mb-4">Contract Content</h3>
                {contract.content ? (
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