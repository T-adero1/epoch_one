import { getBaseUrl } from './url';

export const generateSigningLink = (contractId: string): string => {
  return `${getBaseUrl()}/sign/${contractId}`;
};

// Function to check if a user can sign a contract
export const canUserSignContract = (userEmail: string, contractSigners: string[], contract?: any): boolean => {
  if (!userEmail) return false;
  
  // Always allow if the user is in the signers list
  if (contractSigners && contractSigners.length > 0) {
    const isInSignersList = contractSigners.some(signer => 
      signer.toLowerCase() === userEmail.toLowerCase()
    );
    
    if (isInSignersList) {
      return true;
    }
  }
  
  // If user is not in signers list, check if they're the contract owner
  // and if the contract is in ACTIVE status (meaning all signers have signed)
  if (contract && contract.ownerId && contract.status === 'ACTIVE') {
    // Check if user's email matches the contract owner's email
    if (contract.owner && contract.owner.email && 
        contract.owner.email.toLowerCase() === userEmail.toLowerCase()) {
      return true;
    }
    
    // Alternative check if we only have ownerId but not the owner object
    if (contract.ownerId === userEmail) {
      return true;
    }
  }
  
  return false;
};

// Function to check if all signatures are collected
export const areAllSignaturesDone = (
  signers: string[], 
  signatures: Array<{
    user: {
      email: string;
    };
    status: 'SIGNED' | 'PENDING';
  }>
): boolean => {
  // If there are no signers, return false
  if (!signers || signers.length === 0) return false;
  
  // If there are fewer signatures than signers, return false
  if (!signatures || signatures.length < signers.length) return false;
  
  // Check if all signers have a corresponding signature
  return signers.every(signer => 
    signatures.some(sig => 
      sig.user.email.toLowerCase() === signer.toLowerCase() && 
      sig.status === 'SIGNED'
    )
  );
};

// Function to get the signature status for a user
export const getUserSignatureStatus = (
  userEmail: string,
  contract: {
    ownerId?: string;
    status?: string;
    metadata?: {
      signers?: string[];
    };
    signatures?: Array<{
      user: {
        email: string;
      };
      status: 'SIGNED' | 'PENDING';
    }>;
    owner?: {
      email?: string;
    };
  }
): 'SIGNED' | 'PENDING' | 'NOT_REQUIRED' => {
  const signers = contract.metadata?.signers || [];
  
  // Check if user is a designated signer
  const isDesignatedSigner = signers.some(s => s.toLowerCase() === userEmail.toLowerCase());
  
  if (isDesignatedSigner) {
    const signature = contract.signatures?.find(
      sig => sig.user.email.toLowerCase() === userEmail.toLowerCase()
    );
    
    return signature?.status === 'SIGNED' ? 'SIGNED' : 'PENDING';
  }
  
  // Check if user is the contract owner and contract is in ACTIVE status
  const isOwner = (contract.owner?.email?.toLowerCase() === userEmail.toLowerCase()) ||
                 (contract.ownerId === userEmail);
                 
  if (isOwner && contract.status === 'ACTIVE') {
    const signature = contract.signatures?.find(
      sig => sig.user.email.toLowerCase() === userEmail.toLowerCase()
    );
    
    return signature?.status === 'SIGNED' ? 'SIGNED' : 'PENDING';
  }
  
  return 'NOT_REQUIRED';
};