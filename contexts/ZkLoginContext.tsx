'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Define context types that don't depend on WebAssembly
interface ZkLoginContextType {
  isAuthenticated: boolean;
  userAddress: string | null;
  isLoading: boolean;
  error: string | null;
  startLogin: () => void;
  logout: () => void;
  zkLoginState: any | null;
  generateProof: () => Promise<any>;
}

// Create context with default value
const ZkLoginContext = createContext<ZkLoginContextType>({
  isAuthenticated: false,
  userAddress: null,
  isLoading: false,
  error: null,
  startLogin: () => {},
  logout: () => {},
  zkLoginState: null,
  generateProof: async () => null,
});

export const useZkLogin = () => useContext(ZkLoginContext);

// Use a fixed address for demo purposes instead of generating a new one each time
const DEMO_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";

export const ZkLoginProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [zkLoginState, setZkLoginState] = useState<any | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Check for existing session on mount
  useEffect(() => {
    const loadExistingSession = async () => {
      console.log('Mock ZkLogin: Checking for existing session...');
      try {
        // Check localStorage for existing session
        if (typeof window !== 'undefined') {
          const saved = localStorage.getItem('zkLoginState');
          
          if (saved) {
            const savedState = JSON.parse(saved);
            setZkLoginState(savedState);
            
            // Always use the same demo address
            setUserAddress(DEMO_ADDRESS);
            setIsAuthenticated(true);
            console.log('Mock ZkLogin: User authenticated from saved session');
          }
        }
      } catch (err) {
        console.error('Error loading zkLogin session', err);
        setError('Failed to load existing session');
      } finally {
        setIsLoading(false);
      }
    };

    // Simulate a short delay for authentication check
    setTimeout(() => {
      loadExistingSession();
    }, 500);
  }, []);

  // Simplified login function
  const startLogin = () => {
    console.log('Mock ZkLogin: Starting login process...');
    
    setIsLoading(true);
    
    // Simulate login delay
    setTimeout(() => {
      try {
        // Mock a successful login
        const mockState = {
          ephemeralPublicKey: 'mock-key',
          jwt: 'mock-jwt-token',
          userSalt: 'mock-salt',
          userAddress: DEMO_ADDRESS,
          email: 'user@example.com',
          timestamp: Date.now()
        };
        
        setZkLoginState(mockState);
        setUserAddress(DEMO_ADDRESS);
        setIsAuthenticated(true);
        
        // Save the state to localStorage
        if (typeof window !== 'undefined') {
          localStorage.setItem('zkLoginState', JSON.stringify(mockState));
        }
        
        // Redirect to dashboard
        router.push('/dashboard');
      } catch (error) {
        console.error('Login error:', error);
        setError('Failed to log in');
      } finally {
        setIsLoading(false);
      }
    }, 1000);
  };

  // Mock proof generation
  const generateProof = async () => {
    console.log('Mock ZkLogin: Generating mock proof (no WebAssembly used)');
    return { proof: 'mock-proof-data' };
  };

  // Logout function
  const logout = () => {
    console.log('Mock ZkLogin: Logging out user');
    
    setZkLoginState(null);
    setIsAuthenticated(false);
    setUserAddress(null);
    
    // Clear localStorage state
    if (typeof window !== 'undefined') {
      localStorage.removeItem('zkLoginState');
    }
    
    // Redirect to home page
    router.push('/');
  };

  return (
    <ZkLoginContext.Provider value={{
      isAuthenticated,
      userAddress,
      isLoading,
      error,
      startLogin,
      logout,
      zkLoginState,
      generateProof
    }}>
      {children}
    </ZkLoginContext.Provider>
  );
};