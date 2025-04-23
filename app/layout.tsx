<<<<<<< HEAD:app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ZkLoginProvider } from "@/app/contexts/ZkLoginContext";
import { AppStateProvider } from "@/app/contexts/AppStateContext";
=======
'use client';
>>>>>>> master:src/app/layout.tsx

import './globals.css';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { ZkLoginProvider } from '@/contexts/ZkLoginContext';
import { PasswordProvider, usePassword } from '@/contexts/PasswordContext';
import { AppStateProvider, useAppState } from '@/contexts/AppStateContext';
import SessionTimeoutModal from '@/components/SessionTimeoutModal';
import { ToastContainer } from '@/components/ToastContainer';
import PasswordEntry from './password-entry';
import { useEffect } from 'react';
import { initializeSessionSystem, setupActivityTracking } from '@/utils/sessionManager';
import { checkForPendingRedirect } from '@/utils/sessionTimeoutManager';
import { Provider } from '@/components/ui/provider';

// These routes don't require password verification
const PUBLIC_ROUTES = [
  '/auth/callback',
  '/login',
  '/api/',  // API routes
  '/_next/', // Next.js internal routes
  '/favicon.ico'
];

<<<<<<< HEAD:app/layout.tsx
export const metadata: Metadata = {
  title: "EpochOne - Web3 Document Management",
  description: "Secure your business documents with Web3 cryptography and digital verification",
};
=======
// Initialize session management on the client side
function SessionInitializer() {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log('🔒 App: Initializing session management system');
      
      // Most important: Check for pending redirects first (after page refresh)
      // This must happen before any session initialization
      checkForPendingRedirect();
      
      // Only proceed with normal initialization if we didn't redirect
      if (!localStorage.getItem('redirectAfterRefresh')) {
        initializeSessionSystem();
        const cleanupActivityTracking = setupActivityTracking();
        
        return () => {
          cleanupActivityTracking();
        };
      }
    }
  }, []);
  
  return null;
}
>>>>>>> master:src/app/layout.tsx

// Session timeout warning handler
function SessionTimeoutHandler() {
  const { 
    state, 
    extendUserSession, 
    hideSessionWarning, 
    logout 
  } = useAppState();
  
  const { showWarning, warningTime } = state.ui.sessionTimeout;
  
  if (!state.session.isAuthenticated) {
    return null;
  }
  
  return (
<<<<<<< HEAD:app/layout.tsx
    <html lang="en" className="scroll-smooth">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AppStateProvider>
          <ZkLoginProvider>
            {children}
          </ZkLoginProvider>
=======
    <SessionTimeoutModal
      isOpen={showWarning}
      remainingTime={warningTime}
      onStayLoggedIn={() => {
        extendUserSession();
        hideSessionWarning();
      }}
      onLogout={logout}
    />
  );
}

// This component handles showing content only when password is verified
function ProtectedContent({ children }: { children: ReactNode }) {
  const { isPasswordVerified } = usePassword();
  const pathname = usePathname();
  
  // Skip password protection for public routes
  const isPublicRoute = PUBLIC_ROUTES.some(route => 
    pathname?.startsWith(route)
  );
  
  useEffect(() => {
    console.log('🔒 ProtectedContent: Path check', { 
      pathname, 
      isPublicRoute,
      isPasswordVerified 
    });
  }, [pathname, isPublicRoute, isPasswordVerified]);
  
  if (!isPasswordVerified && !isPublicRoute) {
    return <PasswordEntry />;
  }
  
  return (
    <>
      {!isPublicRoute && <Navbar />}
      {children}
    </>
  );
}

// App wrapper component that has access to the app state
function AppWrapper({ children }: { children: ReactNode }) {
  return (
    <>
      <SessionTimeoutHandler />
      <ToastContainer />
      <PasswordProvider>
        <ZkLoginProvider>
          <ProtectedContent>
            {children}
          </ProtectedContent>
        </ZkLoginProvider>
      </PasswordProvider>
    </>
  );
}

// The metadata has to be moved to a separate file in Next.js 13+ when using 'use client'
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <title>EpochOne | Blockchain-Secured Document Signing</title>
        <meta name="description" content="Sign and secure your important documents with military-grade cryptography and blockchain verification." />
      </head>
      <body className="antialiased min-h-screen bg-white" suppressHydrationWarning>
        {/* The order matters - AppState must be outside PasswordProvider */}
        <AppStateProvider>
          <SessionInitializer />
          <Provider>
            <AppWrapper>
              {children}
            </AppWrapper>
          </Provider>
>>>>>>> master:src/app/layout.tsx
        </AppStateProvider>
      </body>
    </html>
  );
}
