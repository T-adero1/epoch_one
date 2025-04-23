'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from './ui/spinner';
import useWalrus from '@/utils/dynamicWalrusLoader';
import { useZkLogin } from '@/hooks/useZkLogin';

export default function EpochLoader({ 
  children 
}: { 
  children: React.ReactNode 
}) {
  const router = useRouter();
  const { walrus, loadingState: walrusLoading } = useWalrus();
  const { state: zkLoginState } = useZkLogin();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkEpochData = async () => {
      if (walrusLoading !== 'loaded' || !walrus) {
        return;
      }

      try {
        // Mock implementation - simulate checking epoch data
        console.log('Mock EpochLoader: Checking epoch data');
        
        // Simulate successful data load after a short delay
        setTimeout(() => {
          setLoading(false);
        }, 800);
        
        // If we want to simulate an error condition:
        // setError('Mock error: Could not load epoch data');
        // setLoading(false);
      } catch (err) {
        console.error('Error loading epoch data:', err);
        setError('Failed to load epoch data. Please try again.');
        setLoading(false);
      }
    };

    checkEpochData();
  }, [walrus, walrusLoading, zkLoginState, router]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-zinc-900 to-black">
        <Spinner size="lg" />
        <p className="mt-4 text-zinc-400">Loading Epoch Data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-zinc-900 to-black">
        <div className="p-4 mb-4 text-sm text-red-400 bg-red-900/20 rounded-lg max-w-md">
          <p>{error}</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 text-sm font-medium text-white bg-zinc-800 rounded-md hover:bg-zinc-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return <>{children}</>;
} 