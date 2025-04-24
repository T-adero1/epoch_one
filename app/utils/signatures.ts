import { getBaseUrl } from './url';

export const generateSigningLink = (contractId: string): string => {
  return `${getBaseUrl()}/sign/${contractId}`;
};

// Function to check if a user can sign a contract
export const canUserSignContract = (signerEmail: string, contractSigners: string[]): boolean => {
  if (!signerEmail || !contractSigners || contractSigners.length === 0) return false;
  return contractSigners.some(signer => 
    signer.toLowerCase() === signerEmail.toLowerCase()
  );
};

// Function to check if all signatures are collected
export const areAllSignaturesDone = (signers: string[], signatures: any[]): boolean => {
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
  contract: any
): 'SIGNED' | 'PENDING' | 'NOT_REQUIRED' => {
  const signers = contract.metadata?.signers || [];
  if (!signers.some(s => s.toLowerCase() === userEmail.toLowerCase())) {
    return 'NOT_REQUIRED';
  }
  
  const signature = contract.signatures?.find(
    (sig: any) => sig.user.email.toLowerCase() === userEmail.toLowerCase()
  );
  
  return signature?.status === 'SIGNED' ? 'SIGNED' : 'PENDING';
}; 