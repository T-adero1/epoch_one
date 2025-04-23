'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useZkLogin } from '@/contexts/ZkLoginContext';
import Image from 'next/image';
import { FaUser, FaWallet, FaShieldAlt, FaSignOutAlt } from 'react-icons/fa';

const ProfilePage = () => {
  const { isAuthenticated, userAddress, logout, isLoading } = useZkLogin();
  const router = useRouter();

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, isLoading, router]);

  // Function to format address for display
  const formatAddress = (address: string | null) => {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg overflow-hidden">
          {/* Profile Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-8">
            <div className="flex flex-col md:flex-row items-center">
              <div className="mb-4 md:mb-0 md:mr-8">
                <div className="relative w-24 h-24 rounded-full bg-white p-1">
                  <div className="w-full h-full rounded-full bg-gray-200 flex items-center justify-center text-gray-500">
                    <FaUser size={40} />
                  </div>
                </div>
              </div>
              <div>
                <h1 className="text-3xl font-bold mb-2">User Profile</h1>
                <div className="flex items-center mb-2">
                  <FaWallet className="mr-2" />
                  <span className="font-mono">{userAddress ? formatAddress(userAddress) : 'No address'}</span>
                </div>
                <div className="mt-4">
                  <button 
                    onClick={() => {
                      logout();
                      router.push('/');
                    }}
                    className="bg-white text-indigo-600 px-4 py-2 rounded-full flex items-center font-medium hover:bg-gray-100 transition"
                  >
                    <FaSignOutAlt className="mr-2" />
                    Sign Out
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Profile Content */}
          <div className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-50 p-6 rounded-lg">
                <h2 className="text-xl font-semibold mb-4 flex items-center">
                  <FaShieldAlt className="mr-2 text-blue-500" />
                  ZK Login Information
                </h2>
                <div className="space-y-3">
                  <div className="flex justify-between border-b border-gray-200 pb-2">
                    <span className="text-gray-600">Authentication Type:</span>
                    <span className="font-medium">Google ZK Login</span>
                  </div>
                  
                  <div className="flex justify-between border-b border-gray-200 pb-2">
                    <span className="text-gray-600">Privacy Protection:</span>
                    <span className="font-medium text-green-600">Active</span>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 p-6 rounded-lg">
                <h2 className="text-xl font-semibold mb-4">Account Activity</h2>
                <div className="space-y-3">
                  <div className="flex justify-between border-b border-gray-200 pb-2">
                    <span className="text-gray-600">Last Login:</span>
                    <span className="font-medium">{new Date().toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-200 pb-2">
                    <span className="text-gray-600">Login Method:</span>
                    <span className="font-medium">Google</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-200 pb-2">
                    <span className="text-gray-600">Status:</span>
                    <span className="font-medium text-green-600">Active</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 bg-gray-50 p-6 rounded-lg">
              <h2 className="text-xl font-semibold mb-4">Copy Your Address</h2>
              <div className="flex">
                <input 
                  type="text" 
                  value={userAddress || ''} 
                  readOnly 
                  className="flex-1 p-3 border border-gray-300 rounded-l-lg font-mono text-sm"
                />
                <button 
                  onClick={() => {
                    if (userAddress) {
                      navigator.clipboard.writeText(userAddress);
                      alert('Address copied to clipboard!');
                    }
                  }}
                  className="bg-blue-600 text-white px-4 py-2 rounded-r-lg hover:bg-blue-700 transition"
                >
                  Copy
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage; 