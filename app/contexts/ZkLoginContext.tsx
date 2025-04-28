'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useReducer } from 'react';
import { useRouter } from 'next/navigation';
import { generateRandomness, generateNonce, jwtToAddress } from '@mysten/sui/zklogin';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';

/* eslint-disable react-hooks/exhaustive-deps */

// Define state types
interface User {
  address: string;
  email?: string;
  displayName?: string;
  profilePicture?: string;
  id?: string;
  googleId?: string | null;
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
  isAuthStateResolved: boolean;
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
  | { type: 'UPDATE_ZKLOGIN_STATE'; payload: Partial<ZkLoginState> }
  | { type: 'AUTH_STATE_RESOLVED' };

// Initial state
const initialState: LoginState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isAuthStateResolved: false,
  userAddress: null,
  error: null,
  sessionExpiry: null,
  zkLoginState: null
};

// Create reducer function
function loginReducer(state: LoginState, action: LoginAction): LoginState {
  console.log(`[AUTH:REDUCER] Processing action: ${action.type}`, {
    prevState: {
      isAuthenticated: state.isAuthenticated,
      isLoading: state.isLoading,
      isAuthStateResolved: state.isAuthStateResolved,
      hasUser: !!state.user,
      timestamp: Date.now()
    }
  });
  
  let newState;
  
  switch (action.type) {
    case 'LOGIN_START':
      newState = {
        ...state,
        isLoading: true,
        error: null
      };
      break;
    case 'LOGIN_SUCCESS':
      newState = {
        ...state,
        isLoading: false,
        isAuthenticated: true,
        isAuthStateResolved: true,
        user: action.payload.user,
        userAddress: action.payload.user.address,
        zkLoginState: action.payload.zkLoginState,
        sessionExpiry: action.payload.expiry,
        error: null
      };
      break;
    case 'LOGIN_FAILURE':
      newState = {
        ...state,
        isLoading: false,
        isAuthenticated: false,
        isAuthStateResolved: true,
        error: action.payload,
        user: null,
        userAddress: null,
        zkLoginState: null
      };
      break;
    case 'LOGOUT':
      newState = {
        ...state,
        isAuthenticated: false,
        user: null,
        userAddress: null,
        zkLoginState: null,
        sessionExpiry: null,
        isLoading: false,
      };
      break;
    case 'CLEAR_ERROR':
      newState = {
        ...state,
        error: null
      };
      break;
    case 'SESSION_EXPIRED':
      newState = {
        ...state,
        isAuthenticated: false,
        error: 'Your session has expired. Please login again.',
        sessionExpiry: null
      };
      break;
    case 'UPDATE_USER':
      newState = {
        ...state,
        user: state.user ? { ...state.user, ...action.payload } : null
      };
      break;
    case 'UPDATE_ZKLOGIN_STATE':
      newState = {
        ...state,
        zkLoginState: state.zkLoginState ? { ...state.zkLoginState, ...action.payload } : null
      };
      break;
    case 'AUTH_STATE_RESOLVED':
      newState = {
        ...state,
        isAuthStateResolved: true
      };
      break;
    default:
      return state;
  }
  
  console.log(`[AUTH:REDUCER] Action ${action.type} completed`, {
    newState: {
      isAuthenticated: newState.isAuthenticated, 
      isLoading: newState.isLoading,
      isAuthStateResolved: newState.isAuthStateResolved,
      hasUser: !!newState.user,
      timestamp: Date.now()
    }
  });
  
  return newState;
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

// Add performance tracking helper
const performanceTracker = {
  startTimes: {} as Record<string, number>,
  
  start(operation: string) {
    this.startTimes[operation] = performance.now();
    console.log(`[PERF] ⏱️ Starting: ${operation}`);
  },
  
  end(operation: string) {
    const startTime = this.startTimes[operation];
    if (startTime) {
      const duration = Math.round(performance.now() - startTime);
      console.log(`[PERF] ⏱️ Completed: ${operation} (took ${duration}ms)`);
      delete this.startTimes[operation];
      return duration;
    }
    console.log(`[PERF] ⚠️ Warning: Tried to end timing for "${operation}" but no start time found`);
    return 0;
  }
};

// Add this function to manage parallel operations
const runParallel = async <T extends any[]>(...promises: Promise<T[number]>[]) => {
  return Promise.all(promises);
};

// Add this to pre-generate keypairs during idle time
const usePreGeneratedKeys = () => {
  const [preGeneratedKeyPair, setPreGeneratedKeyPair] = useState<Ed25519Keypair | null>(null);
  
  useEffect(() => {
    // Function to generate a keypair
    const generateKeyPair = () => {
      console.log('[PERF] 🔄 Pre-generating keypair during idle time');
      const keypair = Ed25519Keypair.generate();
      setPreGeneratedKeyPair(keypair);
      console.log('[PERF] ✅ Keypair pre-generated and ready for use');
    };
    
    // Use requestIdleCallback if available, or setTimeout as fallback
    if (typeof window !== 'undefined') {
      if ('requestIdleCallback' in window) {
        // @ts-ignore - TypeScript might not recognize requestIdleCallback
        window.requestIdleCallback(generateKeyPair);
      } else {
        setTimeout(generateKeyPair, 1000); // Fallback
      }
    }
    
    // Regenerate on unmount to have a fresh one ready for next use
    return () => {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        // @ts-ignore
        window.requestIdleCallback(generateKeyPair);
      }
    };
  }, []);
  
  return preGeneratedKeyPair;
};

