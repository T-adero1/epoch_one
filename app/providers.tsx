'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import { getFullnodeUrl } from '@mysten/sui/client';
import { ZkLoginProvider } from './contexts/ZkLoginContext';

// Define Sui networks
const networks = {
  testnet: { url: getFullnodeUrl('testnet') },
};

export default function Providers({ children }: { children: React.ReactNode }) {
  // Create a stable QueryClient instance using useState
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="testnet">
        <WalletProvider autoConnect={false}>
          <ZkLoginProvider>
            {children}
          </ZkLoginProvider>
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
