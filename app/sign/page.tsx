'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useZkLogin } from '@/app/contexts/ZkLoginContext'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileSignature, ChevronRight, Mail, Calendar, User } from 'lucide-react'
import { format } from 'date-fns'
import { Skeleton } from '@/components/ui/skeleton'
import { SignZkLoginModal } from '@/components/SignZkLoginModal'

interface ContractToSign {
  id: string
  title: string
  description: string | null
  createdAt: Date
  updatedAt: Date
  owner: {
    name: string | null
    email: string
  }
}

export default function SignPage() {
  const { isAuthenticated, isLoading, user } = useZkLogin()
  const [contracts, setContracts] = useState<ContractToSign[]>([])
  const [loading, setLoading] = useState(true)
  const [showLoginModal, setShowLoginModal] = useState(false)
  const router = useRouter()

  // Check authentication status and show login modal if needed
  useEffect(() => {
    console.log('[SignPage] Auth state update:', { 
      isLoading, 
      isAuthenticated, 
      userEmail: user?.email,
      location: typeof window !== 'undefined' ? window.location.href : 'SSR'
    });

    // Check if we were redirected here after login
    if (typeof window !== 'undefined') {
      const storedContractId = localStorage.getItem('pendingSignatureContractId');
      const storedPath = localStorage.getItem('zkLoginRedirectPath');
      
      console.log('[SignPage] Checking for stored navigation data:', {
        storedContractId,
        storedPath
      });
      
      // If we have stored path and we're authenticated, redirect
      if (storedPath && isAuthenticated && !isLoading) {
        console.log('[SignPage] Auth complete, redirecting to stored path:', storedPath);
        
        // Clear stored data
        localStorage.removeItem('pendingSignatureContractId');
        localStorage.removeItem('zkLoginRedirectPath');
        
        if (storedPath !== window.location.pathname) {
          console.log('[SignPage] Initiating redirect to:', storedPath);
          router.push(storedPath);
          return;
        } else {
          console.log('[SignPage] Already at stored path, no redirect needed');
        }
      }
    }
    
    if (!isLoading && !isAuthenticated) {
      console.log('[SignPage] User not authenticated, showing login modal');
      setShowLoginModal(true);
    } else if (isAuthenticated && user?.email) {
      console.log('[SignPage] User authenticated, fetching contracts');
      fetchContractsToSign();
    }
  }, [isLoading, isAuthenticated, user?.email, router]);

  const fetchContractsToSign = async () => {
    if (!user?.email) {
      console.log('SignPage - Cannot fetch contracts: No user email available');
      return
    }
    
    console.log('SignPage - Fetching contracts to sign for user:', user.email);
    
    try {
      setLoading(true)
      const url = `/api/signatures/pending?email=${encodeURIComponent(user.email)}`
      console.log('SignPage - Fetching from:', url);
      
      const response = await fetch(url)
      console.log('SignPage - API response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch contracts: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json()
      console.log('SignPage - Fetched contracts:', data.length > 0 ? data : 'No contracts found');
      setContracts(data)
    } catch (error) {
      console.error('SignPage - Error fetching contracts to sign:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleViewContract = (contractId: string) => {
    console.log('SignPage - Navigating to contract:', contractId);
    router.push(`/sign/${contractId}`)
  }

  if (isLoading || (loading && isAuthenticated)) {
    console.log('SignPage - Rendering loading state');
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
        
        {showLoginModal && <SignZkLoginModal open={true} onOpenChange={setShowLoginModal} />}
      </div>
    )
  }

  console.log('SignPage - Rendering main content, contracts found:', contracts.length);
  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Documents Awaiting Your Signature</CardTitle>
          <CardDescription>
            The following documents have been shared with you for signature
          </CardDescription>
        </CardHeader>
        <CardContent>
          {contracts.length === 0 ? (
            <div className="text-center py-12 border rounded-md bg-gray-50">
              <FileSignature className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500 font-medium mb-1">No documents to sign</p>
              <p className="text-sm text-gray-400">
                You don't have any pending documents that require your signature
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {contracts.map((contract) => (
                <div 
                  key={contract.id} 
                  className="flex items-center justify-between p-4 border rounded-md hover:border-blue-200 hover:bg-blue-50 cursor-pointer transition-colors"
                  onClick={() => handleViewContract(contract.id)}
                >
                  <div className="flex items-center space-x-4">
                    <div className="bg-blue-100 p-3 rounded-full">
                      <FileSignature className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{contract.title}</h3>
                      <div className="flex flex-col space-y-1 mt-1 text-sm text-gray-500">
                        <div className="flex items-center gap-1">
                          <User className="h-3.5 w-3.5" />
                          <span>From: {contract.owner.name || contract.owner.email}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>Sent: {format(new Date(contract.createdAt), 'MMM dd, yyyy')}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
        <CardFooter className="justify-center border-t pt-4">
          <Button variant="outline" onClick={() => router.push('/dashboard')}>
            Back to Dashboard
          </Button>
        </CardFooter>
      </Card>
      
      {showLoginModal && <SignZkLoginModal open={true} onOpenChange={setShowLoginModal} />}
    </div>
  )
} 