/**
<<<<<<< HEAD:utils/zkLogin.ts
 * Utility functions for handling zkLogin authentication
 */

/**
 * Extracts JWT token from URL
 * This function extracts the JWT token from the current URL's hash fragment or query parameters
 * 
 * @returns string | null - The JWT token if found, null otherwise
 */
export function extractJwtFromUrl(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    // First check hash fragment (for implicit flow)
    const hash = window.location.hash.substring(1);
    if (hash) {
      const hashParams = new URLSearchParams(hash);
      const idToken = hashParams.get('id_token');
      if (idToken) {
        console.log('Found JWT in hash fragment:', idToken);
        return idToken;
      }
    }

    // Then check query parameters (for authorization code flow)
    const urlParams = new URLSearchParams(window.location.search);
    
    // Check for id_token in query params
    const idToken = urlParams.get('id_token');
    if (idToken) {
      console.log('Found JWT in query params:', idToken);
      return idToken;
    }

    // Check for code in query params
    const codeParam = urlParams.get('code');
    if (codeParam) {
      console.log('Found code in query params:', codeParam);
      return codeParam;
    }

    // Check for custom parameter
    const jwtParam = urlParams.get('jwt');
    if (jwtParam) {
      console.log('Found JWT in custom param:', jwtParam);
      return jwtParam;
    }

    console.log('No JWT found in URL');
    return null;
  } catch (error) {
    console.error('Error extracting JWT from URL:', error);
    return null;
=======
 * Mock zkLogin.ts
 * This file provides mock implementations of zkLogin-related functions that don't depend on WebAssembly
 */

// Mock interface for the zkLogin state
export interface ZkLoginState {
  jwt?: string;
  nonce?: string;
  ephemeralKeyPair?: any;
  ephemeralPublicKey?: string;
  userSalt?: string;
  zkAddress?: string;
  zkProof?: any;
}

// Mock function to generate a random key pair
export function generateEphemeralKeyPair() {
  // Return a mock key pair object
  return {
    getPublicKey: () => ({
      toBase64: () => "mockPublicKey123456"
    }),
    export: () => "mockPrivateKeyExport",
    sign: () => new Uint8Array([1, 2, 3, 4])
  };
}

// Mock function to generate a nonce for OAuth
export function generateNonce(): string {
  // Generate a random nonce
  return Math.random().toString(36).substring(2, 15);
}

// Mock function to get the Google login URL
export function getGoogleLoginURL(nonce: string): string {
  // Return a mock Google OAuth URL
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || 'mock-client-id';
  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&nonce=${nonce}&response_type=id_token&scope=openid%20email&redirect_uri=${encodeURIComponent(window.location.origin)}/auth/callback`;
}

// Mock function to extract JWT from URL
export function extractJwtFromUrl(): string | null {
  // Mock implementation that returns null or a fake JWT
  if (typeof window === 'undefined') return null;
  
  // Check if there's an id_token hash fragment
  const hashMatch = window.location.hash.match(/id_token=([^&]+)/);
  if (hashMatch) {
    return hashMatch[1];
  }
  
  return null;
}

// Mock function to get a zkLogin address from JWT and salt
export function getZkLoginAddress(jwt: string, salt: string): string {
  // Generate a mock address based on the JWT and salt
  const combinedHash = `${jwt.substring(0, 10)}_${salt}`;
  return `0x${Array.from(combinedHash).reduce((acc, char) => acc + char.charCodeAt(0).toString(16), '')}`.substring(0, 42);
}

// Mock function to generate a user salt
export function getUserSalt(email?: string): string {
  if (typeof window === 'undefined') return 'server-side-mock-salt';
  
  try {
    // Check if we already have a stored salt
    const storedSalt = localStorage.getItem('zkLoginUserSalt');
    if (storedSalt) return storedSalt;
    
    // Generate a new salt
    const newSalt = Math.random().toString(36).substring(2, 15);
    localStorage.setItem('zkLoginUserSalt', newSalt);
    return newSalt;
  } catch (e) {
    // Fallback to a fixed salt if localStorage is not available
    return 'fallback-mock-salt';
  }
}

// Mock function to request a ZK proof
export async function requestZkProof(
  jwt: string, 
  ephemeralPublicKey: string, 
  userSalt: string, 
  maxEpoch: number
): Promise<any> {
  console.log('Mock requestZkProof called with:', { 
    jwtLength: jwt.length, 
    ephemeralPublicKey, 
    userSaltLength: userSalt.length, 
    maxEpoch 
  });
  
  // Return mock proof data
  return {
    proof: "mock-zk-proof-data",
    publicInputs: ["input1", "input2"],
    maxEpoch: maxEpoch,
    timestamp: Date.now()
  };
}

// Mock function to save zkLogin state to localStorage
export function saveZkLoginState(state: ZkLoginState): void {
  if (typeof window === 'undefined') return;
  
  try {
    // Strip any sensitive data before saving
    const safeState = { ...state };
    delete safeState.ephemeralKeyPair; // Don't store the actual key pair
    
    localStorage.setItem('zkLoginState', JSON.stringify(safeState));
  } catch (e) {
    console.error('Error saving zkLogin state:', e);
  }
}

// Mock function to load zkLogin state from localStorage
export function loadZkLoginState(): ZkLoginState | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const stateJson = localStorage.getItem('zkLoginState');
    if (!stateJson) return null;
    
    const state = JSON.parse(stateJson) as ZkLoginState;
    
    // Regenerate ephemeral key pair if needed
    if (!state.ephemeralKeyPair && state.ephemeralPublicKey) {
      state.ephemeralKeyPair = generateEphemeralKeyPair();
    }
    
    return state;
  } catch (e) {
    console.error('Error loading zkLogin state:', e);
    return null;
  }
}

// Mock function to clear zkLogin state from localStorage
export function clearZkLoginState(): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem('zkLoginState');
  } catch (e) {
    console.error('Error clearing zkLogin state:', e);
>>>>>>> master:src/utils/zkLogin.ts
  }
} 