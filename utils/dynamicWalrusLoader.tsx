/**
 * Mock dynamicWalrusLoader.tsx
 * This file provides a mock implementation that doesn't use WebAssembly
 */

'use client';

import { useState, useEffect } from 'react';

// Define mock types
interface WalrusInstance {
  checkEpoch: () => Promise<boolean>;
  getCurrentEpoch: () => Promise<number>;
  isEpochValid: (epoch: number) => Promise<boolean>;
}

type LoadingState = 'not-loaded' | 'loading' | 'loaded' | 'error';

export default function useWalrus() {
  const [walrus, setWalrus] = useState<WalrusInstance | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>('not-loaded');
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Only run in the browser
    if (typeof window === 'undefined') {
      return;
    }

    const loadWalrus = async () => {
      try {
        setLoadingState('loading');
        
        // Simulate loading delay
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Create a mock Walrus instance
        const mockWalrus: WalrusInstance = {
          checkEpoch: async () => {
            console.log('Mock Walrus: Checking epoch');
            return true;
          },
          getCurrentEpoch: async () => {
            console.log('Mock Walrus: Getting current epoch');
            return Math.floor(Date.now() / (30 * 24 * 60 * 60 * 1000)); // Rough monthly epochs
          },
          isEpochValid: async (epoch: number) => {
            console.log('Mock Walrus: Checking if epoch is valid', epoch);
            return true;
          }
        };
        
        setWalrus(mockWalrus);
        setLoadingState('loaded');
        console.log('Mock Walrus loaded successfully');
      } catch (err) {
        console.error('Error loading mock Walrus:', err);
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoadingState('error');
      }
    };

    loadWalrus();
  }, []);

  return { walrus, loadingState, error };
} 