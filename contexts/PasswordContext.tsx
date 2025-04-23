'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { loadSession, saveSession } from '@/utils/sessionManager';

// Define the shape of our context
interface PasswordContextType {
  isPasswordVerified: boolean;
  verifyPassword: (password: string) => boolean;
  logout: () => void;
}

// Create the context with a default value
const PasswordContext = createContext<PasswordContextType>({
  isPasswordVerified: false,
  verifyPassword: () => false,
  logout: () => {},
});

// Custom hook to use the password context
export const usePassword = () => useContext(PasswordContext);

// Storage keys
const PASSWORD_VERIFIED_KEY = 'passwordVerified';

// The correct password for the site
const SITE_PASSWORD = process.env.NEXT_PUBLIC_SITE_PASSWORD ; // Fallback password if env var not set

export const PasswordProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isPasswordVerified, setIsPasswordVerified] = useState<boolean>(false);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  // Check for password verification on mount
  useEffect(() => {
    const checkPasswordVerification = () => {
      try {
        // First check the main session storage
        const session = loadSession();
        const hasPasswordKey = localStorage.getItem(PASSWORD_VERIFIED_KEY);
        
        // Use both sources to determine if password is verified
        const isVerified = 
          (hasPasswordKey === 'true') || 
          (session && session.isAuthenticated && !!session.userAddress);
          
        console.log('🔐 Password: Initial verification check:', { 
          isVerified, 
          hasLocalStorageKey: !!hasPasswordKey,
          hasSessionAuth: !!(session && session.isAuthenticated)
        });
        
        setIsPasswordVerified(isVerified);
        
        // If verified via session but not set in localStorage, update localStorage
        if (isVerified && hasPasswordKey !== 'true') {
          localStorage.setItem(PASSWORD_VERIFIED_KEY, 'true');
        }
      } catch (error) {
        console.error('🔐 Password: Error checking verification status', error);
        setIsPasswordVerified(false);
      }
      
      setIsInitialized(true);
    };
    
    checkPasswordVerification();
  }, []);

  // Verify password function
  const verifyPassword = (password: string): boolean => {
    const isCorrect = password === SITE_PASSWORD;
    
    if (isCorrect) {
      console.log('🔐 Password: Password verified successfully');
      localStorage.setItem(PASSWORD_VERIFIED_KEY, 'true');
      
      // Update session with password verification info
      try {
        const session = loadSession();
        saveSession({
          ...session,
          // Store verification as a custom field in lastActive field metadata for now
          lastActive: Date.now(),
          // We can't add arbitrary fields to SessionState, so include in existing field
          deviceId: `${session.deviceId || ''}_passwordVerified`
        });
      } catch (error) {
        console.error('🔐 Password: Error updating session with verification', error);
      }
      
      setIsPasswordVerified(true);
    } else {
      console.log('🔐 Password: Incorrect password entered');
    }
    
    return isCorrect;
  };

  // Logout function
  const logout = () => {
    console.log('🔐 Password: Removing password verification');
    localStorage.removeItem(PASSWORD_VERIFIED_KEY);
    setIsPasswordVerified(false);
  };

  // Don't render children until we've checked password verification
  if (!isInitialized) {
    return null;
  }

  return (
    <PasswordContext.Provider
      value={{
        isPasswordVerified,
        verifyPassword,
        logout,
      }}
    >
      {children}
    </PasswordContext.Provider>
  );
}; 