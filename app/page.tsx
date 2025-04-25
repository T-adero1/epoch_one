'use client';

import React, { useEffect, useState, Suspense, useRef, useLayoutEffect, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useZkLogin } from '@/app/contexts/ZkLoginContext';
import { FaGoogle, FaShieldAlt, FaClock, FaExclamationTriangle } from 'react-icons/fa';
import { HiOutlineSparkles } from 'react-icons/hi';
import Link from 'next/link';
import { extractJwtFromUrl } from '@/utils/zkLogin';

// Performance tracking helper
const perf = {
  start(operation: string) {
    const startTime = performance.now();
    console.log(`[PAGE:PERF] ⏱️ Starting: ${operation}`);
    return () => {
      const duration = Math.round(performance.now() - startTime);
      console.log(`[PAGE:PERF] ⏱️ Completed: ${operation} (took ${duration}ms)`);
      return duration;
    };
  },
  // Add a new method to track and log component render time
  trackRender(componentName: string, renderCount: number) {
    const renderStart = performance.now();
    console.log(`[PAGE:RENDER] ${componentName} render #${renderCount} started`);
    return () => {
      const duration = Math.round(performance.now() - renderStart);
      console.log(`[PAGE:RENDER] ${componentName} render #${renderCount} completed in ${duration}ms`);
      return duration;
    };
  }
};

