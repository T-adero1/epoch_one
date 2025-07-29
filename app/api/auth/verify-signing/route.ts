import { authenticateUserForContract, type ContractAuthData } from '@/app/utils/signingAuth';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { userEmail, userGoogleId, contractId } = await request.json();
    
    console.log('[VERIFY-SIGNING-API] Authentication request:', { 
      userEmail, 
      contractId,
      timestamp: new Date().toISOString()
    });
    
    // Validate inputs
    if (!userEmail || !userGoogleId || !contractId) {
      return Response.json({ 
        error: 'Missing required fields: userEmail, userGoogleId, contractId' 
      }, { status: 400 });
    }
    
    // Get contract data from database
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        ownerGoogleIdHash: true,
        authorizedUsers: true, // This contains the wallet addresses
        title: true,
        status: true
      }
    });
    
    if (!contract) {
      return Response.json({ 
        error: 'Contract not found' 
      }, { status: 404 });
    }
    
    console.log('[VERIFY-SIGNING-API] Contract found:', {
      id: contract.id,
      title: contract.title,
      status: contract.status,
      hasOwner: !!contract.ownerGoogleIdHash,
      authorizedUserCount: contract.authorizedUsers?.length || 0
    });
    
    // Format contract data for authentication
    const contractAuthData: ContractAuthData = {
      id: contract.id,
      ownerGoogleIdHash: contract.ownerGoogleIdHash,
      authorizedUsers: contract.authorizedUsers || []
    };
    
    // This runs server-side, so it has access to environment variables
    const result = await authenticateUserForContract(
      userEmail, 
      userGoogleId, 
      contractAuthData
    );
    
    console.log('[VERIFY-SIGNING-API] Authentication result:', {
      canSign: result.canSign,
      reason: result.reason,
      userWalletPreview: result.userWalletAddress?.substring(0, 8) + '...',
      authorizedWalletCount: result.authorizedWallets?.length || 0
    });
    
    return Response.json(result);
    
  } catch (error) {
    console.error('[VERIFY-SIGNING-API] Authentication error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    
    return Response.json({ 
      error: 'Authentication failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
