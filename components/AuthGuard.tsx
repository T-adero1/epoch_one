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
    // Return a minimal loading indicator or the children with reduced opacity
    return (
      <div className="min-h-screen">
        {children}
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will be redirected by the useEffect
  }

  return <>{children}</>;
};

export default AuthGuard; 