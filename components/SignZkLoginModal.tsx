'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useZkLogin } from '@/app/contexts/ZkLoginContext';
import { Loader2, AlertCircle } from 'lucide-react';

interface SignZkLoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requiredEmail?: string | null;
}

export function SignZkLoginModal({ open, onOpenChange, requiredEmail }: SignZkLoginModalProps) {
  const { isAuthenticated, isLoading, startLogin, user } = useZkLogin();
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const contractId = searchParams.get('contractId');

  // Add detailed logging on mount
  useEffect(() => {
    console.log('[SignZkLoginModal] Initialized with props:', {
      open,
      requiredEmail: requiredEmail || 'not specified',
      contractId: contractId || 'not available',
      authState: {
        isAuthenticated,
        isLoading,
        userEmail: user?.email || 'none'
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Check if user is using the right email if required
  useEffect(() => {
    console.log('[SignZkLoginModal] Auth state change detected:', {
      isAuthenticated,
      isLoading,
      userEmail: user?.email,
      requiredEmail
    });

    if (isAuthenticated && user?.email && requiredEmail && user.email.toLowerCase() !== requiredEmail.toLowerCase()) {
      const errorMsg = `This document must be signed with the authorized email address. Please sign out and sign in with the correct email.`;
      console.log('[SignZkLoginModal] Email mismatch:', {
        userEmail: user.email,
        requiredEmail,
        error: errorMsg
      });
      setError(errorMsg);
    } else if (isAuthenticated && user?.email) {
      console.log('[SignZkLoginModal] User authenticated successfully with correct email:', user.email);
      setError(null);
    }
  }, [isAuthenticated, user?.email, requiredEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track when modal opens/closes
  useEffect(() => {
    console.log('[SignZkLoginModal] Modal visibility changed:', { 
      open,
      authState: {
        isAuthenticated,
        isLoading
      }
    });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLoginClick = useCallback(async () => {
    try {
      console.log('[SignZkLoginModal] Login button clicked, starting auth process...');
      
      // Store contract ID in localStorage before initiating login
      if (contractId) {
        console.log('[SignZkLoginModal] Storing contractId in localStorage:', contractId);
        localStorage.setItem('pendingSignatureContractId', contractId);
      } else {
        console.log('[SignZkLoginModal] No contractId available to store');
      }

      // Store current location for redirect after login
      const currentPath = window.location.pathname;
      console.log('[SignZkLoginModal] Storing current path for post-login redirect:', currentPath);
      localStorage.setItem('zkLoginRedirectPath', currentPath);
      
      // Set the redirect in progress flag
      localStorage.setItem('zklogin_redirect_in_progress', 'true');

      // If there's a required email, store it too
      if (requiredEmail) {
        console.log('[SignZkLoginModal] Storing required email for verification:', requiredEmail);
        localStorage.setItem('zkLoginRequiredEmail', requiredEmail);
      }
      
      console.log('[SignZkLoginModal] Calling startLogin from context...');
      const nonce = await startLogin();
      console.log('[SignZkLoginModal] Got nonce from startLogin:', nonce);
      
      // Construct the OAuth URL
      const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;
      const redirectUri = `${window.location.origin}`;
      const scope = 'openid email profile';
      
      const oauthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      oauthUrl.searchParams.append('client_id', googleClientId);
      oauthUrl.searchParams.append('redirect_uri', redirectUri);
      oauthUrl.searchParams.append('response_type', 'id_token');
      oauthUrl.searchParams.append('scope', scope);
      oauthUrl.searchParams.append('nonce', nonce);
      oauthUrl.searchParams.append('prompt', 'select_account');
      
      console.log('[SignZkLoginModal] Constructed OAuth URL:', {
        url: oauthUrl.toString(),
        params: {
          client_id: googleClientId,
          redirect_uri: redirectUri,
          response_type: 'id_token',
          scope,
          nonce: nonce.substring(0, 10) + '...',
          prompt: 'select_account'
        }
      });
      
      // Redirect to Google OAuth
      console.log('[SignZkLoginModal] Redirecting to Google OAuth...');
      window.location.href = oauthUrl.toString();
    } catch (error) {
      console.error('[SignZkLoginModal] Login error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.log('[SignZkLoginModal] Setting error state:', errorMessage);
      setError('Failed to start authentication process. Please try again.');
    }
  }, [contractId, requiredEmail, startLogin]);

  // Prevent closing the modal until authenticated
  const handleOpenChange = useCallback((newOpen: boolean) => {
    console.log('[SignZkLoginModal] Modal open state change requested:', {
      currentOpen: open,
      newOpen,
      isAuthenticated,
      hasError: !!error
    });
    
    // Only allow closing if authenticated or there's an error with the required email
    if (isAuthenticated || error) {
      console.log('[SignZkLoginModal] Allowing modal close');
      onOpenChange(newOpen);
    } else {
      console.log('[SignZkLoginModal] Preventing modal close - user not authenticated');
    }
  }, [open, isAuthenticated, error, onOpenChange]);

  // Log render state
  console.log('[SignZkLoginModal] Rendering with state:', {
    open,
    isLoading,
    isAuthenticated,
    hasError: !!error,
    errorMessage: error
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" hideCloseButton={!isAuthenticated && !error}>
        <DialogHeader>
          <DialogTitle>Sign in to view and sign document</DialogTitle>
          <DialogDescription>
            {requiredEmail 
              ? `Please sign in with the authorized email address to access this document.`
              : 'Authentication is required to view and sign this document.'}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col space-y-4 py-4">
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-md flex items-start">
              <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {isAuthenticated ? (
            <div className="bg-green-50 text-green-700 p-3 rounded-md">
              <p className="text-sm">You are signed in as {user?.email}</p>
            </div>
          ) : (
            <Button 
              onClick={handleLoginClick} 
              disabled={isLoading} 
              className="flex items-center justify-center"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 
                  Signing in...
                </>
              ) : (
                'Sign in with Google'
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
} 