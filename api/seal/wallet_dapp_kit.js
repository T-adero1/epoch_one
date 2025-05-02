// Wallet connection implementation using @mysten/dapp-kit
import { createRoot } from 'react-dom/client';
import { SuiClientProvider, WalletProvider, ConnectButton, useCurrentAccount } from '@mysten/dapp-kit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Network configuration
const networkConfig = {
  testnet: { url: 'https://fullnode.testnet.sui.io:443' },
  mainnet: { url: 'https://sui-mainnet-rpc.nodereal.io' }
};

// Create a query client instance
const queryClient = new QueryClient();

// Wallet Status component
function WalletStatus() {
  const currentAccount = useCurrentAccount();
  
  // Update global state when account changes
  if (currentAccount && window.updateWalletState) {
    window.updateWalletState(currentAccount.address);
  }
  
  return (
    <div>
      {currentAccount ? (
        <div className="wallet-connected">
          <p className="success">Connected: {currentAccount.address}</p>
        </div>
      ) : (
        <div className="wallet-disconnected">
          <p>No wallet connected</p>
        </div>
      )}
    </div>
  );
}

// App component
function WalletApp() {
  return (
    <div className="wallet-container">
      <div className="connect-button">
        <ConnectButton />
      </div>
      <WalletStatus />
    </div>
  );
}

// Initialize React component
function initializeWalletConnection(containerId, network = 'testnet') {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`Container element with ID '${containerId}' not found`);
    return;
  }
  
  const root = createRoot(container);
  
  root.render(
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork={network}>
        <WalletProvider autoConnect>
          <WalletApp />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}

// Expose function to global scope
window.initializeWalletConnection = initializeWalletConnection;

// Update global state function
window.updateWalletState = function(address) {
  if (window.state) {
    window.state.walletAddress = address;
    
    // Trigger any additional callbacks or update UI
    if (typeof window.updateWalletStatus === 'function') {
      window.updateWalletStatus();
    }
  }
}; 