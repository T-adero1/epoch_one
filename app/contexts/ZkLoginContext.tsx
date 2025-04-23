'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useReducer } from 'react';
import { useRouter } from 'next/navigation';
import { generateRandomness, generateNonce, jwtToAddress } from '@mysten/sui/zklogin';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromB64 } from '@mysten/sui/utils';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';

// Define state types
interface User {
  address: string;
  email?: string;
  displayName?: string;
  profilePicture?: string;
}

interface ZkLoginState {
  ephemeralKeyPair: {
    publicKey: string;
    privateKey: string;
  } | null;
  randomness: string | null;
  jwt: string | null;
  maxEpoch: number | null;
  zkProofs: any | null;
}

interface LoginState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  userAddress: string | null;
  error: string | null;
  sessionExpiry: number | null;
  zkLoginState: ZkLoginState | null;
}

// Define action types
type LoginAction = 
  | { type: 'LOGIN_START' }
  | { type: 'LOGIN_SUCCESS'; payload: { user: User; zkLoginState: ZkLoginState; expiry: number } }
  | { type: 'LOGIN_FAILURE'; payload: string }
  | { type: 'LOGOUT' }
  | { type: 'CLEAR_ERROR' }
  | { type: 'SESSION_EXPIRED' }
  | { type: 'UPDATE_USER'; payload: Partial<User> }
  | { type: 'UPDATE_ZKLOGIN_STATE'; payload: Partial<ZkLoginState> };

// Initial state
const initialState: LoginState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  userAddress: null,
  error: null,
  sessionExpiry: null,
  zkLoginState: null
};

// Create reducer function
function loginReducer(state: LoginState, action: LoginAction): LoginState {
  switch (action.type) {
    case 'LOGIN_START':
      return {
        ...state,
        isLoading: true,
        error: null
      };
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        isLoading: false,
        isAuthenticated: true,
        user: action.payload.user,
        userAddress: action.payload.user.address,
        zkLoginState: action.payload.zkLoginState,
        sessionExpiry: action.payload.expiry,
        error: null
      };
    case 'LOGIN_FAILURE':
      return {
        ...state,
        isLoading: false,
        isAuthenticated: false,
        error: action.payload,
        user: null,
        userAddress: null,
        zkLoginState: null
      };
    case 'LOGOUT':
      return {
        ...state,
        isAuthenticated: false,
        user: null,
        userAddress: null,
        zkLoginState: null,
        sessionExpiry: null,
        isLoading: false,
      };
    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null
      };
    case 'SESSION_EXPIRED':
      return {
        ...state,
        isAuthenticated: false,
        error: 'Your session has expired. Please login again.',
        sessionExpiry: null
      };
    case 'UPDATE_USER':
      return {
        ...state,
        user: state.user ? { ...state.user, ...action.payload } : null
      };
    case 'UPDATE_ZKLOGIN_STATE':
      return {
        ...state,
        zkLoginState: state.zkLoginState ? { ...state.zkLoginState, ...action.payload } : null
      };
    default:
      return state;
  }
}

// Define context type
interface ZkLoginContextType extends LoginState {
  startLogin: () => Promise<string>;
  completeLogin: (jwt: string) => Promise<void>;
  logout: () => void;
  generateProof: () => Promise<any>;
  clearError: () => void;
  updateUserProfile: (userData: Partial<User>) => void;
  checkSessionValidity: () => void;
  executeTransaction: (txb: Transaction) => Promise<{ digest: string }>;
}

// Create context with default value
const ZkLoginContext = createContext<ZkLoginContextType>({
  ...initialState,
  startLogin: async () => '',
  completeLogin: async () => {},
  logout: () => {},
  generateProof: async () => null,
  clearError: () => {},
  updateUserProfile: () => {},
  checkSessionValidity: () => {},
  executeTransaction: async () => ({ digest: '' }),
});

export const useZkLogin = () => useContext(ZkLoginContext);

// Constants
const SESSION_STORAGE_KEY = 'epochone_session';
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const NETWORK = 'testnet'; // 'devnet', 'testnet', or 'mainnet'
const SALT_SERVICE_URL = 'https://salt.api.mystenlabs.com/get_salt';
const PROVER_SERVICE_URL = 'https://prover.mystenlabs.com/v1';

