/**
 * Mock implementation of suiClient.ts
 * This is a simplified version that doesn't use WebAssembly
 */

// Mock function to get current epoch
export async function getCurrentEpoch(): Promise<number> {
  // Return a mock epoch number
  return 42;
}

// Mock function to get transaction details
export async function getTransaction(txId: string): Promise<any> {
  return {
    digest: txId,
    transaction: {
      data: {
        sender: '0x123456789abcdef',
      },
    },
    effects: {
      status: { status: 'success' },
    },
    timestamp_ms: Date.now(),
    confirmed_local_execution: true,
  };
}

// Mock function to check if an address exists
export async function checkAddress(address: string): Promise<boolean> {
  // Always return true for mock
  return true;
} 