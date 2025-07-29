import { hashGoogleId } from './privacy';
import { generatePredeterminedWalletForAllowlist } from './predeterminedWallet';

// Interface for contract data needed for authentication
export interface ContractAuthData {
  id: string;
  ownerGoogleIdHash: string;
  authorizedUsers?: string[]; // ✅ Updated to use authorizedUsers column directly
}

// Interface for authentication result
export interface AuthenticationResult {
  canSign: boolean;
  reason: 'authorized_wallet' | 'contract_owner' | 'not_authorized';
  userWalletAddress?: string;
  authorizedWallets?: string[];
}

/**
 * Generate predetermined wallet address for a user email and contract
 * This calls the server-side function directly (no API call needed)
 */
async function generatePredeterminedWalletAddress(
  userEmail: string,
  contractId: string
): Promise<string> {
  try {
    console.log('[SIGNING-AUTH] Generating predetermined wallet for email verification...');
    
    // Step 1: Hash the email using the same method as contract creation
    const hashedEmail = await hashGoogleId(`email_${userEmail.toLowerCase()}`);
    console.log('[SIGNING-AUTH] Hashed email for wallet generation:', hashedEmail.substring(0, 8) + '...');
    
    // ✅ Step 2: Call the function directly (no HTTP request)
    const result = await generatePredeterminedWalletForAllowlist(
      hashedEmail,
      contractId,
      'allowlist-creation'
    );
    
    console.log('[SIGNING-AUTH] Generated predetermined wallet:', result.predeterminedAddress.substring(0, 8) + '...');
    
    return result.predeterminedAddress;
    
  } catch (error) {
    console.error('[SIGNING-AUTH] Error generating predetermined wallet:', error);
    throw error;
  }
}

/**
 * Authenticates a user's ability to sign a contract using predetermined wallet verification
 * 
 * @param userEmail - The user's email address
 * @param userGoogleId - The user's Google ID 
 * @param contract - The contract data containing authorized wallets
 * @returns Promise<AuthenticationResult> - Authentication result with details
 */
export async function authenticateUserForContract(
  userEmail: string,
  userGoogleId: string, 
  contract: ContractAuthData
): Promise<AuthenticationResult> {
  try {
    console.log('[SIGNING-AUTH] Starting authentication for user:', {
      userEmail,
      contractId: contract.id,
      timestamp: new Date().toISOString()
    });
    
    // Step 1: Check if user is the contract owner first (fastest check)
    const hashedUserGoogleId = await hashGoogleId(userGoogleId);
    const isOwner = contract.ownerGoogleIdHash === hashedUserGoogleId;
    
    if (isOwner) {
      console.log('[SIGNING-AUTH] User is contract owner - access granted');
      return {
        canSign: true,
        reason: 'contract_owner',
        authorizedWallets: contract.authorizedUsers || [] // ✅ Updated to use authorizedUsers
      };
    }
    
    // Step 2: Generate predetermined wallet address using the same method as allowlist creation
    console.log('[SIGNING-AUTH] Generating predetermined wallet for email authentication...');
    
    const predeterminedWalletAddress = await generatePredeterminedWalletAddress(
      userEmail,
      contract.id
    );
    
    console.log('[SIGNING-AUTH] Generated predetermined wallet:', {
      walletPreview: predeterminedWalletAddress.substring(0, 8) + '...',
      contractId: contract.id,
      userEmail: userEmail
    });
    
    // Step 3: Check if this wallet address is in the authorized wallets list
    const authorizedWallets = contract.authorizedUsers || []; // ✅ Updated to use authorizedUsers
    
    if (authorizedWallets.length === 0) {
      console.log('[SIGNING-AUTH] No authorized wallets found in contract authorizedUsers');
      return {
        canSign: false,
        reason: 'not_authorized',
        userWalletAddress: predeterminedWalletAddress,
        authorizedWallets: []
      };
    }
    
    const isAuthorized = authorizedWallets.includes(predeterminedWalletAddress);
    
    console.log('[SIGNING-AUTH] Wallet authorization check:', {
      userWallet: predeterminedWalletAddress.substring(0, 8) + '...',
      authorizedWalletCount: authorizedWallets.length,
      authorizedWalletsPreview: authorizedWallets.map(w => w.substring(0, 8) + '...'),
      isAuthorized
    });
    
    return {
      canSign: isAuthorized,
      reason: isAuthorized ? 'authorized_wallet' : 'not_authorized',
      userWalletAddress: predeterminedWalletAddress,
      authorizedWallets
    };
    
  } catch (error) {
    console.error('[SIGNING-AUTH] Error during authentication:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      userEmail,
      contractId: contract.id
    });
    
    return {
      canSign: false,
      reason: 'not_authorized',
      authorizedWallets: contract.authorizedUsers || [] // ✅ Updated to use authorizedUsers
    };
  }
}

/**
 * Quick check if a contract has authorization data available
 * 
 * @param contract - The contract data
 * @returns boolean - Whether the contract has authorization data
 */
export function hasContractAuthData(contract: ContractAuthData): boolean {
  return !!(contract.authorizedUsers && contract.authorizedUsers.length > 0); // ✅ Updated to use authorizedUsers
}

/**
 * Get user-friendly explanation of authorization status
 * 
 * @param result - The authentication result
 * @param userEmail - The user's email for personalized messages
 * @returns string - User-friendly explanation
 */
export function getAuthorizationMessage(result: AuthenticationResult, userEmail: string): string {
  switch (result.reason) {
    case 'contract_owner':
      return `You are the owner of this contract and can sign it.`;
    
    case 'authorized_wallet':
      return `Your account (${userEmail}) is authorized to sign this contract.`;
    
    case 'not_authorized':
      if (result.authorizedWallets && result.authorizedWallets.length > 0) {
        return `Your account (${userEmail}) is not authorized to sign this contract. Only specific authorized signers can access this document.`;
      } else {
        return `This contract does not have any authorized signers configured.`;
      }
    
    default:
      return `Unable to determine authorization status for this contract.`;
  }
}

/**
 * Lightweight version for quick checks without wallet generation
 * Only checks if user is the contract owner
 * 
 * @param userGoogleId - The user's Google ID
 * @param contract - The contract data
 * @returns Promise<boolean> - Whether user is the owner
 */
export async function isContractOwner(
  userGoogleId: string,
  contract: ContractAuthData
): Promise<boolean> {
  try {
    const hashedUserGoogleId = await hashGoogleId(userGoogleId);
    return contract.ownerGoogleIdHash === hashedUserGoogleId;
  } catch (error) {
    console.error('[SIGNING-AUTH] Error checking contract ownership:', error);
    return false;
  }
}

/**
 * Check if contract requires authentication (has authorized wallets or is owner-only)
 * 
 * @param contract - The contract data
 * @returns boolean - Whether contract requires authentication
 */
export function contractRequiresAuth(contract: ContractAuthData): boolean {
  return hasContractAuthData(contract) || !!contract.ownerGoogleIdHash;
} 