'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useZkLogin } from '@/app/contexts/ZkLoginContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { FileText, AlertTriangle, CheckCircle2, LockKeyhole, Download } from 'lucide-react'
import SignatureDrawingCanvas from '@/components/contracts/SignatureCanvas'
import { canUserSignContract, getUserSignatureStatus } from '@/app/utils/signatures'
import { format } from 'date-fns'
import { SignZkLoginModal } from '@/components/SignZkLoginModal'


import ClientSideEncryptor from '@/components/contracts/ClientSideEncryptor'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { 
  createSHA256Hash, 
  signData, 
  getSignableContractContent,
  type ZkSignatureData 
} from '@/app/utils/zkSignatures'

import { 
  authenticateUserForContract, 
  getAuthorizationMessage,
  type ContractAuthData,
  type AuthenticationResult 
} from '@/app/utils/signingAuth'

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
  s3FileKey?: string;
  s3FileName?: string;
  s3ContentType?: string;
}

// Near the top of the file, after the imports and interface definitions
// Add this helper function for generating contract document

function generateContractDocument(contractData: ContractDetail): string {
  console.log('[ContractDocument] Starting document generation for contract:', contractData.id);
  
  const contractText = contractData.content || '';
  const title = contractData.title || 'Untitled Contract';
  const signers = contractData.metadata?.signers || [];
  
  // Get creator information
  const creatorEmail = contractData.owner?.email || contractData.owner?.name || 'Unknown Creator';
  
  // Format signers list
  const signersText = signers.length > 0 ? signers.join(', ') : 'No signers';
  
  console.log('[ContractDocument] Document details:', {
    title,
    status: contractData.status,
    contentLength: contractText.length,
    creatorEmail,
    signerCount: signers.length,
    signatureCount: contractData.signatures?.length || 0
  });
  
  // Create a simple text representation with Party A and Party B
  const documentContent = `
    TITLE: ${title}
    STATUS: ${contractData.status}
    CREATED: ${new Date(contractData.createdAt).toISOString()}
    
    CONTRACT CREATOR (PARTY A): ${creatorEmail}
    SIGNERS (PARTY B): ${signersText}
    
    CONTRACT DETAILS:
    ${contractText}
    
    
  `;
  
  console.log('[ContractDocument] Document generated successfully. Plain text length:', documentContent.length);
  return documentContent;
}



