'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useZkLogin } from '@/contexts/ZkLoginContext';
import { useAppState } from '@/contexts/AppStateContext';
import { extractJwtFromUrl } from '@/utils/zkLogin';

export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { isAuthenticated, isLoading } = useZkLogin();
  const appState = useAppState();
  const [jwtFound, setJwtFound] = useState(false);
  const [checkCount, setCheckCount] = useState(0);
  const [processingComplete, setProcessingComplete] = useState(false);

  // First effect - Check if JWT exists in URL
  useEffect(() => {
    const jwt = extractJwtFromUrl();
    
    if (!jwt) {
      const errorMsg = 'Authentication failed. No token received.';
      console.log('⚡ Auth Callback: Error - No JWT found in URL');
      setError(errorMsg);
      return;
    }
    
    console.log('⚡ Auth Callback: JWT found in URL, waiting for processing');
    setJwtFound(true);
  }, []);

  // Monitor app state for authentication
  useEffect(() => {
    if (appState.state.session.isAuthenticated) {
      console.log('⚡ Auth Callback: Authenticated via AppState');
      setProcessingComplete(true);
      
      // Short delay before redirect to ensure everything is saved
      const redirectTimer = setTimeout(() => {
        router.push('/dashboard');
      }, 300);
      
      return () => clearTimeout(redirectTimer);
    }
  }, [appState.state.session.isAuthenticated, router]);

  // Second effect - Handle navigation after authentication state changes
  useEffect(() => {
    if (!jwtFound || processingComplete) return;
    
    // Add a small delay to give ZkLoginContext time to process
    const timer = setTimeout(() => {
      console.log(`⚡ Auth Callback: Check #${checkCount + 1} - Auth state:`, { 
        isAuthenticated, 
        isLoading,
        appStateAuth: appState.state.session.isAuthenticated
      });
      
      if (!isLoading) {
        if (isAuthenticated) {
          console.log('⚡ Auth Callback: Authentication successful via ZkLogin, navigating to profile');
          setProcessingComplete(true);
          router.push('/dashboard');
        } else if (checkCount >= 5) {
          // After several checks, if still not authenticated, show error
          const errorMsg = 'Authentication failed. Please try again.';
          console.log('⚡ Auth Callback: Max retries reached, authentication failed');
          setError(errorMsg);
          appState.setError('sessionError', errorMsg);
        } else {
          // Increment check count for next iteration
          setCheckCount(prevCount => prevCount + 1);
        }
      } else if (checkCount >= 10) {
        // Prevent infinite loading
        const errorMsg = 'Authentication is taking too long. Please try again.';
        console.log('⚡ Auth Callback: Loading timeout reached');
        setError(errorMsg);
        appState.setError('sessionError', errorMsg);
      } else {
        // Increment check count for next iteration
        setCheckCount(prevCount => prevCount + 1);
      }
    }, 300); // Short delay between checks
    
    return () => clearTimeout(timer);
  }, [isLoading, isAuthenticated, router, checkCount, jwtFound, processingComplete, appState]);

  // Check for errors in app state
  useEffect(() => {
    if (appState.state.ui.errors.sessionError) {
      setError(appState.state.ui.errors.sessionError);
    }
  }, [appState.state.ui.errors.sessionError]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
        {error ? (
          <div>
            <h2 className="text-xl font-semibold text-red-600 mb-4">Authentication Error</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={() => router.push('/login')}
              className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none"
            >
              Return to Login
            </button>
          </div>
        ) : (
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Processing Your Login</h2>
            <p className="text-gray-600">Please wait while we verify your credentials...</p>
          </div>
        )}
      </div>
    </div>
  );
} 