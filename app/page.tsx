'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useZkLogin } from '@/app/contexts/ZkLoginContext';
import { FaGoogle, FaShieldAlt, FaClock, FaExclamationTriangle } from 'react-icons/fa';
import { HiOutlineSparkles } from 'react-icons/hi';
import Link from 'next/link';
import { extractJwtFromUrl } from '@/utils/zkLogin';

// Create a client component that uses useSearchParams
function HomePageContent() {
  const { isAuthenticated, startLogin, completeLogin, isLoading, error } = useZkLogin();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loginAnimation, setLoginAnimation] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'timeout' | 'expired' | 'error' | 'none';
    message: string;
  }>({ type: 'none', message: '' });

  // Check for URL parameters indicating why the user is at the login page
  useEffect(() => {
    const timeout = searchParams?.get('timeout');
    const expired = searchParams?.get('expired');
    const errorParam = searchParams?.get('error');

    if (timeout === '1') {
      setStatusMessage({
        type: 'timeout',
        message: 'Your session has timed out due to inactivity'
      });
    } else if (expired === '1') {
      setStatusMessage({
        type: 'expired',
        message: 'Your session has expired. Please sign in again.'
      });
    } else if (errorParam) {
      setStatusMessage({
        type: 'error',
        message: decodeURIComponent(errorParam)
      });
    }
  }, [searchParams]);

  

  // Check for JWT token in URL (from OAuth callback)
  useEffect(() => {
    const checkForJwt = async () => {
      const jwt = extractJwtFromUrl();
      if (jwt) {
        console.log('⚡ Home Page: JWT token found in URL');
        try {
          setLoginAnimation(true);
          await completeLogin(jwt);
        } catch (error) {
          console.error('⚡ Home Page: Error completing login', error);
          setStatusMessage({
            type: 'error',
            message: 'Failed to complete authentication. Please try again.'
          });
        } finally {
          setLoginAnimation(false);
        }
      }
    };
    
    checkForJwt();
  }, [completeLogin]);

  // If already authenticated, redirect to dashboard
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      console.log('⚡ Home Page: User authenticated, checking for existing redirects');
      
      // Check for the explicit redirect flag
      const redirectInProgress = localStorage.getItem('zklogin_redirect_in_progress');
      
      if (redirectInProgress === 'true') {
        console.log('⚡ Home Page: Redirect in progress from context, skipping dashboard redirect');
        return; // Skip our redirect
      }
      
      // Also check for a stored redirect path as a backup
      const storedRedirectPath = localStorage.getItem('zkLoginRedirectPath');
      
      if (storedRedirectPath) {
        console.log('⚡ Home Page: Found existing redirect path, skipping dashboard redirect:', storedRedirectPath);
        return; // Skip our redirect
      }
      
      // No redirect in progress, proceed with dashboard redirect
      console.log('⚡ Home Page: No existing redirect, redirecting to dashboard');
      router.push('/dashboard');
      console.log('⚡ Home Page: Successfully initiated dashboard redirect');
    }
  }, [isAuthenticated, isLoading, router]);

  // Handle Google login click
  const handleGoogleLoginClick = async () => {
    console.log('[OAUTH][START] Initiating Google login flow');
    setLoginAnimation(true);
    
    try {
      // Get the nonce from Sui zkLogin
      const nonce = await startLogin();
      console.log('[OAUTH][NONCE] Generated nonce:', nonce);
      
      // Google OAuth parameters
      const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;
      const redirectUri = `${window.location.origin}`;
      // Update scope to include email and profile
      const scope = 'openid email profile';
      const responseType = 'id_token';
      
      // Log OAuth configuration
      console.log('[OAUTH][CONFIG] Preparing OAuth request:', {
        clientId: googleClientId?.substring(0, 8) + '...',
        redirectUri,
        scope,
        responseType,
        hasNonce: Boolean(nonce)
      });
      
      // Construct Google OAuth URL with nonce
      const googleOAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      googleOAuthUrl.searchParams.append('client_id', googleClientId);
      googleOAuthUrl.searchParams.append('redirect_uri', redirectUri);
      googleOAuthUrl.searchParams.append('scope', scope);
      googleOAuthUrl.searchParams.append('response_type', responseType);
      googleOAuthUrl.searchParams.append('nonce', nonce);
      
      // Log the final URL (with sensitive data masked)
      console.log('[OAUTH][URL] Generated OAuth URL:', {
        baseUrl: googleOAuthUrl.origin + googleOAuthUrl.pathname,
        params: {
          client_id: '***',
          redirect_uri: redirectUri,
          scope,
          response_type: responseType,
          nonce: '***'
        }
      });
      
      // Redirect to Google OAuth login
      console.log('[OAUTH][REDIRECT] Redirecting to Google OAuth...');
      window.location.href = googleOAuthUrl.toString();
    } catch (error) {
      console.error('[OAUTH][ERROR] Login process failed:', error);
      setStatusMessage({
        type: 'error',
        message: 'Failed to start authentication. Please try again.'
      });
      setLoginAnimation(false);
    }
  };

  // Display error if any
  useEffect(() => {
    if (error) {
      setStatusMessage({
        type: 'error',
        message: error
      });
      setLoginAnimation(false);
    }
  }, [error]);

  // Log page state
  console.log('⚡ Home Page: Rendering login screen', { isAuthenticated, isLoading });
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="w-full max-w-md px-6">
        {statusMessage.type !== 'none' && (
          <div className={`mb-4 rounded-lg p-4 flex items-start ${
            statusMessage.type === 'timeout' || statusMessage.type === 'expired' 
              ? 'bg-yellow-50 text-yellow-800 border border-yellow-200' 
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            <div className="flex-shrink-0 mr-3 mt-0.5">
              {statusMessage.type === 'timeout' || statusMessage.type === 'expired' ? (
                <FaClock className="h-5 w-5" />
              ) : (
                <FaExclamationTriangle className="h-5 w-5" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium">{statusMessage.message}</p>
              <p className="text-xs mt-1">Please sign in to continue your session.</p>
            </div>
          </div>
        )}
        
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100">
          <div className="p-8">
            <div className="text-center mb-8">
              <HiOutlineSparkles className="h-10 w-10 text-blue-600 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Welcome to EpochOne
              </h2>
              <p className="text-gray-600">
                Sign in to access your dashboard
              </p>
            </div>
            
            <button
              onClick={handleGoogleLoginClick}
              disabled={isLoading || loginAnimation}
              className={`
                w-full flex items-center justify-center py-3.5 px-4
                text-sm font-medium rounded-lg
                transition-all duration-300 ease-in-out
                ${loginAnimation ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'} 
                text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
                disabled:opacity-50 disabled:cursor-not-allowed
                relative overflow-hidden shadow-md
              `}
            >
              <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${loginAnimation ? 'opacity-100' : 'opacity-0'}`}>
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
              
              <div className={`flex items-center transition-opacity duration-200 ${loginAnimation ? 'opacity-0' : 'opacity-100'}`}>
                <FaGoogle className="h-4 w-4 mr-2" />
                <span>{isLoading ? 'Connecting...' : 'Continue with Google'}</span>
              </div>
            </button>
            
            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">Secure authentication</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="bg-gray-50 px-8 py-6 border-t border-gray-100">
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 bg-blue-100 p-2 rounded-md">
                <FaShieldAlt className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-900">
                  Enhanced Privacy & Security
                </h3>
                <div className="mt-1 text-xs text-gray-600">
                  <p>
                    Our zero-knowledge login system verifies your identity without revealing 
                    your credentials to the blockchain, ensuring your privacy remains protected.
                  </p>
                </div>
                <div className="mt-3">
                  <span className="inline-block px-3 py-0.5 text-xs text-blue-800 bg-blue-100 rounded-full">
                    Powered by zkLogin technology
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-6 text-center text-xs text-gray-500">
          <p>
            By signing in, you agree to our <Link href="/terms" className="text-blue-600 hover:underline">Terms of Service</Link> and 
            <Link href="/privacy" className="text-blue-600 hover:underline"> Privacy Policy</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

// Loading fallback for Suspense
function HomePageLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="w-full max-w-md px-6 text-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          <HiOutlineSparkles className="h-10 w-10 text-blue-400 mx-auto mb-4 animate-pulse" />
          <h2 className="text-2xl font-bold text-gray-700 mb-3">Loading...</h2>
          <div className="flex justify-center">
            <svg className="animate-spin h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

// Main component with Suspense boundary
export default function HomePage() {
  return (
    <Suspense fallback={<HomePageLoading />}>
      <HomePageContent />
    </Suspense>
  );
} 