export default function ContractSigningPage() {
  const { contractId } = useParams() as { contractId: string }
  const { isAuthenticated, isLoading, user, userAddress, zkLoginState, logout } = useZkLogin()
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
  const [showEncryptor, setShowEncryptor] = useState(false)
  const [encryptionData, setEncryptionData] = useState<{
    documentBase64: string;
    signerAddresses: string[];
    signerEmails: string[];
  } | null>(null)
  const [pdfContent, setPdfContent] = useState<Uint8Array | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  
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
        console.log('[ContractSigning] Contract has signers:', data.signers)
        // Don't set requiredEmail - allow any signer to authenticate
      } else {
        console.log('[ContractSigning] No signers found in contract metadata')
      }
    } catch (err) {
      console.error('[ContractSigning] Error fetching basic contract info:', err)
    }
  }, [contractId, setError])
  
  // Fetch full contract details when authenticated
  const fetchContract = useCallback(async () => {
    if (!user?.email || !user?.googleId) {
      console.log('[ContractSigning] Cannot fetch contract: No user email or googleId available')
      return
    }
    
    console.log('[ContractSigning] Fetching full contract details for:', { 
      contractId, 
      userEmail: user.email,
      userGoogleId: user.googleId
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
      
      // ✅ UPDATED: Use the corrected authentication logic (email-based, not JWT-based)
      if (user?.email && user?.googleId) {
        console.log('[ContractSigning] Authenticating user with predetermined wallet logic...');
        
        const authResult: AuthenticationResult = await authenticateUserForContract(
          user.email,
          user.googleId,
          contractData as ContractAuthData
        );
        
        console.log('[ContractSigning] Authentication result:', authResult);
        setCanSign(authResult.canSign);
        
        // Store the authorization message for display
        if (!authResult.canSign) {
          const message = getAuthorizationMessage(authResult, user.email);
          console.log('[ContractSigning] Authorization message:', message);
        }
        
        // Check current signature status
        const status = getUserSignatureStatus(user.email, contractData);
        setSignatureStatus(status);
        
        // If user cannot sign, show appropriate message
        if (!authResult.canSign) {
          console.log('[ContractSigning] User cannot sign - reason:', authResult.reason);
          setRequiredEmail('authorized_email'); // Generic placeholder for display
          setShowLoginModal(true);
        }
      }
    } catch (err) {
      const errorMsg = 'Error loading contract. Please try again.'
      console.error('[ContractSigning] Contract fetch error:', err)
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }, [contractId, user]); // Removed zkLoginState dependency
  
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
  
  // Add this useEffect to fetch PDF content once when contract loads
  useEffect(() => {
    const fetchPdfContent = async () => {
      if (contract?.s3FileKey && !pdfContent) {
        try {
          console.log('[SignPage] Fetching PDF content for display and signing...');
          
          // Fetch PDF content once
          const response = await fetch(`/api/contracts/download-pdf/${contract.id}?view=inline`);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            setPdfContent(bytes);
            
            // Create blob URL for iframe display
            const blob = new Blob([bytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            setPdfUrl(url);
            
            console.log('[SignPage] PDF content cached for display and signing');
          }
        } catch (error) {
          console.error('[SignPage] Failed to fetch PDF content:', error);
        }
      }
    };

    fetchPdfContent();
    
    // Cleanup blob URL on unmount
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [contract?.s3FileKey]);
  
  const handleSignatureCapture = (data: string) => {
    console.log('[ContractSigning] Signature captured, data length:', data.length)
    setSignatureData(data)
  }
  
  const handleSignContract = async () => {
    console.log('[ContractSigning] Starting signature process for contract:', contractId);
    
    if (!signatureData || !user?.email || !userAddress || !contract) {
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
      
      // NEW: Generate zkLogin signatures following DecryptButton.tsx pattern
      let zkLoginData: ZkSignatureData | null = null;
      if (zkLoginState?.ephemeralKeyPair) {
        try {
          console.log('[ContractSigning] Generating zkLogin signatures...');
          
          // Get session data from localStorage (like DecryptButton does)
          const sessionData = localStorage.getItem('epochone_session');
          if (!sessionData) {
            throw new Error("No session data found in localStorage");
          }
          
          const sessionObj = JSON.parse(sessionData);
          const zkLoginStateFromSession = sessionObj.zkLoginState || sessionObj.user?.zkLoginState;
          
          if (!zkLoginStateFromSession?.ephemeralKeyPair?.privateKey) {
            throw new Error("No ephemeral key private key found in session data");
          }
          
          console.log('[ContractSigning] Found private key in session, creating keypair...');
          
          // Create ephemeral keypair exactly like DecryptButton.tsx
          const ephemeralKeyPair = Ed25519Keypair.fromSecretKey(
            zkLoginStateFromSession.ephemeralKeyPair.privateKey
          );
          
          // 1. Hash the contract content (PDF bytes for PDF contracts, JSON for text contracts)
          let contentHash: string;

          // Check if this is a PDF contract (has uploaded PDF file)
          const isPdfContract = !!(contract.s3FileKey && contract.s3FileName && contract.s3ContentType);

          if (isPdfContract) {
            console.log('[ContractSigning] PDF contract detected, using cached PDF content...');
            
            try {
              if (!pdfContent) {
                throw new Error('PDF content not available - please refresh the page');
              }
              
              // Use cached PDF content for signing
              contentHash = await createSHA256Hash(pdfContent);
              console.log('[ContractSigning] PDF content hashed for signing from cache', {
                pdfSizeBytes: pdfContent.length,
                hashPrefix: contentHash.substring(0, 16) + '...'
              });
            } catch (pdfError) {
              console.error('[ContractSigning] Failed to process cached PDF:', pdfError);
              // Fallback to text content signing
          const contractContent = getSignableContractContent(contract);
              contentHash = await createSHA256Hash(contractContent);
            }
          } else {
            console.log('[ContractSigning] Text contract detected, signing JSON content...');
            
            // Original flow for text contracts - completely unchanged
            const contractContent = getSignableContractContent(contract);
            contentHash = await createSHA256Hash(contractContent);
            console.log('[ContractSigning] Text content hashed for signing', {
              contentLength: contractContent.length,
              hashPrefix: contentHash.substring(0, 16) + '...'
            });
          }
          
          // 2. Hash the signature image (remove data URL prefix)
          const cleanSignature = signatureData.replace(/^data:image\/[a-z]+;base64,/, '');
          const imageHash = await createSHA256Hash(cleanSignature);
          
          // 3. Sign both hashes using the same method as DecryptButton
          console.log('[ContractSigning] Signing content hash...');
          const contentSignature = await signData(contentHash, ephemeralKeyPair);
          
          console.log('[ContractSigning] Signing image hash...');
          const imageSignature = await signData(imageHash, ephemeralKeyPair);
          
          zkLoginData = {
            contentHash,
            contentSignature,
            imageHash,  
            imageSignature,
            timestamp: Date.now(),
            userAddress,
            ephemeralPublicKey: zkLoginStateFromSession.ephemeralKeyPair.publicKey
          };
          
          console.log('[ContractSigning] zkLogin signatures generated successfully:', {
            contentHash: contentHash.substring(0, 16) + '...',
            imageHash: imageHash.substring(0, 16) + '...',
            contentSig: contentSignature.substring(0, 16) + '...',
            imageSig: imageSignature.substring(0, 16) + '...'
          });
          
        } catch (zkError) {
          console.error('[ContractSigning] Failed to generate zkLogin signatures:', zkError);
          // Continue without zkLogin - don't block the traditional signing flow
        }
      }

      const apiUrl = '/api/signatures'
      console.log('[ContractSigning] Preparing API call to:', apiUrl)
      
      // Generate document data
      console.log('[ContractSigning] Generating document content from contract data');
      const documentContent = contract ? generateContractDocument(contract) : '';
      console.log('[ContractSigning] Document generation complete, plain text length:', documentContent.length);
      
      const requestData = {
        contractId,
        userEmail: user.email,
        walletAddress: userAddress,
        signature: signatureData,
        zkLoginData  // Include zkLogin signatures
      }
      console.log('[ContractSigning] Prepared signature request payload:', {
        contractId,
        userEmail: user.email,
        walletAddressLength: userAddress.length,
        signatureLength: signatureData.length,
        hasZkLoginData: !!zkLoginData
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
      
      // Check if we've already uploaded this contract
      if (updatedContract.status === 'COMPLETED' && updatedContract.metadata?.walrusUploaded) {
        console.log('[ContractSigning] Contract already uploaded to Walrus, skipping');
        return;
      }
      
      // If contract is now COMPLETED and user is the owner, encrypt and upload to Walrus
      console.log('[ContractSigning] Checking if contract needs encryption:', {
        status: updatedContract.status,
        isCompleted: updatedContract.status === 'COMPLETED',
        ownerEmail: updatedContract.owner?.email,
        userEmail: user.email,
        isOwner: updatedContract.owner?.email === user.email
      });

      if (updatedContract.status === 'COMPLETED' && updatedContract.owner?.email === user.email) {
        console.log('[ContractSigning] Contract COMPLETED and current user is owner, preparing encryption');
        
        try {
          // Prepare document data
          console.log('[ContractSigning] Preparing document for client-side encryption');
          const documentContent = generateContractDocument(updatedContract);
          console.log('[ContractSigning] Document generated:', {
            plainTextLength: documentContent.length,
            firstBytes: documentContent.substring(0, 50) + '...',
            contractId: updatedContract.id
          });
          
          // Extract the signer emails (other than current user)
          const signerEmails = updatedContract?.metadata?.signers || [];
          console.log('[ContractSigning] Found signer emails:', signerEmails);
          const otherSignerEmails = signerEmails.filter((email: string) => email !== user.email);
          console.log('[ContractSigning] Found other signer emails:', otherSignerEmails);
          
          // Fetch wallet addresses for all other signers
          const signerWalletAddresses = [];
          for (const email of otherSignerEmails) {
            try {
              console.log('[ContractSigning] Fetching wallet address for signer:', email);
              const userApiUrl = `/api/users?email=${encodeURIComponent(email)}`;
              console.log('[ContractSigning] User API URL:', userApiUrl);
              const userResponse = await fetch(userApiUrl);
              console.log('[ContractSigning] User API response:', {
                status: userResponse.status,
                ok: userResponse.ok
              });
              
              if (userResponse.ok) {
                const userData = await userResponse.json();
                console.log('[ContractSigning] User data received:', {
                  hasWalletAddress: !!userData.walletAddress,
                  walletAddressPrefix: userData.walletAddress ? userData.walletAddress.substring(0, 10) : 'none'
                });
                signerWalletAddresses.push(userData.walletAddress || null);
              } else {
                console.error('[ContractSigning] Failed to fetch signer user data:', {
                  status: userResponse.status,
                  statusText: userResponse.statusText
                });
              }
            } catch (err) {
              console.error('[ContractSigning] Error fetching signer wallet address:', {
                error: err,
                message: err instanceof Error ? err.message : 'Unknown error'
              });
            }
          }
          
          // Create final array with ALL addresses
          const signerAddresses = [userAddress, ...signerWalletAddresses].filter(Boolean);
          console.log('[ContractSigning] Prepared signer addresses:', {
            count: signerAddresses.length,
            addresses: signerAddresses.map(addr => addr?.substring(0, 10) + '...')
          });
          
          if (signerAddresses.length > 0) {
            console.log('[ContractSigning] Setting encryption data with:', {
              documentPlainTextLength: documentContent.length,
              signerAddressCount: signerAddresses.length,
              signerEmailCount: signerEmails.length
            });
            
            // Set the encryption data state
            setEncryptionData({
              documentBase64: documentContent,
              signerAddresses,
              signerEmails
            });
            
            console.log('[ContractSigning] Showing encryptor component');
            // Set the flag to show the encryptor component
            setShowEncryptor(true);
          } else {
            throw new Error('No signer addresses available for encryption');
          }
        } catch (encryptionErr) {
          console.error('[ContractSigning] Error preparing encryption:', {
            error: encryptionErr,
            message: encryptionErr instanceof Error ? encryptionErr.message : 'Unknown error',
            stack: encryptionErr instanceof Error ? encryptionErr.stack : 'No stack trace'
          });
        }
      } else {
        console.log('[ContractSigning] Skipping Walrus upload:', {
          contractStatus: updatedContract.status,
          isCompleted: updatedContract.status === 'COMPLETED',
          ownerEmail: updatedContract.owner?.email,
          currentUserEmail: user.email,
          isOwner: updatedContract.owner?.email === user.email,
          metadata: updatedContract.metadata
        });
      }
      
    } catch (err: any) {
      const errorMsg = 'Error signing contract. Please try again.'
      console.error('[ContractSigning] Exception in signing process:', {
        error: err,
        message: err.message,
        stack: err.stack,
        type: err.constructor.name,
        data: err.data
      });
      setError(errorMsg)
    } finally {
      console.log('[ContractSigning] Signature process complete, resetting saving state');
      setSaving(false)
    }
  }
  
  // Add this function near the top of the component, after the other handlers
  const handleSwitchAccount = useCallback(async () => {
    console.log('[ContractSigning] User requesting to switch accounts for required email:', requiredEmail);
    
    try {
      // Store the current contract URL for redirect after login
      const currentUrl = window.location.href;
      console.log('[ContractSigning] Storing current URL for post-login redirect:', currentUrl);
      localStorage.setItem('zkLoginRedirectPath', window.location.pathname);
      localStorage.setItem('pendingSignatureContractId', contractId);
      
      // If there's a required email, store it for verification
      if (requiredEmail) {
        console.log('[ContractSigning] Storing required email for verification:', requiredEmail);
        localStorage.setItem('zkLoginRequiredEmail', requiredEmail);
      }
      
      // Set redirect flag
      localStorage.setItem('zklogin_redirect_in_progress', 'true');
      
      console.log('[ContractSigning] Logging out current user...');
      logout();
      
      // The useEffect will detect the logout and show the login modal
      // which will then redirect to the stored path after successful login
      
    } catch (error) {
      console.error('[ContractSigning] Error in switch account flow:', error);
    }
  }, [requiredEmail, contractId, logout]);

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
              
              <div className="border rounded-md p-4 sm:p-6">
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
            <Button onClick={() => router.push('/dashboard')}>
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
                ? `Please sign in with the authorized email address to view and sign this document`
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
                ? `This document must be signed with the authorized email address. You are currently signed in as ${user?.email}.`
                : 'This contract is not addressed to you. Only authorized signers can view and sign this contract.'}
            </p>
            <div className="flex gap-4">
              <Button onClick={() => router.push('/dashboard')} variant="outline">
                Back to Documents
              </Button>
              {requiredEmail && (
                <Button onClick={() => handleSwitchAccount()}>
                  Sign in with authorized email
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
    <div className="container mx-auto p-4 sm:p-6 max-w-4xl">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="min-w-0">
              <CardTitle className="text-lg sm:text-xl">{contract?.title || 'Contract'}</CardTitle>
              <CardDescription className="text-sm">
                {contract?.description || ''}
              </CardDescription>
            </div>
            {signatureStatus === 'SIGNED' && (
              <div className="flex items-center bg-green-50 text-green-700 px-3 py-1 rounded-full self-start sm:self-auto">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                <span className="text-sm font-medium">Signed</span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="border rounded-md p-4 sm:p-6 bg-gray-50">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="h-5 w-5 text-blue-600" />
                <h3 className="text-lg font-medium">Contract Details</h3>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-500">Created By:</span>
                    <p className="break-words">{contract?.owner?.name || contract?.owner?.email || 'Unknown'}</p>
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
            
            <div className="border rounded-md p-4 sm:p-6">
              <div className="prose max-w-none">
                <h3 className="text-lg font-medium mb-4">Contract Content</h3>
                
                {contract?.s3FileKey ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <FileText className="h-5 w-5 text-blue-600" />
                      <div>
                        <p className="text-sm font-medium text-blue-900">
                          PDF Contract: {contract.s3FileName || 'contract.pdf'}
                        </p>
                        <p className="text-xs text-blue-700">
                          Please review the document below before signing
                        </p>
                      </div>
                    </div>
                    
                    {/* Mobile-Optimized PDF Viewer */}
                    <div className="border rounded-lg overflow-hidden bg-gray-50">
                      {pdfUrl ? (
                        <div className="flex flex-col">
                          {/* Mobile: Show button to open PDF in browser */}
                          <div className="lg:hidden p-4 text-center space-y-4">
                            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
                              <FileText className="h-8 w-8 text-red-600" />
                            </div>
                            <div className="space-y-2">
                              <h4 className="font-semibold text-gray-900">
                                {contract.s3FileName || 'Contract PDF'}
                              </h4>
                              <p className="text-sm text-gray-600">
                                Open the PDF in your browser for better viewing on mobile
                              </p>
                            </div>
                            <Button
                              onClick={() => {
                                window.open(pdfUrl, '_blank');
                              }}
                              className="bg-blue-600 hover:bg-blue-700 text-white w-full max-w-sm"
                              size="lg"
                            >
                              <FileText className="h-4 w-4 mr-2" />
                              Open PDF in Browser
                            </Button>
                            <p className="text-xs text-gray-500 mt-2">
                              After reviewing the PDF, return here to sign the contract
                            </p>
                          </div>
                          
                          {/* Desktop: Show iframe as before */}
                          <div className="hidden lg:block">
                            <iframe
                              src={pdfUrl}
                              className="w-full h-[600px]"
                              title="Contract PDF"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="p-6 text-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
                          <p className="text-gray-600">Loading PDF...</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  contract?.content ? (
                    <pre className="whitespace-pre-wrap text-xs sm:text-sm p-4 border rounded-md bg-gray-50 overflow-x-auto">
                      {contract.content}
                    </pre>
                ) : (
                  <p className="text-gray-500 italic">No content available</p>
                  )
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
              <div className="border rounded-md p-4 sm:p-6 bg-green-50">
                <div className="flex items-center justify-center flex-col">
                  <CheckCircle2 className="h-12 w-12 text-green-600 mb-4" />
                  <h3 className="text-lg font-medium text-green-700">Contract Successfully Signed</h3>
                  <p className="text-sm text-green-600 mt-2 text-center">
                    You have successfully signed this contract.
                  </p>
                </div>
              </div>
            )}

            {showEncryptor && encryptionData && (
              <div className="border rounded-md p-6 bg-blue-50 mt-4">
                <h3 className="text-lg font-medium mb-4">Encrypting Document</h3>
                <p className="mb-4">Your contract has been signed. Encrypting for secure storage...</p>
                
                <ClientSideEncryptor
                  contractId={contractId}
                  documentContent={encryptionData.documentBase64}
                  signerAddresses={encryptionData.signerAddresses}
                  signerEmails={encryptionData.signerEmails}
                  autoStart={true}
                  showLogs={false}
                  onSuccess={(data) => {
                    console.log('[ContractSigning] Encryption successful:', data);
                    setShowEncryptor(false);
                  }}
                  onError={(err) => {
                    console.error('[ContractSigning] Encryption error:', err);
                  }}
                />
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col-reverse sm:flex-row justify-between gap-3 px-4 sm:px-6">
          <Button variant="outline" onClick={() => router.push('/dashboard')} className="w-full sm:w-auto">
            Back to Documents
          </Button>
          
          {signatureStatus === 'PENDING' && (
            <Button 
              onClick={handleSignContract} 
              disabled={!signatureData || saving}
              className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
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