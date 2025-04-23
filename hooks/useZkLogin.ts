'use client';

import { useState, useEffect } from 'react';

// Use a fixed address for demo purposes
const DEMO_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";

interface ZkLoginState {
  ephemeralPublicKey?: string;
  jwt?: string;
  userSalt?: string;
  userAddress?: string;
  email?: string;
  timestamp?: number;
}

export function useZkLogin() {
  const [state, setState] = useState<ZkLoginState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Try to load state from localStorage on component mount
    const loadState = () => {
      if (typeof window === 'undefined') return;
      
      try {
        const savedState = localStorage.getItem('zkLoginState');
        if (savedState) {
          setState(JSON.parse(savedState));
        }
      } catch (err) {
        console.error('Error loading ZK login state', err);
        setError('Failed to load login state');
      } finally {
        setIsLoading(false);
      }
    };

    loadState();
    
    // Mock some data if none exists
    setTimeout(() => {
      if (!state) {
        const mockState = {
          ephemeralPublicKey: 'mock-key',
          jwt: 'mock-jwt-token',
          userSalt: 'mock-salt',
          userAddress: DEMO_ADDRESS,
          email: 'user@example.com',
          timestamp: Date.now()
        };
        setState(mockState);
        
        // Save to localStorage
        try {
          localStorage.setItem('zkLoginState', JSON.stringify(mockState));
        } catch (e) {
          console.error('Error saving mock state', e);
        }
      }
      setIsLoading(false);
    }, 300);
  }, []);

  return {
    state,
    isLoading,
    error
  };
} 