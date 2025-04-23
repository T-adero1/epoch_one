/**
 * Wallet Service
 * 
 * Service for handling blockchain wallet operations, connections,
 * signatures, and transaction management.
 */

import axios from 'axios';

// Type definitions
export interface WalletInfo {
  address: string;
  network: string;
  balance: string;
  chainId: number;
  connected: boolean;
}

export interface SignatureRequest {
  message: string;
  walletAddress: string;
}

export interface SignatureResponse {
  signature: string;
  walletAddress: string;
  timestamp: number;
}

export interface TransactionRequest {
  to: string;
  value: string;
  data?: string;
  gasLimit?: string;
}

export interface TransactionResponse {
  hash: string;
  blockNumber?: number;
  confirmations: number;
  from: string;
  to: string;
  status: 'pending' | 'confirmed' | 'failed';
}

/**
 * Service for wallet operations
 */
export const walletService = {
  /**
   * Connect to wallet provider
   * 
   * @returns Promise resolving to wallet information
   */
  async connect(): Promise<WalletInfo> {
    try {
      // Implementation will depend on the wallet provider being used
      // (MetaMask, WalletConnect, etc.)
      if (typeof window !== 'undefined' && window.ethereum) {
        const accounts = await window.ethereum.request({
          method: 'eth_requestAccounts',
        });
        
        const address = accounts[0];
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        const balance = await window.ethereum.request({
          method: 'eth_getBalance',
          params: [address, 'latest'],
        });
        
        const network = this.getNetworkFromChainId(parseInt(chainId, 16));
        
        const walletInfo: WalletInfo = {
          address,
          network,
          balance,
          chainId: parseInt(chainId, 16),
          connected: true,
        };
        
        return walletInfo;
      } else {
        throw new Error('No wallet provider found');
      }
    } catch (error) {
      console.error('Error connecting to wallet:', error);
      throw error;
    }
  },

  /**
   * Disconnect from wallet provider
   * 
   * @returns Promise resolving to boolean indicating success
   */
  async disconnect(): Promise<boolean> {
    try {
      // Most providers don't have a disconnect method
      // We can simulate disconnection by clearing local state
      localStorage.removeItem('walletConnected');
      return true;
    } catch (error) {
      console.error('Error disconnecting from wallet:', error);
      throw error;
    }
  },

  /**
   * Get current wallet information
   * 
   * @returns Promise resolving to wallet information or null if not connected
   */
  async getWalletInfo(): Promise<WalletInfo | null> {
    try {
      if (typeof window !== 'undefined' && window.ethereum) {
        const accounts = await window.ethereum.request({
          method: 'eth_accounts',
        });
        
        if (accounts.length === 0) {
          return null;
        }
        
        const address = accounts[0];
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        const balance = await window.ethereum.request({
          method: 'eth_getBalance',
          params: [address, 'latest'],
        });
        
        const network = this.getNetworkFromChainId(parseInt(chainId, 16));
        
        const walletInfo: WalletInfo = {
          address,
          network,
          balance,
          chainId: parseInt(chainId, 16),
          connected: true,
        };
        
        return walletInfo;
      } else {
        return null;
      }
    } catch (error) {
      console.error('Error getting wallet info:', error);
      return null;
    }
  },

  /**
   * Sign a message with the connected wallet
   * 
   * @param request - The signature request details
   * @returns Promise resolving to signature response
   */
  async signMessage(request: SignatureRequest): Promise<SignatureResponse> {
    try {
      if (typeof window !== 'undefined' && window.ethereum) {
        const accounts = await window.ethereum.request({
          method: 'eth_accounts',
        });
        
        if (accounts.length === 0) {
          throw new Error('No wallet connected');
        }
        
        const signature = await window.ethereum.request({
          method: 'personal_sign',
          params: [request.message, accounts[0]],
        });
        
        return {
          signature,
          walletAddress: accounts[0],
          timestamp: Date.now(),
        };
      } else {
        throw new Error('No wallet provider found');
      }
    } catch (error) {
      console.error('Error signing message:', error);
      throw error;
    }
  },

  /**
   * Send a transaction using the connected wallet
   * 
   * @param request - The transaction request details
   * @returns Promise resolving to transaction response
   */
  async sendTransaction(request: TransactionRequest): Promise<TransactionResponse> {
    try {
      if (typeof window !== 'undefined' && window.ethereum) {
        const accounts = await window.ethereum.request({
          method: 'eth_accounts',
        });
        
        if (accounts.length === 0) {
          throw new Error('No wallet connected');
        }
        
        const transactionParameters = {
          from: accounts[0],
          to: request.to,
          value: request.value,
          data: request.data || '0x',
          gas: request.gasLimit,
        };
        
        const txHash = await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [transactionParameters],
        });
        
        return {
          hash: txHash,
          confirmations: 0,
          from: accounts[0],
          to: request.to,
          status: 'pending',
        };
      } else {
        throw new Error('No wallet provider found');
      }
    } catch (error) {
      console.error('Error sending transaction:', error);
      throw error;
    }
  },

  /**
   * Check transaction status
   * 
   * @param txHash - The transaction hash
   * @returns Promise resolving to transaction response
   */
  async getTransactionStatus(txHash: string): Promise<TransactionResponse> {
    try {
      if (typeof window !== 'undefined' && window.ethereum) {
        const tx = await window.ethereum.request({
          method: 'eth_getTransactionByHash',
          params: [txHash],
        });
        
        if (!tx) {
          throw new Error('Transaction not found');
        }
        
        const receipt = await window.ethereum.request({
          method: 'eth_getTransactionReceipt',
          params: [txHash],
        });
        
        let status = 'pending';
        let confirmations = 0;
        let blockNumber;
        
        if (receipt) {
          blockNumber = parseInt(receipt.blockNumber, 16);
          status = receipt.status === '0x1' ? 'confirmed' : 'failed';
          
          const currentBlock = await window.ethereum.request({
            method: 'eth_blockNumber',
          });
          confirmations = parseInt(currentBlock, 16) - blockNumber;
        }
        
        return {
          hash: txHash,
          blockNumber,
          confirmations,
          from: tx.from,
          to: tx.to,
          status: status as 'pending' | 'confirmed' | 'failed',
        };
      } else {
        throw new Error('No wallet provider found');
      }
    } catch (error) {
      console.error(`Error getting transaction status for ${txHash}:`, error);
      throw error;
    }
  },

  /**
   * Add a network to the wallet
   * 
   * @param chainId - The chain ID
   * @param chainName - The name of the chain
   * @param rpcUrl - The RPC URL
   * @param blockExplorerUrl - The block explorer URL
   * @returns Promise resolving to boolean indicating success
   */
  async addNetwork(
    chainId: number,
    chainName: string,
    rpcUrl: string,
    blockExplorerUrl: string
  ): Promise<boolean> {
    try {
      if (typeof window !== 'undefined' && window.ethereum) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: `0x${chainId.toString(16)}`,
              chainName,
              rpcUrls: [rpcUrl],
              blockExplorerUrls: [blockExplorerUrl],
              nativeCurrency: {
                name: 'Ether',
                symbol: 'ETH',
                decimals: 18,
              },
            },
          ],
        });
        return true;
      } else {
        throw new Error('No wallet provider found');
      }
    } catch (error) {
      console.error('Error adding network to wallet:', error);
      throw error;
    }
  },

  /**
   * Switch to a specific network
   * 
   * @param chainId - The chain ID to switch to
   * @returns Promise resolving to boolean indicating success
   */
  async switchNetwork(chainId: number): Promise<boolean> {
    try {
      if (typeof window !== 'undefined' && window.ethereum) {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${chainId.toString(16)}` }],
        });
        return true;
      } else {
        throw new Error('No wallet provider found');
      }
    } catch (error) {
      console.error('Error switching network:', error);
      throw error;
    }
  },

  /**
   * Verify a signature
   * 
   * @param message - The original message
   * @param signature - The signature to verify
   * @param address - The expected signer address
   * @returns Promise resolving to boolean indicating if signature is valid
   */
  async verifySignature(
    message: string,
    signature: string,
    address: string
  ): Promise<boolean> {
    try {
      // This is a server-side verification that would be implemented
      // via an API call to your backend
      const response = await axios.post<{ valid: boolean }>('/api/verify-signature', {
        message,
        signature,
        address,
      });
      
      return response.data.valid;
    } catch (error) {
      console.error('Error verifying signature:', error);
      throw error;
    }
  },

  /**
   * Helper method to get network name from chain ID
   * 
   * @param chainId - The chain ID
   * @returns The network name
   */
  getNetworkFromChainId(chainId: number): string {
    switch (chainId) {
      case 1:
        return 'Ethereum Mainnet';
      case 3:
        return 'Ropsten Testnet';
      case 4:
        return 'Rinkeby Testnet';
      case 5:
        return 'Goerli Testnet';
      case 42:
        return 'Kovan Testnet';
      case 56:
        return 'Binance Smart Chain';
      case 97:
        return 'Binance Smart Chain Testnet';
      case 137:
        return 'Polygon Mainnet';
      case 80001:
        return 'Mumbai Testnet';
      default:
        return 'Unknown Network';
    }
  },
};

// Add ethereum to the window object for TypeScript
declare global {
  interface Window {
    ethereum?: any;
  }
}

export default walletService; 