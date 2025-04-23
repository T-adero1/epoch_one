'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useReducer } from 'react';
import { useRouter } from 'next/navigation';
import { generateRandomness, generateNonce, jwtToAddress } from '@mysten/sui/zklogin';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
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
  zkProofs: {
    proofPoints: {
      a: string[];
      b: string[][];
      c: string[];
    };
    issBase64Details: {
      value: string;
      indexMod4: number;
    };
    headerBase64: string;
  } | null;
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

// Define proof data type
interface ZkProofData {
  proofPoints: {
    a: string[];
    b: string[][];
    c: string[];
  };
  issBase64Details: {
    value: string;
    indexMod4: number;
  };
  headerBase64: string;
}

// Define context type
interface ZkLoginContextType extends LoginState {
  startLogin: () => Promise<string>;
  completeLogin: (jwt: string) => Promise<void>;
  logout: () => void;
  generateProof: () => Promise<ZkProofData | null>;
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
const NETWORK = 'testnet'; // Changed from 'testnet' to 'devnet'
const PROVER_SERVICE_URL = 'https://prover-dev.mystenlabs.com/v1'; // Updated to use dev endpoint

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
  }, [state.isLoading]);

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
  }, [state.sessionExpiry, router, dispatch]);

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
      // Check if we already have a salt for this JWT
      const storedSalt = localStorage.getItem(`salt_${jwt}`);
      if (storedSalt) {
        return storedSalt;
      }

      // Generate a new salt
      const salt = generateRandomness();
      
      // Store the salt for future use
      localStorage.setItem(`salt_${jwt}`, salt);
      
      return salt;
    } catch (error) {
      console.error('Error getting salt:', error);
      throw error;
    }
  }, []);

  // Generate ZK Proof
  const getZkProof = useCallback(async (params: {
    jwt: string;
    salt: string;
    keyPair: Ed25519Keypair;
    maxEpoch: number;
    randomness: string;
  }): Promise<ZkProofData> => {
    try {
      const { jwt, salt, keyPair, maxEpoch, randomness } = params;
      
      // Extract the necessary claims from the JWT
      const extendedEphemeralPublicKey = Array.from(
        new Uint8Array([0, ...keyPair.getPublicKey().toSuiBytes()])
      );
      
      console.log('Requesting ZK proof with params:', {
        jwt: jwt.substring(0, 20) + '...', // Log partial JWT for debugging
        salt,
        maxEpoch,
        randomness,
        keyClaimName: 'sub'
      });
      
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
        const errorData = await response.json().catch(() => ({}));
        console.error('Prover service error:', {
          status: response.status,
          statusText: response.statusText,
          errorData
        });
        throw new Error(`Prover service returned ${response.status}: ${JSON.stringify(errorData)}`);
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
      
      // Store the key pair in base64 format
      const publicKey = ephemeralKeyPair.getPublicKey().toBase64();
      const privateKey = ephemeralKeyPair.getSecretKey();
      
      const currentEpoch = await getCurrentEpoch();
      const zkLoginState: ZkLoginState = {
        ephemeralKeyPair: {
          publicKey,
          privateKey,
        },
        randomness: generateRandomness(),
        jwt: null,
        maxEpoch: currentEpoch + 10, // Valid for 10 epochs
        zkProofs: null,
      };
      
      // Save the intermediate state
      if (typeof window !== 'undefined') {
        localStorage.setItem('zklogin_intermediate_state', JSON.stringify(zkLoginState));
      }
      
      // Generate nonce
      const nonce = generateNonce(
        ephemeralKeyPair.getPublicKey(), 
        zkLoginState.maxEpoch || 0, 
        zkLoginState.randomness || ''
      );
      
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
      console.log('Completing zkLogin process with JWT...', jwt);
      
      // Get the intermediate state
      const intermediateStateStr = localStorage.getItem('zklogin_intermediate_state');
      if (!intermediateStateStr) {
        console.error('No intermediate state found in localStorage');
        throw new Error('No intermediate state found. Please try logging in again.');
      }
      
      const intermediateState: ZkLoginState = JSON.parse(intermediateStateStr);
      console.log('Retrieved intermediate state:', intermediateState);
      
      if (!intermediateState.ephemeralKeyPair?.privateKey || !intermediateState.maxEpoch || !intermediateState.randomness) {
        console.error('Missing required state data');
        throw new Error('Invalid intermediate state. Please try logging in again.');
      }
      
      // Restore the ephemeral key pair using the stored private key
      const ephemeralKeyPair = Ed25519Keypair.fromSecretKey(
        intermediateState.ephemeralKeyPair.privateKey
      );
      console.log('Restored ephemeral key pair');
      
      // Get salt
      console.log('Generating salt...');
      const salt = await getSalt(jwt);
      console.log('Generated salt:', salt);
      
      // Get ZK proof
      console.log('Requesting ZK proof...');
      const zkProofs = await getZkProof({
        jwt,
        salt,
        keyPair: ephemeralKeyPair,
        maxEpoch: intermediateState.maxEpoch || 0,
        randomness: intermediateState.randomness || '',
      });
      console.log('Received ZK proof');
      
      // Calculate the user's address
      const userAddress = jwtToAddress(jwt, salt);
      console.log('Calculated user address:', userAddress);
      
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
      
      console.log('Dispatching login success with user data:', userData);
      
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
      
      console.log('Login completed successfully, attempting to redirect to dashboard');
      console.log('Current authentication state:', {
        isAuthenticated: state.isAuthenticated,
        userAddress: state.userAddress,
        sessionExpiry: state.sessionExpiry
      });
      
      // Redirect to dashboard
      try {
        await router.push('/dashboard');
        console.log('Successfully initiated dashboard redirect');
      } catch (error) {
        console.error('Error during dashboard redirect:', error);
      }
    } catch (error) {
      console.error('Login completion error:', error);
      // Clean up any partial state
      localStorage.removeItem('zklogin_intermediate_state');
      dispatch({ 
        type: 'LOGIN_FAILURE', 
        payload: error instanceof Error ? error.message : 'Failed to complete login. Please try again.' 
      });
    }
  }, [getSalt, getZkProof, router]);

  // Execute a transaction with zkLogin
  const executeTransaction = useCallback(async (txb: Transaction): Promise<{ digest: string }> => {
    if (!state.isAuthenticated || !state.zkLoginState) {
      throw new Error('User is not authenticated');
    }
    
    try {
      if (!checkSessionValidity()) {
        throw new Error('Session expired');
      }
      
      console.log('Transaction received:', txb);
      
      return { digest: 'verification_only_no_actual_transaction' };
    } catch (error) {
      console.error('Transaction execution error:', error);
      throw error;
    }
  }, [state.isAuthenticated, state.zkLoginState, checkSessionValidity]);

  // Generate a proof for an existing session
  const generateProof = useCallback(async (): Promise<ZkProofData | null> => {
    console.log('Generating proof for existing session');
    if (!state.isAuthenticated || !state.zkLoginState) {
      throw new Error('User is not authenticated');
    }
    
    try {
      if (!checkSessionValidity()) {
        throw new Error('Session expired');
      }
      
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