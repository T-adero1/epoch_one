'use client';

import React, { useState, useEffect } from 'react';
import { usePassword } from '@/contexts/PasswordContext';
import { HiLockClosed, HiOutlineSparkles } from 'react-icons/hi';
import { usePathname } from 'next/navigation';

export default function PasswordEntry() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { verifyPassword } = usePassword();
  const pathname = usePathname();

  useEffect(() => {
    console.log('⚡ Password Entry: Page shown', { currentPath: pathname });
    
    // Check if password is stored in URL hash (for development only)
    if (typeof window !== 'undefined' && 
        process.env.NODE_ENV === 'development' && 
        window.location.hash.startsWith('#pw=')) {
      const hashPassword = window.location.hash.substring(4);
      if (hashPassword) {
        console.log('⚡ Password Entry: Found password in URL hash (development mode only)');
        setPassword(hashPassword);
        // Auto-submit after a brief delay
        setTimeout(() => {
          verifyPassword(hashPassword);
        }, 100);
      }
    }
  }, [pathname, verifyPassword]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    
    console.log('⚡ Password Entry: Attempting verification');
    
    // Simulate a short delay for authentication
    setTimeout(() => {
      const isCorrect = verifyPassword(password);
      
      if (!isCorrect) {
        console.log('⚡ Password Entry: Verification failed');
        setError('Incorrect password. Please try again.');
        setIsSubmitting(false);
      } else {
        console.log('⚡ Password Entry: Verification successful');
      }
    }, 800);
  };

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="h-16 w-16 bg-blue-600 rounded-xl flex items-center justify-center">
            <HiOutlineSparkles className="h-8 w-8 text-white" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Password Protected
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          This site is protected. Please enter the password to continue.
        </p>
        {process.env.NODE_ENV === 'development' && (
          <p className="mt-1 text-center text-xs text-gray-500">
            Path: {pathname}
          </p>
        )}
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <HiLockClosed className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`block w-full pl-10 sm:text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 ${
                    error ? 'border-red-500' : ''
                  }`}
                  placeholder="Enter site password"
                />
              </div>
              {error && (
                <p className="mt-2 text-sm text-red-600">{error}</p>
              )}
            </div>

            <div>
              <button
                type="submit"
                disabled={isSubmitting || !password.trim()}
                className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Verifying...
                  </>
                ) : (
                  'Access Site'
                )}
              </button>
            </div>
          </form>
        </div>
        
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            Contact your administrator if you need access to this site.
          </p>
          {process.env.NODE_ENV === 'development' && (
            <p className="text-xs text-gray-400 mt-1">
              Default password: EpochOne2023
            </p>
          )}
        </div>
      </div>
    </div>
  );
} 