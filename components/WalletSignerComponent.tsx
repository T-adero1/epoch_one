'use client';

import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SuiClientProvider, WalletProvider, useSignPersonalMessage, ConnectButton } from '@mysten/dapp-kit';
import { getFullnodeUrl } from '@mysten/sui/client';
import { Button } from './ui/button';
import '@mysten/dapp-kit/dist/index.css';

// Define Sui networks
const networks = {
  testnet: { url: getFullnodeUrl('testnet') },
};

interface WalletSignerProps {
  message: Uint8Array;
  onSignatureReceived: (signature: string) => void;
  onCancel: () => void;
}

// Wrap the actual component with the necessary providers
export default function WalletSignerWrapper(props: WalletSignerProps) {
  console.log("[WalletSigner] Initializing wrapper with message length:", props.message.length);
  // Create a QueryClient instance specific to this component
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="testnet">
        <WalletProvider autoConnect={false}>
          <WalletSigner {...props} />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}

// The actual component that uses wallet hooks
function WalletSigner({ message, onSignatureReceived, onCancel }: WalletSignerProps) {
  console.log("[WalletSigner] Component rendering, trying to use wallet hooks");
  const { mutateAsync: signPersonalMessage, isPending } = useSignPersonalMessage();
  const [error, setError] = useState<string | null>(null);
  
  console.log("[WalletSigner] Wallet hook initialized successfully");

  useEffect(() => {
    console.log("[WalletSigner] Component mounted");
  }, []);

  const handleSign = async () => {
    try {
      console.log("[WalletSigner] Starting signing process");
      setError(null);
      const result = await signPersonalMessage({ message });
      console.log("[WalletSigner] Signature received", result);
      onSignatureReceived(result.signature);
    } catch (err) {
      console.error("[WalletSigner] Error signing message:", err);
      setError(err instanceof Error ? err.message : "Unknown error signing message");
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 border rounded-lg">
      <h3 className="text-lg font-medium">Sign Message with Wallet</h3>
      <p className="text-sm text-gray-500">Please connect your wallet and sign this message to decrypt your document.</p>
      
      <ConnectButton />
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}
      
      <div className="flex gap-2">
        <Button onClick={handleSign} disabled={isPending}>
          {isPending ? 'Signing...' : 'Sign with Wallet'}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
} 