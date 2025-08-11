'use client';

import React, { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useZkLogin } from '@/app/contexts/ZkLoginContext';

interface AuthGuardProps {
  children: React.ReactNode;
}

const AuthGuard = ({ children }: AuthGuardProps) => {
  const { isAuthenticated, isLoading, isAuthStateResolved } = useZkLogin();
  const router = useRouter();
  const pathname = usePathname();
  
  // Track previous auth state to detect changes
  const prevAuthState = useRef({ isAuthenticated, isLoading, isAuthStateResolved });
  const redirectAttempted = useRef(false);
  const mountTime = useRef(Date.now());
  // ✅ FIX: Change type to handle both browser and Node.js setTimeout return types
  const redirectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Log when auth state changes
  useEffect(() => {
    const prevState = prevAuthState.current;
    const timeSinceMount = Date.now() - mountTime.current;
    
    if (prevState.isAuthenticated !== isAuthenticated || 
        prevState.isLoading !== isLoading || 
        prevState.isAuthStateResolved !== isAuthStateResolved) {
      
      console.log(`AuthGuard: Auth state CHANGED after ${timeSinceMount}ms`, {
        previous: { ...prevState },
        current: { isAuthenticated, isLoading, isAuthStateResolved },
        pathname
      });
      
      // Clear any pending redirect on auth state change
      if (redirectTimeout.current) {
        console.log('AuthGuard: Cancelling pending redirect due to auth state change');
        clearTimeout(redirectTimeout.current);
        redirectTimeout.current = null;
      }
      
      // Update ref with current state
      prevAuthState.current = { isAuthenticated, isLoading, isAuthStateResolved };
    }
  }, [isAuthenticated, isLoading, isAuthStateResolved, pathname]);

  useEffect(() => {
    console.log('AuthGuard: Component mounted', {
      isAuthenticated,
      isLoading,
      isAuthStateResolved,
      pathname,
      timestamp: Date.now()
    });
    
    return () => {
      // Clear pending redirects on unmount
      if (redirectTimeout.current) {
        clearTimeout(redirectTimeout.current);
      }
      
      console.log('AuthGuard: Component unmounting', {
        isAuthenticated,
        isLoading,
        isAuthStateResolved,
        pathname,
        timestamp: Date.now()
      });
    };
  }, [isAuthenticated, isLoading, isAuthStateResolved, pathname]);

  useEffect(() => {
    console.log('AuthGuard: Checking auth state', {
      isAuthenticated,
      isLoading,
      isAuthStateResolved,
      pathname,
      redirectAttempted: redirectAttempted.current,
      timeSinceMount: Date.now() - mountTime.current
    });

    if (!isLoading && !isAuthenticated && isAuthStateResolved && pathname !== '/' && !redirectAttempted.current) {
      // Debounce redirect to ensure we have the final auth state
      console.log('AuthGuard: Auth state resolved as not authenticated, planning redirect after debounce');
      
      // Mark that we've attempted a redirect to prevent multiple redirects
      redirectAttempted.current = true;
      
      // Clear any existing timeout
      if (redirectTimeout.current) {
        clearTimeout(redirectTimeout.current);
      }
      
      // Set a short timeout to allow any pending auth operations to complete
      redirectTimeout.current = setTimeout(() => {
        console.log('AuthGuard: Executing redirect after debounce period', {
          timeSinceMount: Date.now() - mountTime.current,
          currentAuthState: { isAuthenticated, isLoading, isAuthStateResolved }
        });
        
        // Check auth state again just to be sure
        if (!isAuthenticated) {
          console.log('AuthGuard: User not authenticated, redirecting to home', {
            timeSinceMount: Date.now() - mountTime.current
          });
          
          // Log right before redirect
          console.log('AuthGuard: REDIRECT STARTING', {
            timestamp: Date.now(),
            timeSinceMount: Date.now() - mountTime.current
          });
          
          router.replace('/');
          
          // Log after redirect call
          console.log('AuthGuard: REDIRECT CALLED', {
            timestamp: Date.now(),
            timeSinceMount: Date.now() - mountTime.current
          });
        } else {
          console.log('AuthGuard: User became authenticated during debounce period, cancelling redirect');
          redirectAttempted.current = false;
        }
        
        redirectTimeout.current = null;
      }, 150); // 150ms debounce - longer than the observed 55ms race condition
    }
  }, [isAuthenticated, isLoading, isAuthStateResolved, router, pathname]);

  // MODIFIED: Always render children but with different states
  // This prevents unmounting/remounting which causes flickering
  console.log('AuthGuard: Rendering with state', {
    isLoading,
    isAuthStateResolved,
    isAuthenticated,
    timeSinceMount: Date.now() - mountTime.current
  });
  
  if (isLoading || !isAuthStateResolved) {
    console.log('AuthGuard: Rendering loading state', {
      isLoading,
      isAuthStateResolved,
      timeSinceMount: Date.now() - mountTime.current
    });
  } else if (!isAuthenticated) {
    console.log('AuthGuard: Not authenticated, showing loading UI', {
      timeSinceMount: Date.now() - mountTime.current
    });
  } else {
    console.log('AuthGuard: Authenticated, rendering children normally', {
      timeSinceMount: Date.now() - mountTime.current
    });
  }
  
  // Always render children to prevent unmounting/remounting
  return <>{children}</>;
};

export default AuthGuard; 