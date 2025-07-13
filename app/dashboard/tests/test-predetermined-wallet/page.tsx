'use client';

import { useState, useEffect } from 'react';
import { 
  generatePredeterminedWallet, 
  generateMultiplePredeterminedWallets,
  generatePredeterminedWalletWithCache,
  clearPredeterminedWalletCache,
  getPredeterminedWalletCacheStats,
  PredeterminedWallet 
} from '@/app/utils/predeterminedWallet';
import { generateRandomness, generateNonce, jwtToAddress, genAddressSeed } from '@mysten/sui/zklogin';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

interface OAuthLoginState {
  isLoading: boolean;
  error: string | null;
  jwt: string | null;
  userEmail: string | null;
  predeterminedAddress: string | null;
  oauthGeneratedAddress: string | null;
  addressesMatch: boolean | null;
  ephemeralKeyPair: Ed25519Keypair | null;
  salt: string | null;
  zkLoginState: any;
}

export default function TestPredeterminedWallet() {
  const [email, setEmail] = useState('');
  const [emails, setEmails] = useState('');
  const [result, setResult] = useState<PredeterminedWallet | null>(null);
  const [multipleResults, setMultipleResults] = useState<PredeterminedWallet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheStats, setCacheStats] = useState<{ size: number; keys: string[] }>({ size: 0, keys: [] });
  
  // OAuth testing state
  const [oauthState, setOauthState] = useState<OAuthLoginState>({
    isLoading: false,
    error: null,
    jwt: null,
    userEmail: null,
    predeterminedAddress: null,
    oauthGeneratedAddress: null,
    addressesMatch: null,
    ephemeralKeyPair: null,
    salt: null,
    zkLoginState: null
  });

  const handleSingleTest = async () => {
    if (!email) return;
    
    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      console.log('Testing single email:', email);
      const wallet = await generatePredeterminedWallet(email);
      setResult(wallet);
      console.log('Success:', wallet);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error:', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleCachedTest = async () => {
    if (!email) return;
    
    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      console.log('Testing cached email:', email);
      const wallet = await generatePredeterminedWalletWithCache(email);
      setResult(wallet);
      console.log('Success (cached):', wallet);
      
      // Update cache stats
      setCacheStats(getPredeterminedWalletCacheStats());
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error:', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleMultipleTest = async () => {
    if (!emails) return;
    
    const emailList = emails.split('\n').map(e => e.trim()).filter(e => e);
    if (emailList.length === 0) return;
    
    setLoading(true);
    setError(null);
    setMultipleResults([]);
    
    try {
      console.log('Testing multiple emails:', emailList);
      const wallets = await generateMultiplePredeterminedWallets(emailList);
      setMultipleResults(wallets);
      console.log('Success (multiple):', wallets);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error:', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleClearCache = () => {
    clearPredeterminedWalletCache();
    setCacheStats(getPredeterminedWalletCacheStats());
  };

  const updateCacheStats = () => {
    setCacheStats(getPredeterminedWalletCacheStats());
  };

  // OAuth Login Functions
  const startOAuthLogin = async () => {
    try {
      setOauthState(prev => ({
        ...prev,
        isLoading: true,
        error: null
      }));

      console.log('[EMAIL-OAUTH] Starting OAuth login with email as sub');
      
      // Generate ephemeral keypair
      const ephemeralKeyPair = new Ed25519Keypair();
      const ephemeralPublicKey = ephemeralKeyPair.getPublicKey();
      
      // Get current epoch
      const client = new SuiClient({ url: getFullnodeUrl('testnet') });
      const { epoch } = await client.getLatestSuiSystemState();
      const maxEpoch = Number(epoch) + 10;
      
      // Generate randomness and nonce
      const randomness = generateRandomness();
      const nonce = generateNonce(ephemeralPublicKey, maxEpoch, randomness);

      // Store ephemeral state
      setOauthState(prev => ({
        ...prev,
        ephemeralKeyPair,
        zkLoginState: {
          ephemeralKeyPair: {
            publicKey: ephemeralPublicKey.toSuiAddress(),
            privateKey: ephemeralKeyPair.getSecretKey()
          },
          randomness,
          maxEpoch,
          nonce
        }
      }));

      // Build OAuth URL
      const params = new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
        redirect_uri: `${window.location.origin}/dashboard/tests/test-predetermined-wallet`,
        response_type: 'id_token',
        scope: 'openid email profile',
        nonce: nonce,
        state: 'email-oauth-test'
      });

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
      
      console.log('[EMAIL-OAUTH] Redirecting to:', authUrl);
      window.location.href = authUrl;
      
    } catch (err) {
      console.error('[EMAIL-OAUTH] Error starting OAuth:', err);
      setOauthState(prev => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to start OAuth login'
      }));
    }
  };

  const processOAuthCallback = async (jwt: string) => {
    try {
      console.log('[EMAIL-OAUTH] Processing OAuth callback');
      
      // Decode JWT to get email
      const jwtPayload = JSON.parse(atob(jwt.split('.')[1]));
      const userEmail = jwtPayload.email;
      
      if (!userEmail) {
        throw new Error('No email found in JWT');
      }

      console.log('[EMAIL-OAUTH] User email:', userEmail);
      
      // Generate predetermined address for comparison
      const predeterminedWallet = await generatePredeterminedWallet(userEmail);
      
      // Generate salt using email as sub (instead of Google user ID)
      const saltResponse = await fetch('/api/salt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          token: jwt,
          useEmailAsSub: true  // Flag to use email instead of Google user ID
        })
      });
      
      if (!saltResponse.ok) {
        throw new Error('Failed to get salt');
      }
      
      const { salt } = await saltResponse.json();
      
      // Generate address using email as sub
      const modifiedJwtPayload = {
        ...jwtPayload,
        sub: userEmail  // Use email as sub instead of Google user ID
      };
      
      const addressSeed = genAddressSeed(
        BigInt(salt),
        'sub',
        modifiedJwtPayload.sub,  // This will be the email
        modifiedJwtPayload.aud
      ).toString();
      
      const oauthGeneratedAddress = jwtToAddress(
        jwt.split('.')[0] + '.' + btoa(JSON.stringify(modifiedJwtPayload)) + '.' + jwt.split('.')[2], 
        salt
      );
      
      const addressesMatch = predeterminedWallet.predeterminedAddress === oauthGeneratedAddress;
      
      setOauthState(prev => ({
        ...prev,
        isLoading: false,
        jwt,
        userEmail,
        predeterminedAddress: predeterminedWallet.predeterminedAddress,
        oauthGeneratedAddress,
        addressesMatch,
        salt,
        error: null
      }));
      
      console.log('[EMAIL-OAUTH] Addresses match:', addressesMatch);
      console.log('[EMAIL-OAUTH] Predetermined:', predeterminedWallet.predeterminedAddress);
      console.log('[EMAIL-OAUTH] OAuth Generated:', oauthGeneratedAddress);
      
    } catch (err) {
      console.error('[EMAIL-OAUTH] Error processing callback:', err);
      setOauthState(prev => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to process OAuth callback'
      }));
    }
  };

  // Check for OAuth callback on page load
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.substring(1));
    const idToken = params.get('id_token');
    const state = params.get('state');
    
    if (idToken && state === 'email-oauth-test') {
      console.log('[EMAIL-OAUTH] Found OAuth callback');
      processOAuthCallback(idToken);
      
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const clearOAuthTest = () => {
    setOauthState({
      isLoading: false,
      error: null,
      jwt: null,
      userEmail: null,
      predeterminedAddress: null,
      oauthGeneratedAddress: null,
      addressesMatch: null,
      ephemeralKeyPair: null,
      salt: null,
      zkLoginState: null
    });
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-bold mb-6">Test Predetermined Wallet</h1>
        
        {/* OAuth Address Verification Test */}
        <div className="mb-8 p-6 bg-blue-50 rounded-lg">
          <h2 className="text-lg font-semibold mb-4 text-blue-800">
            🔍 OAuth Address Verification Test
          </h2>
          <p className="text-sm text-blue-600 mb-4">
            This test performs actual Google OAuth login using email as the `sub` field to verify 
            that the predetermined address generation matches the real OAuth flow.
          </p>
          
          <div className="flex gap-4 mb-4">
            <button
              onClick={startOAuthLogin}
              disabled={oauthState.isLoading}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
            >
              {oauthState.isLoading ? 'Processing...' : 'Start OAuth Login Test'}
            </button>
            <button
              onClick={clearOAuthTest}
              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
            >
              Clear Test Results
            </button>
          </div>

          {/* OAuth Error Display */}
          {oauthState.error && (
            <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-md">
              <strong>OAuth Error:</strong> {oauthState.error}
            </div>
          )}

          {/* OAuth Results */}
          {oauthState.userEmail && (
            <div className="bg-white p-4 rounded-md border">
              <h3 className="font-semibold mb-3">OAuth Test Results</h3>
              
              <div className="space-y-2 text-sm">
                <p><strong>Email:</strong> {oauthState.userEmail}</p>
                <p><strong>Predetermined Address:</strong> 
                  <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded ml-2">
                    {oauthState.predeterminedAddress}
                  </span>
                </p>
                <p><strong>OAuth Generated Address:</strong> 
                  <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded ml-2">
                    {oauthState.oauthGeneratedAddress}
                  </span>
                </p>
                <div className="flex items-center gap-2">
                  <strong>Addresses Match:</strong>
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${
                    oauthState.addressesMatch 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {oauthState.addressesMatch ? '✅ YES' : '❌ NO'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Single Email Test */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Single Email Test</h2>
          <div className="flex gap-4 mb-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter email address"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSingleTest}
              disabled={loading || !email}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
            >
              {loading ? 'Testing...' : 'Test Single'}
            </button>
            <button
              onClick={handleCachedTest}
              disabled={loading || !email}
              className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50"
            >
              {loading ? 'Testing...' : 'Test Cached'}
            </button>
          </div>
        </div>

        {/* Multiple Emails Test */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Multiple Emails Test</h2>
          <div className="mb-4">
            <textarea
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              placeholder="Enter email addresses (one per line)"
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleMultipleTest}
            disabled={loading || !emails}
            className="px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 disabled:opacity-50"
          >
            {loading ? 'Testing...' : 'Test Multiple'}
          </button>
        </div>

        {/* Cache Controls */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Cache Controls</h2>
          <div className="flex gap-4">
            <button
              onClick={updateCacheStats}
              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
            >
              Update Cache Stats
            </button>
            <button
              onClick={handleClearCache}
              className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
            >
              Clear Cache
            </button>
          </div>
          <div className="mt-4 p-4 bg-gray-100 rounded-md">
            <p><strong>Cache Size:</strong> {cacheStats.size}</p>
            <p><strong>Cached Keys:</strong> {cacheStats.keys.join(', ')}</p>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-md">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Single Result Display */}
        {result && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-4">Single Result</h2>
            <div className="bg-gray-50 p-4 rounded-md">
              <pre className="text-sm overflow-x-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* Multiple Results Display */}
        {multipleResults.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Multiple Results ({multipleResults.length})</h2>
            <div className="space-y-4">
              {multipleResults.map((wallet, index) => (
                <div key={index} className="bg-gray-50 p-4 rounded-md">
                  <h3 className="font-medium mb-2">{wallet.email}</h3>
                  <p className="text-sm text-gray-600 mb-2">
                    <strong>Address:</strong> {wallet.predeterminedAddress}
                  </p>
                  <p className="text-sm text-gray-600">
                    <strong>Timestamp:</strong> {wallet.timestamp}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
