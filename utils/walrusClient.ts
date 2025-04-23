/**
 * Mock implementation of walrusClient.ts
 * This is a simplified version that doesn't use WebAssembly and Walrus client
 */

// Mock functions for document storage
export async function uploadJSON(path: string, data: any): Promise<{ id: string }> {
  console.log('Mock uploadJSON called with path:', path);
  return { id: `mock-id-${Date.now()}` };
}

export async function fetchJSON(id: string): Promise<any> {
  console.log('Mock fetchJSON called with id:', id);
  return { 
    data: 'Mock data',
    timestamp: new Date().toISOString()
  };
}

export async function listBlobs(prefix?: string): Promise<any[]> {
  console.log('Mock listBlobs called with prefix:', prefix);
  return [];
}

export async function deleteBlob(id: string): Promise<{ success: boolean }> {
  console.log('Mock deleteBlob called with id:', id);
  return { success: true };
} 