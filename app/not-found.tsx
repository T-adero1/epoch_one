'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function NotFound() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the home page (login) after a short delay
    const redirectTimer = setTimeout(() => {
      router.replace('/');
    }, 2000);

    return () => clearTimeout(redirectTimer);
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <div className="text-center max-w-md p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Page Not Found</h2>
        <p className="text-gray-600 mb-6">The page you requested could not be found.</p>
        <div className="bg-blue-50 text-blue-700 p-4 rounded-lg">
          <p className="text-sm">Redirecting you to the login page...</p>
        </div>
      </div>
    </div>
  );
} 