export const ZkLoginProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [state, dispatch] = useReducer(loginReducer, initialState);
  const router = useRouter();
  const [suiClient] = useState(new SuiClient({ url: getFullnodeUrl(NETWORK) }));

  // Load session from storage
  const loadSession = useCallback(async () => {
    try {
      // Try to load from localStorage
      if (typeof window !== 'undefined') {
        const savedSessionStr = localStorage.getItem(SESSION_STORAGE_KEY);
        
        if (savedSessionStr) {
          const savedSession = JSON.parse(savedSessionStr);
          const now = Date.now();
          
          // Check if session is still valid
          if (savedSession.expiry && savedSession.expiry > now) {
            // Session is valid, restore state
            dispatch({
              type: 'LOGIN_SUCCESS',
              payload: {
                user: savedSession.user,
                zkLoginState: savedSession.zkLoginState,
                expiry: savedSession.expiry
              }
            });
            
            // Schedule session expiry check
            const timeUntilExpiry = savedSession.expiry - now;
            setTimeout(() => dispatch({ type: 'SESSION_EXPIRED' }), timeUntilExpiry);
            
            console.log('Session restored from localStorage');
          } else {
            // Session expired
            localStorage.removeItem(SESSION_STORAGE_KEY);
            dispatch({ type: 'SESSION_EXPIRED' });
          }
        } else {
          // No session found
          dispatch({ type: 'LOGOUT' });
        }
      }
    } catch (err) {
      console.error('Error loading session:', err);
      dispatch({ type: 'LOGIN_FAILURE', payload: 'Failed to load existing session' });
    } finally {
      if (state.isLoading) {
        dispatch({ type: 'LOGIN_FAILURE', payload: '' }); // Just to set isLoading to false
      }
    }
  }, []);

  // Check for existing session on mount
  useEffect(() => {
    // Set a short delay for authentication check
    const timer = setTimeout(() => {
      loadSession();
    }, 500);
    
    return () => clearTimeout(timer);
  }, [loadSession]);

  // Function to check session validity
  const checkSessionValidity = useCallback(() => {
    if (state.sessionExpiry && state.sessionExpiry < Date.now()) {
      dispatch({ type: 'SESSION_EXPIRED' });
      router.push('/');
      return false;
    }
    return true;
  }, [state.sessionExpiry, router]);

  // Set up periodic session checks
  useEffect(() => {
    if (state.isAuthenticated && state.sessionExpiry) {
      const interval = setInterval(checkSessionValidity, 60000); // Check every minute
      return () => clearInterval(interval);
    }
  }, [state.isAuthenticated, state.sessionExpiry, checkSessionValidity]);

  // Get the current epoch from Sui
  const getCurrentEpoch = useCallback(async (): Promise<number> => {
    try {
      const { epoch } = await suiClient.getLatestSuiSystemState();
      return Number(epoch);
    } catch (error) {
      console.error('Error getting current epoch:', error);
      throw error;
    }
  }, [suiClient]);

  // Generate Salt for zkLogin
  const getSalt = useCallback(async (jwt: string): Promise<string> => {
    try {
      const response = await fetch(SALT_SERVICE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ jwt }),
      });
      
      if (!response.ok) {
        throw new Error(`Salt service returned ${response.status}`);
      }
      
      const data = await response.json();
      return data.salt;
    } catch (error) {
      console.error('Error getting salt:', error);
      throw error;
    }
  }, []);

  // Generate ZK Proof
  const getZkProof = useCallback(async (params: {
    jwt: string,
    salt: string,
    keyPair: Ed25519Keypair,
    maxEpoch: number,
    randomness: string,
  }): Promise<any> => {
    try {
      const { jwt, salt, keyPair, maxEpoch, randomness } = params;
      
      // Extract the necessary claims from the JWT
      const jwtPayload = JSON.parse(atob(jwt.split('.')[1]));
      const extendedEphemeralPublicKey = Array.from(
        new Uint8Array([0, ...keyPair.getPublicKey().toSuiBytes()])
      );
      
      const response = await fetch(PROVER_SERVICE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jwt,
          salt,
          extendedEphemeralPublicKey,
          maxEpoch,
          jwtRandomness: randomness,
          keyClaimName: 'sub',
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Prover service returned ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error getting ZK proof:', error);
      throw error;
    }
  }, []);

  // Start the zkLogin process
  const startLogin = useCallback(async (): Promise<string> => {
    console.log('Starting zkLogin process...');
    dispatch({ type: 'LOGIN_START' });
    
    try {
      // Generate ephemeral key pair
      const ephemeralKeyPair = Ed25519Keypair.generate();
      const publicKey = Array.from(ephemeralKeyPair.getPublicKey().toSuiBytes());
      
      // Get the secret key directly as bytes
      const secretKey = Array.from(ephemeralKeyPair.getSecretKey());
      
      // Get current epoch and calculate max epoch
      const currentEpoch = await getCurrentEpoch();
      const maxEpoch = currentEpoch + 10; // Valid for 10 epochs
      
      // Generate randomness
      const randomness = generateRandomness();
      
      // Generate nonce
      const nonce = generateNonce(ephemeralKeyPair.getPublicKey(), maxEpoch, randomness);
      
      // Save ephemeral key pair and other data
      const zkLoginState: ZkLoginState = {
        ephemeralKeyPair: {
          publicKey: JSON.stringify(publicKey),
          privateKey: JSON.stringify(secretKey),
        },
        randomness,
        jwt: null,
        maxEpoch,
        zkProofs: null,
      };
      
      // Save the intermediate state
      if (typeof window !== 'undefined') {
        localStorage.setItem('zklogin_intermediate_state', JSON.stringify(zkLoginState));
      }
      
      return nonce;
    } catch (error) {
      console.error('Login error:', error);
      dispatch({ type: 'LOGIN_FAILURE', payload: 'Failed to start login process. Please try again.' });
      throw error;
    }
  }, [getCurrentEpoch]);

  // Complete the zkLogin process with JWT
  const completeLogin = useCallback(async (jwt: string): Promise<void> => {
    try {
      console.log('Completing zkLogin process with JWT...');
      
      // Get the intermediate state
      const intermediateStateStr = localStorage.getItem('zklogin_intermediate_state');
      if (!intermediateStateStr) {
        throw new Error('No intermediate state found');
      }
      
      const intermediateState: ZkLoginState = JSON.parse(intermediateStateStr);
      
      // Restore the ephemeral key pair
      const privateKeyBytes = new Uint8Array(JSON.parse(intermediateState.ephemeralKeyPair!.privateKey));
      
      // Recreate the keypair from saved bytes
      const importedKeypair = Ed25519Keypair.fromSecretKey(privateKeyBytes);
      
      // Get salt
      const salt = await getSalt(jwt);
      
      // Get ZK proof
      const zkProofs = await getZkProof({
        jwt,
        salt,
        keyPair: importedKeypair,
        maxEpoch: intermediateState.maxEpoch!,
        randomness: intermediateState.randomness!,
      });
      
      // Calculate the user's address
      const userAddress = jwtToAddress(jwt, salt);
      
      // Update zkLoginState
      const updatedZkLoginState: ZkLoginState = {
        ...intermediateState,
        jwt,
        zkProofs,
      };
      
      // Calculate session expiry
      const expiry = Date.now() + SESSION_DURATION;
      
      // Create user data
      const jwtPayload = JSON.parse(atob(jwt.split('.')[1]));
      const userData: User = {
        address: userAddress,
        email: jwtPayload.email || '',
        displayName: jwtPayload.name || '',
        profilePicture: jwtPayload.picture || '',
      };
      
      // Save session data
      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: {
          user: userData,
          zkLoginState: updatedZkLoginState,
          expiry,
        },
      });
      
      // Save to localStorage
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
        user: userData,
        zkLoginState: updatedZkLoginState,
        expiry,
      }));
      
      // Clean up intermediate state
      localStorage.removeItem('zklogin_intermediate_state');
      
      // Redirect to dashboard
      router.push('/dashboard');
    } catch (error) {
      console.error('Login completion error:', error);
      dispatch({ type: 'LOGIN_FAILURE', payload: 'Failed to complete login. Please try again.' });
    }
  }, [getSalt, getZkProof, router]);

  // Execute a transaction with zkLogin
  const executeTransaction = useCallback(async (txb: Transaction): Promise<{ digest: string }> => {
    if (!state.isAuthenticated || !state.zkLoginState) {
      throw new Error('User is not authenticated');
    }
    
    try {
      // First, make sure the session is valid
      if (!checkSessionValidity()) {
        throw new Error('Session expired');
      }
      
      // We'll simply return a success message without actually executing a transaction
      // This is because we're removing the transaction logic per the requirement
      return { digest: 'verification_only_no_actual_transaction' };
    } catch (error) {
      console.error('Transaction execution error:', error);
      throw error;
    }
  }, [state, checkSessionValidity]);

  // Generate a proof for an existing session
  const generateProof = useCallback(async () => {
    console.log('Generating proof for existing session');
    if (!state.isAuthenticated || !state.zkLoginState) {
      throw new Error('User is not authenticated');
    }
    
    try {
      // Check session validity
      if (!checkSessionValidity()) {
        throw new Error('Session expired');
      }
      
      // For simplicity, we'll just return the existing zkProofs
      // In a real implementation, you might want to regenerate the proof if it's close to expiry
      return state.zkLoginState.zkProofs;
    } catch (error) {
      console.error('Error generating proof:', error);
      throw error;
    }
  }, [state.isAuthenticated, state.zkLoginState, checkSessionValidity]);

  // Logout function
  const logout = useCallback(() => {
    console.log('Logging out user');
    
    // Clear localStorage state
    if (typeof window !== 'undefined') {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      localStorage.removeItem('zklogin_intermediate_state');
    }
    
    dispatch({ type: 'LOGOUT' });
    
    // Redirect to home page
    router.push('/');
  }, [router]);

  // Function to clear error
  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
  }, []);

  // Function to update user profile
  const updateUserProfile = useCallback((userData: Partial<User>) => {
    if (!state.isAuthenticated) return;
    
    dispatch({ type: 'UPDATE_USER', payload: userData });
    
    // Update localStorage
    if (typeof window !== 'undefined' && state.user) {
      const currentSession = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || '{}');
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
        ...currentSession,
        user: { ...state.user, ...userData }
      }));
    }
  }, [state.isAuthenticated, state.user]);

  // Context value with state and actions
  const value: ZkLoginContextType = {
    ...state,
    startLogin,
    completeLogin,
    logout,
    generateProof,
    clearError,
    updateUserProfile,
    checkSessionValidity,
    executeTransaction,
  };

  return (
    <ZkLoginContext.Provider value={value}>
      {children}
    </ZkLoginContext.Provider>
  );
};