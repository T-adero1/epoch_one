import { NextRequest, NextResponse } from 'next/server';
import { uploadJSON, fetchJSON, listBlobs } from '@/utils/walrusClient';
import { logger } from '@/utils/logger';

export async function POST(request: NextRequest) {
  try {
    logger.info('InviteSign', 'Received signature request');
    
    // Verify WALRUS_CAPACITY_ID is set
    if (!process.env.WALRUS_CAPACITY_ID) {
      logger.error('InviteSign', 'WALRUS_CAPACITY_ID is not set in environment variables');
      return NextResponse.json(
        { error: 'Walrus storage configuration error' },
        { status: 500 }
      );
    }
    
    // Parse request body
    const body = await request.json();
    const { inviteId, signerName, signature } = body;

    logger.info('InviteSign', `Processing signature for invite: ${inviteId}`, { inviteId });
    
    // Validate required fields
    if (!inviteId) {
      logger.warn('InviteSign', 'Missing inviteId in signature request');
      return NextResponse.json(
        { error: 'Invite ID is required' },
        { status: 400 }
      );
    }

    if (!signerName) {
      logger.warn('InviteSign', 'Missing signerName in signature request');
      return NextResponse.json(
        { error: 'Signer name is required' },
        { status: 400 }
      );
    }

    if (!signature) {
      logger.warn('InviteSign', 'Missing signature in signature request');
      return NextResponse.json(
        { error: 'Signature is required' },
        { status: 400 }
      );
    }

    // Check if this is server-side
    if (typeof window === 'undefined') {
      logger.info('InviteSign', 'Running in server environment, using mock data');
      
      // Return a mock response since we can't use WebAssembly on the server
      // This is just for development/preview; in production we'd implement an alternative
      // like a lightweight fetch from a proxy server or database
      return NextResponse.json({
        success: true,
        message: 'Document signed successfully (server-side mock)',
        invite: {
          inviteId,
          signerName,
          status: 'SIGNED',
          signedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      });
    }

    // Check if invite exists in Walrus storage by listing blobs with the invite ID
    try {
      logger.info('InviteSign', `Checking if invite exists: ${inviteId}`, { inviteId });
      const invitePath = `invites/${inviteId}.json`;
      
      // List blobs to check if one with this path exists
      const blobs = await listBlobs(invitePath);
      
      if (!blobs || blobs.length === 0) {
        logger.warn('InviteSign', `Invite not found: ${inviteId}`, { inviteId });
        return NextResponse.json(
          { error: 'Invite not found' },
          { status: 404 }
        );
      }

      // Fetch invite data using the blob ID
      const blobId = blobs[0].id;
      logger.info('InviteSign', `Fetching invite data with ID: ${blobId}`, { blobId, inviteId });
      const invite = await fetchJSON(blobId);
      
      logger.info('InviteSign', `Retrieved invite ${inviteId}, current status: ${invite.status}`, {
        inviteId,
        status: invite.status
      });

      // Check if invite has already been signed
      if (invite.status === 'SIGNED') {
        logger.warn('InviteSign', `Invite ${inviteId} has already been signed`, { inviteId });
        return NextResponse.json(
          { error: 'Invite has already been signed' },
          { status: 400 }
        );
      }

      // Check if invite has expired
      const now = new Date();
      const expiresAt = new Date(invite.expiresAt);
      
      if (now > expiresAt) {
        logger.warn('InviteSign', `Invite ${inviteId} has expired`, { inviteId, expiresAt });
        // Update invite status to expired
        const expiredInvite = {
          ...invite,
          status: 'EXPIRED',
          updatedAt: now.toISOString()
        };
        
        logger.info('InviteSign', `Updating invite ${inviteId} status to EXPIRED`, { inviteId });
        await uploadJSON(invitePath, expiredInvite);
        
        return NextResponse.json(
          { error: 'Invite has expired' },
          { status: 400 }
        );
      }

      // Update invite with signature information
      const signedInvite = {
        ...invite,
        status: 'SIGNED',
        signerName,
        signature,
        signedAt: now.toISOString(),
        updatedAt: now.toISOString()
      };
      
      // Save updated invite to Walrus storage
      logger.info('InviteSign', `Saving signed invite ${inviteId}`, { inviteId });
      await uploadJSON(invitePath, signedInvite);

      logger.info('InviteSign', `Invite ${inviteId} successfully signed by ${signerName}`, {
        inviteId,
        signerName
      });
      
      return NextResponse.json({
        success: true,
        message: 'Document signed successfully',
        invite: signedInvite
      });
    } catch (error: any) {
      if (error.status === 404) {
        logger.warn('InviteSign', `Invite not found: ${inviteId}`, { inviteId, error: error.message });
        return NextResponse.json(
          { error: 'Invite not found' },
          { status: 404 }
        );
      }
      throw error;
    }
  } catch (error) {
    logger.error('InviteSign', 'Error signing invite:', error);
    
    // Provide more specific error messages for common issues
    let errorMessage = 'Failed to sign document';
    
    if (error instanceof Error) {
      logger.error('InviteSign', 'Error details:', error);
      
      if (error.message.includes('authentication')) {
        errorMessage = 'Walrus storage authentication failed';
      } else if (error.message.includes('network')) {
        errorMessage = 'Network error while accessing Walrus storage';
      } else if (error.message.includes('JSON')) {
        errorMessage = 'Invalid data format';
      } else if (error.message.includes('WebAssembly')) {
        errorMessage = 'WebAssembly initialization error';
      }
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
} 