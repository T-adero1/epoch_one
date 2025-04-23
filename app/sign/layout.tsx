import React from 'react';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign Document | Epoch One',
  description: 'Sign a document with your blockchain wallet',
};

export default function SignLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="sign-layout">
      {children}
    </div>
  );
} 