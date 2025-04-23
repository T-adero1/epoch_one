import { NextRequest, NextResponse } from 'next/server';
import { listBlobs, fetchJSON } from '@/utils/walrusClient';
import { createLogger } from '@/utils/logger';

export async function GET(
  request: NextRequest,
  context: { params: { id: string } }
) {
  const logger = createLogger('InviteAPI');
  
  try {
    logger.info('Processing GET request for invite...');
    logger.info('Environment check: NODE_ENV =', process.env.NODE_ENV);
    
    // Log the presence of environment variables (without exposing values)
    logger.info('Environment variables check:');
    logger.info('- WALRUS_CAPACITY_ID present:', !!process.env.WALRUS_CAPACITY_ID);
    logger.info('- NEXT_PUBLIC_APP_URL present:', !!process.env.NEXT_PUBLIC_APP_URL);
    
    // Verify WALRUS_CAPACITY_ID is set
    if (!process.env.WALRUS_CAPACITY_ID) {
      logger.error('CRITICAL ERROR: WALRUS_CAPACITY_ID is not set in environment variables');
      return NextResponse.json(
        { 
          error: 'Blob storage configuration error',
          details: 'Missing WALRUS_CAPACITY_ID environment variable',
          environment: process.env.NODE_ENV
        },
        { status: 500 }
      );
    }
    
    // Correctly access the id from context.params
    const id = context.params.id;

    if (!id) {
      logger.warn('Missing invite ID in request');
      return NextResponse.json(
        { error: 'Invite ID is required' },
        { status: 400 }
      );
    }

    logger.info(`Fetching invite with ID: ${id}`);
    
    try {
      // Get the list of blobs with the given prefix
      const path = `invites/${id}.json`;
      logger.info(`Fetching blobs with path: ${path}`);
      
      const blobs = await listBlobs(path);
      
      if (!blobs || blobs.length === 0) {
        logger.info(`Invite not found with ID: ${id}`);
        return NextResponse.json(
          { error: 'Invite not found' },
          { status: 404 }
        );
      }

      // Get the first blob that matches the path
      const blob = blobs[0];
      logger.info(`Found blob for invite ${id}, ID: ${blob.id}`);
      
      // Fetch the JSON data directly using the Walrus client
      try {
        logger.info(`Fetching invite data with ID: ${blob.id}`);
        const invite = await fetchJSON(blob.id);
        logger.info(`Retrieved invite: ${id}, status: ${invite.status}`);

        // Check if the invite has expired
        const expiresAt = new Date(invite.expiresAt);
        const now = new Date();
        logger.info(`Invite expires at: ${expiresAt.toISOString()}, current time: ${now.toISOString()}`);

        if (now > expiresAt && invite.status !== 'signed') {
          logger.info(`Invite ${id} has expired`);
          // Update the invite status to 'expired'
          invite.status = 'expired';
          // Note: We're not updating the stored blob here, just returning the updated status
        }

        return NextResponse.json({ invite });
      } catch (fetchError) {
        logger.error(`Error fetching or parsing invite data:`, fetchError);
        throw fetchError;
      }
    } catch (error) {
      logger.error(`Error fetching blob for invite ${id}:`, error);
      throw error;
    }
  } catch (error: any) {
    const errorLogger = createLogger('InviteAPI:Error');
    errorLogger.error('Error fetching invite:', error);
    
    // Provide more specific error messages for common issues
    let errorMessage = 'Failed to fetch invite';
    let errorDetails = '';
    
    if (error instanceof Error) {
      errorLogger.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack || 'No stack trace available'
      });
      
      errorDetails = error.message;
      
      if (error.message.includes('authentication')) {
        errorMessage = 'Blob storage authentication failed';
      } else if (error.message.includes('network')) {
        errorMessage = 'Network error while accessing blob storage';
      } else if (error.message.includes('ENOTFOUND')) {
        errorMessage = 'DNS resolution failed';
      } else if (error.message.includes('ECONNREFUSED')) {
        errorMessage = 'Connection refused';
      } else if (error.message.includes('timeout')) {
        errorMessage = 'Connection timeout';
      }
    }
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: errorDetails,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV
      },
      { status: 500 }
    );
  }
} 