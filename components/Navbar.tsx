'use client';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useZkLogin } from '@/contexts/ZkLoginContext';
import { usePassword } from '@/contexts/PasswordContext';

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { isAuthenticated, userAddress, logout } = useZkLogin();

  // Format Sui address for display (truncate middle)
  const formatAddress = (address: string | null) => {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  // Handle clicks outside the dropdown to close it
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Close dropdown when route changes
  useEffect(() => {
    setIsDropdownOpen(false);
  }, [pathname]);

  return (
    <nav className="bg-white border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href={isAuthenticated ? "/dashboard" : "/"} className="flex items-center">
              <span className="text-blue-600 text-2xl font-bold">
                Epoch<span className="text-gray-900">One</span>
              </span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            <Link
              href="/security"
              className="text-gray-600 hover:text-gray-900 px-3 py-2 text-sm font-medium"
            >
              Security
            </Link>
            <Link
              href="/contact"
              className="text-gray-600 hover:text-gray-900 px-3 py-2 text-sm font-medium"
            >
              Contact
            </Link>
            
            {isAuthenticated ? (
              <>
                <Link
                  href="/dashboard"
                  className="text-gray-600 hover:text-gray-900 px-3 py-2 text-sm font-medium"
                >
                  Dashboard
                </Link>
                <Link
                  href="/documents"
                  className="text-gray-600 hover:text-gray-900 px-3 py-2 text-sm font-medium"
                >
                  Documents
                </Link>
                <div 
                  ref={dropdownRef}
                  className="relative group"
                >
                  <button 
                    className="flex items-center text-gray-600 hover:text-gray-900 px-3 py-2 text-sm font-medium"
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    onMouseEnter={() => setIsDropdownOpen(true)}
                  >
                    <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded-md">
                      {formatAddress(userAddress)}
                    </span>
                    <svg className="ml-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <div 
                    className={`absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg py-1 z-10 transition-opacity duration-150 ${isDropdownOpen ? 'opacity-100' : 'opacity-0 invisible'}`}
                    onMouseEnter={() => setIsDropdownOpen(true)}
                    onMouseLeave={() => setIsDropdownOpen(false)}
                  >
                    <Link href="/dashboard" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                      My Documents
                    </Link>
                    <Link href="/profile" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                      Profile
                    </Link>
                    <button
                      onClick={() => {
                        setIsDropdownOpen(false);
                        logout();
                      }}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition duration-150 ease-in-out"
                >
                  Sign In
                </Link>
                
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center md:hidden">
            <button
              type="button"
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              <span className="sr-only">Open main menu</span>
              {!isMenuOpen ? (
                <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              ) : (
                <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <div className={`${isMenuOpen ? 'block' : 'hidden'} md:hidden border-t border-gray-100`}>
        <div className="pt-2 pb-3 space-y-1">
          <Link
            href="/security"
            className="block pl-3 pr-4 py-2 text-base font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50"
          >
            Security
          </Link>
          <Link
            href="/contact"
            className="block pl-3 pr-4 py-2 text-base font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50"
          >
            Contact
          </Link>
          
          {isAuthenticated ? (
            <>
              <Link
                href="/dashboard"
                className="block pl-3 pr-4 py-2 text-base font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              >
                Dashboard
              </Link>
              <Link
                href="/documents"
                className="block pl-3 pr-4 py-2 text-base font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              >
                Documents
              </Link>
              <Link
                href="/profile"
                className="block pl-3 pr-4 py-2 text-base font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              >
                Profile
              </Link>
              <div className="block pl-3 pr-4 py-2 text-base font-medium text-gray-600">
                {formatAddress(userAddress)}
              </div>
              <button
                onClick={logout}
                className="block w-full text-left pl-3 pr-4 py-2 text-base font-medium text-red-600 hover:text-red-800 hover:bg-gray-50"
              >
                Sign Out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="block pl-3 pr-4 py-2 text-base font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              >
                Sign In
              </Link>
              <Link
                href="/login"
                className="block pl-3 pr-4 py-2 text-base font-medium bg-blue-50 text-blue-700"
              >
                Get Started
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
} 