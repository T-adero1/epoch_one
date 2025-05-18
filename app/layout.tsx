'use client';

import './globals.css';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/toaster';
import Providers from './providers';
import { PasswordProtection } from '@/components/PasswordProtection';

const inter = Inter({ subsets: ['latin'] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <PasswordProtection>
            {children}
            <Toaster />
          </PasswordProtection>
        </Providers>
      </body>
    </html>
  );
}
