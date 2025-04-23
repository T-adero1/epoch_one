'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useZkLogin } from '@/app/contexts/ZkLoginContext';

interface AuthGuardProps {
  children: React.ReactNode;
}

const AuthGuard = ({ children }: AuthGuardProps) => {
  const { isAuthenticated, isLoading } = useZkLogin();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    console.log('AuthGuard: Checking auth state', {
      isAuthenticated,
      isLoading,
      pathname
    });

    if (!isLoading && !isAuthenticated && pathname !== '/') {
      console.log('AuthGuard: User not authenticated, redirecting to home');
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, router, pathname]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Authenticating</h2>
          <p className="text-gray-600">Please wait while we verify your session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will be redirected by the useEffect
  }

  return <>{children}</>;
};

export default AuthGuard; 