// Create a client component that uses useSearchParams
function HomePageContent() {
  console.log('[PAGE:LIFECYCLE] HomePageContent - Component function execution started');
  const mountTimeRef = useRef(performance.now());
  const renderCountRef = useRef(0);
  const [renderPhase, setRenderPhase] = useState('mounting');
  
  // Track render count
  renderCountRef.current += 1;
  
  // Track individual render times
  const endRenderTracking = useRef<Function | null>(null);
  if (endRenderTracking.current) {
    endRenderTracking.current();
  }
  endRenderTracking.current = perf.trackRender('HomePageContent', renderCountRef.current);
  
  const { isAuthenticated, startLogin, completeLogin, isLoading, error } = useZkLogin();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loginAnimation, setLoginAnimation] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'timeout' | 'expired' | 'error' | 'none';
    message: string;
  }>({ type: 'none', message: '' });

  // Add React Strict Mode detection
  useEffect(() => {
    console.log('[PAGE:DEBUG] Checking for React Strict Mode double mounting');
    return () => {
      // This will be called on unmount
      console.log('[PAGE:DEBUG] HomePageContent unmounted - if remounted immediately, likely in Strict Mode');
    };
  }, []);

  // Log important state changes for debugging
  console.log(`[PAGE:STATE] Render #${renderCountRef.current}, Phase: ${renderPhase}`, { 
    isAuthenticated, 
    isLoading, 
    hasError: !!error,
    loginAnimation,
    // Add debug for what triggered this render
    renderTriggeredBy: getReRenderCause()
  });

  // Helper function to try to determine what caused a re-render
  function getReRenderCause() {
    // This is a best-effort attempt to identify what triggered a re-render
    if (renderCountRef.current <= 2) return "initial mount";
    if (renderPhase === 'mounting' && renderCountRef.current > 2) return "possible strict mode";
    
    // Check state changes that might have caused the re-render
    if (renderCountRef.current > 2) {
      return {
        possibleCauses: [
          "state change in parent",
          "context value update",
          "hook dependency changed"
        ]
      };
    }
    
    return "unknown";
  }

  // Component mount timing
  useLayoutEffect(() => {
    const mountDuration = performance.now() - mountTimeRef.current;
    console.log(`[PAGE:PERF] 🔄 HomePageContent mounted in ${Math.round(mountDuration)}ms`);
    
    return () => {
      console.log('[PAGE:LIFECYCLE] HomePageContent - Component unmounting');
    };
  }, []);

  // Mark when component is fully rendered
  useEffect(() => {
    if (renderPhase === 'mounting') {
      const completeRender = perf.start('initial_render_complete');
      // Use requestAnimationFrame to ensure we're after painting
      requestAnimationFrame(() => {
        setRenderPhase('mounted');
        completeRender();
      });
    }
  }, [renderPhase]);

  // Check for URL parameters indicating why the user is at the login page
  useEffect(() => {
    const endTimer = perf.start('check_url_params');
    const timeout = searchParams?.get('timeout');
    const expired = searchParams?.get('expired');
    const errorParam = searchParams?.get('error');

    if (timeout === '1') {
      console.log('[PAGE:PARAMS] Timeout parameter detected');
      setStatusMessage({
        type: 'timeout',
        message: 'Your session has timed out due to inactivity'
      });
    } else if (expired === '1') {
      console.log('[PAGE:PARAMS] Expired parameter detected');
      setStatusMessage({
        type: 'expired',
        message: 'Your session has expired. Please sign in again.'
      });
    } else if (errorParam) {
      console.log('[PAGE:PARAMS] Error parameter detected:', errorParam);
      setStatusMessage({
        type: 'error',
        message: decodeURIComponent(errorParam)
      });
    }
    endTimer();
  }, [searchParams]);

  // Check for JWT token in URL (from OAuth callback)
  useEffect(() => {
    const checkForJwt = async () => {
      const endTimer = perf.start('check_jwt_in_url');
      
      // Create a processing flag in sessionStorage to prevent duplicate processing
      const processingKey = 'processing_jwt_login';
      if (typeof sessionStorage !== 'undefined') {
        const isProcessing = sessionStorage.getItem(processingKey);
        if (isProcessing === 'true') {
          console.log('[PAGE:AUTH] Login already in progress, skipping duplicate processing');
          endTimer();
          return;
        }
      }
      
      const jwt = extractJwtFromUrl();
      if (jwt) {
        // Set processing flag
        sessionStorage.setItem(processingKey, 'true');
        
        // Clear hash from URL to prevent reprocessing on refresh
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
          console.log('[PAGE:AUTH] Cleared JWT token from URL hash to prevent resubmission');
        }
        
        console.log('[PAGE:AUTH] JWT token found in URL, length:', jwt.length);
        try {
          console.log('[PAGE:AUTH] Setting loginAnimation to true');
          setLoginAnimation(true);
          
          const completeLoginTimer = perf.start('complete_login');
          await completeLogin(jwt);
          completeLoginTimer();
        } catch (error) {
          console.error('[PAGE:AUTH] Error completing login:', error);
          setStatusMessage({
            type: 'error',
            message: 'Failed to complete authentication. Please try again.'
          });
        } finally {
          console.log('[PAGE:AUTH] Setting loginAnimation to false');
          setLoginAnimation(false);
          
          // Clear processing flag when done
          sessionStorage.removeItem(processingKey);
        }
      } else {
        console.log('[PAGE:AUTH] No JWT token found in URL');
      }
      endTimer();
    };
    
    checkForJwt();
  }, [completeLogin]);

  // If already authenticated, redirect to dashboard
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      const endTimer = perf.start('check_authentication_redirect');
      console.log('[PAGE:REDIRECT] User authenticated, checking for existing redirects');
      
      // Check for the explicit redirect flag
      const redirectInProgress = localStorage.getItem('zklogin_redirect_in_progress');
      
      if (redirectInProgress === 'true') {
        console.log('[PAGE:REDIRECT] Redirect in progress from context, skipping dashboard redirect');
        endTimer();
        return; // Skip our redirect
      }
      
      // Also check for a stored redirect path as a backup
      const storedRedirectPath = localStorage.getItem('zkLoginRedirectPath');
      
      if (storedRedirectPath) {
        console.log('[PAGE:REDIRECT] Found existing redirect path, skipping dashboard redirect:', storedRedirectPath);
        endTimer();
        return; // Skip our redirect
      }
      
      // No redirect in progress, proceed with dashboard redirect
      console.log('[PAGE:REDIRECT] No existing redirect, redirecting to dashboard');
      const pushTimer = perf.start('router_push_dashboard');
      router.push('/dashboard');
      pushTimer();
      console.log('[PAGE:REDIRECT] Successfully initiated dashboard redirect');
      endTimer();
    }
  }, [isAuthenticated, isLoading, router]);

  // Handle Google login click - memoize to prevent recreation on every render
  const handleGoogleLoginClick = useCallback(async () => {
    console.log('[PAGE:OAUTH] Initiating Google login flow');
    const endTimer = perf.start('google_login_click');
    setLoginAnimation(true);
    
    try {
      // Get the nonce from Sui zkLogin
      console.log('[PAGE:OAUTH] Calling startLogin to get nonce');
      const startLoginTimer = perf.start('start_login');
      const nonce = await startLogin();
      startLoginTimer();
      console.log('[PAGE:OAUTH] Generated nonce:', nonce);
      
      // Google OAuth parameters
      const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;
      const redirectUri = `${window.location.origin}`;
      // Update scope to include email and profile
      const scope = 'openid email profile';
      const responseType = 'id_token';
      
      // Log OAuth configuration
      console.log('[PAGE:OAUTH] Preparing OAuth request:', {
        clientId: googleClientId?.substring(0, 8) + '...',
        redirectUri,
        scope,
        responseType,
        hasNonce: Boolean(nonce)
      });
      
      // Construct Google OAuth URL with nonce
      console.log('[PAGE:OAUTH] Creating OAuth URL');
      const googleOAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      googleOAuthUrl.searchParams.append('client_id', googleClientId);
      googleOAuthUrl.searchParams.append('redirect_uri', redirectUri);
      googleOAuthUrl.searchParams.append('scope', scope);
      googleOAuthUrl.searchParams.append('response_type', responseType);
      googleOAuthUrl.searchParams.append('nonce', nonce);
      
      // Log the final URL (with sensitive data masked)
      console.log('[PAGE:OAUTH] Generated OAuth URL base:', googleOAuthUrl.origin + googleOAuthUrl.pathname);
      
      // Redirect to Google OAuth login
      console.log('[PAGE:OAUTH] Redirecting to Google OAuth...');
      endTimer();
      window.location.href = googleOAuthUrl.toString();
    } catch (error) {
      console.error('[PAGE:OAUTH] Login process failed:', error);
      setStatusMessage({
        type: 'error',
        message: 'Failed to start authentication. Please try again.'
      });
      setLoginAnimation(false);
      endTimer();
    }
  }, [setLoginAnimation, startLogin, setStatusMessage]); // dependencies

  // Display error if any
  useEffect(() => {
    if (error) {
      console.log('[PAGE:ERROR] Error from context:', error);
      setStatusMessage({
        type: 'error',
        message: error
      });
      setLoginAnimation(false);
    }
  }, [error]);

  // Monitor when button is ready to be displayed
  useEffect(() => {
    if (!loginAnimation && !isLoading && renderPhase === 'mounted') {
      const timeFromMount = Math.round(performance.now() - mountTimeRef.current);
      console.log(`[PAGE:READY] Login button ready to interact after ${timeFromMount}ms`);
    }
  }, [loginAnimation, isLoading, renderPhase]);

  // Memoize button text to prevent unnecessary re-renders
  const buttonText = useMemo(() => isLoading ? 'Connecting...' : 'Continue with Google', [isLoading]);
  
  // Memoize the Google login button to prevent re-renders
  const loginButton = useMemo(() => {
    console.log('[PAGE:BUTTON] Creating Google login button');
    const buttonCreationTime = performance.now() - mountTimeRef.current;
    
    const button = (
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
          <span>{buttonText}</span>
        </div>
      </button>
    );
    
    console.log(`[PAGE:BUTTON] Google login button created after ${Math.round(buttonCreationTime)}ms from mount`);
    return button;
  }, [isLoading, loginAnimation, buttonText, handleGoogleLoginClick]);

  // Only log this once when the component is done with everything
  useEffect(() => {
    if (!isLoading && !loginAnimation && renderPhase === 'mounted') {
      const timeFromMount = Math.round(performance.now() - mountTimeRef.current);
      console.log(`[PAGE:COMPLETE] Login page fully initialized in ${timeFromMount}ms`, {
        renderCount: renderCountRef.current
      });
    }
  }, [isLoading, loginAnimation, renderPhase]);
  
  // Add detailed logging for authentication state
  useEffect(() => {
    console.log('[PAGE:AUTH:STATE] Authentication state changed:', { 
      isAuthenticated, 
      isLoading,
      timestamp: Math.round(performance.now() - mountTimeRef.current) + 'ms from mount'
    });
  }, [isAuthenticated, isLoading]);

  // Add immediate effect to log when components are executing their render functions
  // At the end of the component but before the return statement
  useEffect(() => {
    if (endRenderTracking.current) {
      endRenderTracking.current();
      endRenderTracking.current = null;
    }

    // Log when a render cycle has completed and the DOM has been updated
    requestAnimationFrame(() => {
      console.log(`[PAGE:RENDER:COMPLETE] Render #${renderCountRef.current} committed to DOM after ${
        Math.round(performance.now() - mountTimeRef.current)
      }ms from mount`);
    });
  }, [renderCountRef.current]);

  // Add a timing mark for when Google button becomes visible
  // After the return statement in HomePageContent, add:
  useEffect(() => {
    // Use IntersectionObserver to detect when the button is visible
    if (typeof window !== 'undefined' && window.IntersectionObserver) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const timeFromMount = Math.round(performance.now() - mountTimeRef.current);
            console.log(`[PAGE:VISIBILITY] Google login button visible after ${timeFromMount}ms from mount`);
            observer.disconnect();
          }
        });
      });
      
      // Find the button after render
      setTimeout(() => {
        const buttonElement = document.querySelector('button');
        if (buttonElement) {
          observer.observe(buttonElement);
        }
      }, 0);
      
      return () => observer.disconnect();
    }
  }, []);
  
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
            
            {loginButton}
            
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
  console.log('[PAGE:LIFECYCLE] HomePageLoading - Component rendering');
  
  useEffect(() => {
    console.log('[PAGE:LIFECYCLE] HomePageLoading - Component mounted');
    return () => {
      console.log('[PAGE:LIFECYCLE] HomePageLoading - Component unmounting');
    };
  }, []);
  
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
  console.log('[PAGE:LIFECYCLE] HomePage - Root component rendering');
  
  useEffect(() => {
    console.log('[PAGE:LIFECYCLE] HomePage - Root component mounted');
    const domContentLoaded = performance.now();
    console.log(`[PAGE:PERF] DOMContentLoaded timing: ${Math.round(domContentLoaded)}ms`);
    
    return () => {
      console.log('[PAGE:LIFECYCLE] HomePage - Root component unmounting');
    };
  }, []);
  
  return (
    <Suspense fallback={<HomePageLoading />}>
      <HomePageContent />
    </Suspense>
  );
} 