export const ZkLoginProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  // Create a ref to store mount start time
  const mountStartTime = React.useRef(typeof performance !== 'undefined' ? performance.now() : 0);
  
  // Add page load tracking at component mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Calculate mount time
      const mountDuration = performance.now() - mountStartTime.current;
      
      // Log mount time instead of timestamp
      console.log(`[PERF] 🔄 ZkLoginProvider mount time: ${Math.round(mountDuration)}ms`);
      
      // Check if we have navigation timing API
      if (performance.timing) {
        const timing = performance.timing;
        const navigationStart = timing.navigationStart;
        const loadEventStart = timing.loadEventStart || Date.now();
        
        console.log(`[PERF] 📊 Page load metrics:`);
        console.log(`[PERF] - Total load time: ${loadEventStart - navigationStart}ms`);
        console.log(`[PERF] - DOM interactive: ${timing.domInteractive - navigationStart}ms`);
        console.log(`[PERF] - DOM content loaded: ${timing.domContentLoadedEventStart - navigationStart}ms`);
      } else if (performance.now) {
        // Fallback for newer browsers without deprecated timing API
        console.log(`[PERF] 📊 Component mounted at ${Math.round(performance.now())}ms after navigation start`);
      }
    }
  }, []);

  const [state, dispatch] = useReducer(loginReducer, initialState);
  const router = useRouter();
  const [suiClient] = useState(new SuiClient({ url: getFullnodeUrl(NETWORK) }));

  // Use pre-generated keypair
  const preGeneratedKeyPair = usePreGeneratedKeys();

  // Load session from storage
  const loadSession = useCallback(async () => {
    // Add debug logging function
    const debugLog = (message: string, data?: any) => {
      if (state.isLoading) {
        console.log(`[LOADING:DEBUG] ${message}`, data || '');
      }
    };

    try {
      performanceTracker.start('loadSession');
      debugLog('Loading session from storage');
      // Try to load from localStorage
      if (typeof window !== 'undefined') {
        performanceTracker.start('localStorage_read');
        const savedSessionStr = localStorage.getItem(SESSION_STORAGE_KEY);
        performanceTracker.end('localStorage_read');
        
        if (savedSessionStr) {
          debugLog('Found saved session', { length: savedSessionStr.length });
          
          performanceTracker.start('session_parse');
          const savedSession = JSON.parse(savedSessionStr);
          performanceTracker.end('session_parse');
          
          const now = Date.now();
          
          // Check if session is still valid
          if (savedSession.expiry && savedSession.expiry > now) {
            // Session is valid, restore state
            debugLog('Session is valid, restoring state');
            performanceTracker.start('dispatch_login_success');
            dispatch({
              type: 'LOGIN_SUCCESS',
              payload: {
                user: savedSession.user,
                zkLoginState: savedSession.zkLoginState,
                expiry: savedSession.expiry
              }
            });
            performanceTracker.end('dispatch_login_success');
            
            // Schedule session expiry check
            const timeUntilExpiry = savedSession.expiry - now;
            setTimeout(() => dispatch({ type: 'SESSION_EXPIRED' }), timeUntilExpiry);
            
            debugLog('Session restored from localStorage');
          } else {
            // Session expired
            debugLog('Session expired', { expiry: savedSession.expiry, now });
            localStorage.removeItem(SESSION_STORAGE_KEY);
            dispatch({ type: 'SESSION_EXPIRED' });
          }
        } else {
          // No session found
          debugLog('No session found in localStorage');
          dispatch({ type: 'LOGOUT' });
        }
      }
      performanceTracker.end('loadSession');
    } catch (err) {
      console.error('Error loading session:', err);
      dispatch({ type: 'LOGIN_FAILURE', payload: 'Failed to load existing session' });
    } finally {
      if (state.isLoading) {
        debugLog('Setting isLoading to false');
        dispatch({ type: 'LOGIN_FAILURE', payload: '' }); // Just to set isLoading to false
      }
      
      // Mark authentication state as fully resolved
      debugLog('Authentication state fully resolved');
      dispatch({ type: 'AUTH_STATE_RESOLVED' });
    }
  }, [state.isLoading]);

  // Check for existing session on mount
  useEffect(() => {
    // Add debug logging
    if (state.isLoading) {
      console.log('[LOADING:DEBUG] Initial authentication check initiated');
    }
    
    // Set a short delay for authentication check
    performanceTracker.start('authentication_check');
    console.log('[PERF] 🔄 Starting authentication check timer (500ms)');
    
    const timer = setTimeout(() => {
      if (state.isLoading) {
        console.log('[LOADING:DEBUG] Authentication check timer fired, calling loadSession()');
      }
      loadSession().then(() => {
        performanceTracker.end('authentication_check');
      });
    }, 50);
    
    return () => clearTimeout(timer);
  }, [loadSession, state.isLoading]);

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
      performanceTracker.start('getCurrentEpoch');
      const { epoch } = await suiClient.getLatestSuiSystemState();
      const epochNum = Number(epoch);
      performanceTracker.end('getCurrentEpoch');
      return epochNum;
    } catch (error) {
      console.error('Error getting current epoch:', error);
      performanceTracker.end('getCurrentEpoch');
      throw error;
    }
  }, [suiClient]);

  // Updated getSalt function for ZkLoginContext.tsx
  const getSalt = useCallback(async (jwt: string): Promise<string> => {
    try {
      performanceTracker.start('getSalt');
      // Extract payload to get user identifier for caching
      const jwtParts = jwt.split('.');
      if (jwtParts.length !== 3) {
        throw new Error('Invalid JWT format');
      }
      
      performanceTracker.start('jwt_payload_decode');
      const payload = JSON.parse(atob(jwtParts[1]));
      performanceTracker.end('jwt_payload_decode');
      
      const userIdentifier = payload.sub;
      
      if (!userIdentifier) {
        throw new Error('JWT missing subject identifier');
      }
      
      // Check if we already have a salt for this user in cache
      const cacheKey = `zklogin_salt_${userIdentifier}`;
      
      performanceTracker.start('salt_cache_check');
      const cachedSalt = localStorage.getItem(cacheKey);
      performanceTracker.end('salt_cache_check');
      
      if (cachedSalt) {
        console.log('Using cached salt for user:', userIdentifier.substring(0, 8) + '...');
        performanceTracker.end('getSalt');
        return cachedSalt;
      }
      
      console.log('No cached salt found, requesting from server for user:', userIdentifier.substring(0, 8) + '...');
      
      // Call our deterministic salt API endpoint
      performanceTracker.start('salt_api_request');
      const response = await fetch('/api/salt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: jwt
        }),
      });
      
      if (!response.ok) {
        // Try to get error details
        const errorText = await response.text();
        console.error('Salt service error:', {
          status: response.status,
          errorText,
        });
        performanceTracker.end('salt_api_request');
        throw new Error(`Salt service failed: ${response.status} ${errorText}`);
      }
      
      const data = await response.json();
      performanceTracker.end('salt_api_request');
      
      const salt = data.salt;
      
      if (!salt) {
        throw new Error('Salt service returned no salt');
      }
      
      console.log('Received salt from server:', salt.substring(0, 8) + '...');
      
      // Cache the salt for future use
      localStorage.setItem(cacheKey, salt);
      
      performanceTracker.end('getSalt');
      return salt;
    } catch (error) {
      console.error('Error getting salt:', error);
      performanceTracker.end('getSalt');
      
      // As a last resort fallback (only if the server is unreachable),
      // generate a random salt and warn the user
      console.warn('CRITICAL: Falling back to random salt generation. User will get a different wallet on next login!');
      const fallbackSalt = generateRandomness();
      
      // Don't cache this random salt as it's just a temporary fallback
      
      return fallbackSalt;
    }
  }, []);

  // Get ZK Proof
  const getZkProof = useCallback(async (params: {
    jwt: string;
    salt: string;
    keyPair: Ed25519Keypair;
    maxEpoch: number;
    randomness: string;
  }): Promise<ZkProofData> => {
    try {
      performanceTracker.start('getZkProof');
      const { jwt, salt, keyPair, maxEpoch, randomness } = params;
      
      // Extract the necessary claims from the JWT
      performanceTracker.start('prepare_zkproof_request');
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
      performanceTracker.end('prepare_zkproof_request');
      
      // Check if this JWT has already been submitted recently
      const jwtHash = jwt.split('.')[2].substring(0, 8); // Use part of signature as identifier
      const cacheKey = `zkproof_ratelimit_${jwtHash}`;
      
      // Check for rate limiting
      if (typeof localStorage !== 'undefined') {
        const lastAttempt = localStorage.getItem(cacheKey);
        if (lastAttempt) {
          const lastAttemptTime = parseInt(lastAttempt, 10);
          const now = Date.now();
          const timeSinceLastAttempt = now - lastAttemptTime;
          
          // If attempt was made in the last 6 seconds, wait a bit
          if (timeSinceLastAttempt < 6000) {
            console.log(`[PERF] ⚠️ Rate limiting protection: waiting ${6 - Math.floor(timeSinceLastAttempt/1000)} seconds before retrying prover service`);
            // Wait for the remaining time before making another request
            await new Promise(resolve => setTimeout(resolve, 6000 - timeSinceLastAttempt));
          }
        }
        
        // Set the current time as the last attempt
        localStorage.setItem(cacheKey, Date.now().toString());
      }
      
      // Make the actual network request to get the proof
      performanceTracker.start('prover_service_request');
      console.log('[PERF] 🔄 Making request to zkLogin prover service...');
      
      let retries = 0;
      const maxRetries = 2;
      
      while (retries <= maxRetries) {
        try {
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
          
          if (response.status === 429) {
            // Too Many Requests - handle rate limiting
            retries++;
            const retryAfter = response.headers.get('Retry-After') || '5';
            const waitTime = parseInt(retryAfter, 10) * 1000;
            console.log(`[PERF] ⚠️ Prover service rate limited. Waiting ${waitTime/1000} seconds before retry ${retries}/${maxRetries}`);
            
            if (retries <= maxRetries) {
              // Wait for the specified time before retrying
              await new Promise(resolve => setTimeout(resolve, waitTime));
              continue;
            }
          }
          
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Prover service error:', {
              status: response.status,
              statusText: response.statusText,
              errorData
            });
            
            performanceTracker.end('prover_service_request');
            throw new Error(`Prover service returned ${response.status}: ${JSON.stringify(errorData)}`);
          }
          
          performanceTracker.start('parse_zkproof_response');
          const proofData = await response.json();
          performanceTracker.end('parse_zkproof_response');
          performanceTracker.end('prover_service_request');
          
          console.log('[PERF] ✅ ZK proof generation complete');
          performanceTracker.end('getZkProof');
          
          // Clear the rate limit timestamp after successful request
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(cacheKey);
          }
          
          return proofData;
        } catch (fetchError) {
          if (retries >= maxRetries) throw fetchError;
          retries++;
          console.log(`[PERF] ⚠️ Prover service request failed. Retry ${retries}/${maxRetries} in 3 seconds.`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
      
      throw new Error('Maximum retries exceeded for prover service');
    } catch (error) {
      console.error('Error getting ZK proof:', error);
      performanceTracker.end('getZkProof');
      throw error;
    }
  }, []);

  // Start the zkLogin process
  const startLogin = useCallback(async (): Promise<string> => {
    // Add debug logging function
    const debugLog = (message: string, data?: any) => {
      if (state.isLoading) {
        console.log(`[LOADING:DEBUG] ${message}`, data || '');
      }
    };

    console.log('Starting zkLogin process...');
    performanceTracker.start('startLogin');
    dispatch({ type: 'LOGIN_START' });
    
    try {
      // Use pre-generated key pair if available, otherwise generate a new one
      let ephemeralKeyPair: Ed25519Keypair;
      
      if (preGeneratedKeyPair) {
        console.log('[PERF] ✅ Using pre-generated keypair for login');
        ephemeralKeyPair = preGeneratedKeyPair;
      } else {
        console.log('[PERF] 🔄 Generating new keypair');
        ephemeralKeyPair = Ed25519Keypair.generate();
      }
      
      // Store the key pair in base64 format
      const publicKey = ephemeralKeyPair.getPublicKey().toBase64();
      const privateKey = ephemeralKeyPair.getSecretKey();
      
      debugLog('Getting current epoch');
      const currentEpoch = await getCurrentEpoch();
      debugLog('Current epoch received', { epoch: currentEpoch });
      
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
        debugLog('Saving intermediate state to localStorage');
        performanceTracker.start('save_intermediate_state');
        localStorage.setItem('zklogin_intermediate_state', JSON.stringify(zkLoginState));
        performanceTracker.end('save_intermediate_state');
      }
      
      // Generate nonce
      debugLog('Generating nonce');
      performanceTracker.start('generate_nonce');
      const nonce = generateNonce(
        ephemeralKeyPair.getPublicKey(), 
        zkLoginState.maxEpoch || 0, 
        zkLoginState.randomness || ''
      );
      performanceTracker.end('generate_nonce');
      debugLog('Nonce generated successfully');
      
      // In startLogin function:
      const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;
      const redirectUri = `${window.location.origin}`;
      const scope = 'openid email profile';
      
      // Add these logs
      console.log('[OAUTH][DEBUG] Starting Google OAuth flow with params:', {
        clientId: googleClientId,
        redirectUri,
        scope,
        currentOrigin: window.location.origin
      });
      
      performanceTracker.end('startLogin');
      return nonce;
    } catch (error) {
      console.error('Login error:', error);
      performanceTracker.end('startLogin');
      dispatch({ type: 'LOGIN_FAILURE', payload: 'Failed to start login process. Please try again.' });
      throw error;
    }
  }, [getCurrentEpoch, preGeneratedKeyPair]);

  // Complete the zkLogin process with JWT
  const completeLogin = useCallback(async (jwt: string): Promise<void> => {
    try {
      console.log('Completing zkLogin process with JWT...', jwt);
      performanceTracker.start('completeLogin');
      
      // Start parallel task - immediately decode JWT to extract subject
      // This allows us to start working with the JWT while loading other state
      const earlyJwtProcessing = async () => {
        console.log('[PERF] 🔄 Starting early JWT processing');
        const jwtParts = jwt.split('.');
        if (jwtParts.length !== 3) throw new Error('Invalid JWT format');
        return JSON.parse(atob(jwtParts[1]));
      };
      
      // Start parallel task - load intermediate state
      const loadIntermediateState = async () => {
        console.log('[PERF] 🔄 Loading intermediate state');
        const intermediateStateStr = localStorage.getItem('zklogin_intermediate_state');
        if (!intermediateStateStr) {
          throw new Error('No intermediate state found. Please try logging in again.');
        }
        return JSON.parse(intermediateStateStr) as ZkLoginState;
      };
      
      // Run both operations in parallel
      const [jwtPayload, intermediateState] = await runParallel(
        earlyJwtProcessing(),
        loadIntermediateState()
      );
      
      // Validate state
      if (!intermediateState.ephemeralKeyPair?.privateKey || 
          !intermediateState.maxEpoch || 
          !intermediateState.randomness) {
        throw new Error('Invalid intermediate state. Please try logging in again.');
      }
      
      // Restore keypair - use pregenerated one if compatible, otherwise restore from storage
      let ephemeralKeyPair: Ed25519Keypair;
      
      if (preGeneratedKeyPair) {
        console.log('[PERF] ✅ Using pre-generated keypair');
        ephemeralKeyPair = preGeneratedKeyPair;
      } else {
        console.log('[PERF] 🔄 Restoring keypair from storage');
        ephemeralKeyPair = Ed25519Keypair.fromSecretKey(
          intermediateState.ephemeralKeyPair.privateKey
        );
      }
      
      // Start getting salt and calculating user address in parallel
      const getSaltTask = async () => {
        console.log('[PERF] 🔄 Starting salt generation');
        return await getSalt(jwt);
      };
      
      // Start these operations in parallel
      const [salt] = await runParallel(getSaltTask());
      
      // Calculate user address while ZK proof is being generated
      const calculateAddressTask = async () => {
        console.log('[PERF] 🔄 Calculating user address');
        return jwtToAddress(jwt, salt);
      };
      
      // Start ZK proof generation immediately
      console.log('[PERF] 🔄 Starting ZK proof generation early');
      const zkProofPromise = getZkProof({
        jwt,
        salt,
        keyPair: ephemeralKeyPair,
        maxEpoch: intermediateState.maxEpoch,
        randomness: intermediateState.randomness,
      });
      
      // While ZK proof is being generated, do other work in parallel
      const [userAddress] = await runParallel(calculateAddressTask());
      
      // Create user object early
      const userData: User = {
        address: userAddress,
        email: jwtPayload.email || '',
        displayName: jwtPayload.name || '',
        profilePicture: jwtPayload.picture || '',
        googleId: jwtPayload.sub || null
      };
      
      // Start saving user to database early while waiting for proof
      const saveUserPromise = saveUserToDatabase(userData);
      
      // Wait for ZK proof and user saving to complete
      const [zkProofs, savedUser] = await runParallel(zkProofPromise, saveUserPromise);
      
      if (savedUser && savedUser.id) {
        // Update userData with the database ID
        userData.id = savedUser.id;
      }
      
      // Update zkLoginState
      const updatedZkLoginState: ZkLoginState = {
        ...intermediateState,
        jwt,
        zkProofs,
      };
      
      // Calculate session expiry
      const expiry = Date.now() + SESSION_DURATION;
      
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


      performanceTracker.end('completeLogin');
    } catch (error) {
      console.error('Login completion error:', error);
      performanceTracker.end('completeLogin');
      // Clean up any partial state
      localStorage.removeItem('zklogin_intermediate_state');
      dispatch({ 
        type: 'LOGIN_FAILURE', 
        payload: error instanceof Error ? error.message : 'Failed to complete login. Please try again.' 
      });
    }
  }, [getSalt, getZkProof, preGeneratedKeyPair]);

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

  // Add a debugging wrapper for saveUserToDatabase function
  const saveUserToDatabase = async (userData: User) => {
    // Add debug logging function
    const debugLog = (message: string, data?: any) => {
      if (state.isLoading) {
        console.log(`[LOADING:DEBUG] ${message}`, data || '');
      }
    };

    try {
      console.log('Saving user to database:', userData);
      debugLog('Making API request to save user');
      performanceTracker.start('db_api_request');
      
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: userData.email,
          walletAddress: userData.address,
          name: userData.displayName,
          googleId: userData.googleId
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to save user to database:', {
          status: response.status,
          error: errorText
        });
        debugLog('User save API request failed', { status: response.status });
        performanceTracker.end('db_api_request');
        throw new Error(`Failed to save user to database: ${response.status} ${errorText}`);
      }

      debugLog('API request successful, parsing response');
      performanceTracker.start('parse_db_response');
      const savedUser = await response.json();
      performanceTracker.end('parse_db_response');
      performanceTracker.end('db_api_request');
      console.log('User saved to database successfully:', savedUser);
      
      // Update the user data with the ID from the database
      userData.id = savedUser.id;
      debugLog('User ID assigned from database', { id: savedUser.id });
      
      return savedUser;
    } catch (error) {
      console.error('Error during user saving:', error);
      debugLog('Exception during user save process', { error: String(error) });
      performanceTracker.end('db_api_request');
      // We don't want to fail login if user saving fails
      // Just log the error and continue
      return null;
    }
  };

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