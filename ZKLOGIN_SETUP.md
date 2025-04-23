# Sui zkLogin Setup Guide

This guide provides instructions for setting up Sui zkLogin with Google OAuth in your EpochOne application.

## Prerequisites

- Node.js 18+ and npm/yarn
- A Google Developer account to create OAuth credentials

## Installation

The following dependency is needed for Sui zkLogin:

```json
"@mysten/sui": "^1.28.0"
```

Install it by running:

```bash
npm install
# or
yarn
```

## Google OAuth Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to "APIs & Services" > "Credentials"
4. Click "Create Credentials" > "OAuth client ID"
5. Select "Web application" as the application type
6. Add your application name
7. Add authorized JavaScript origins:
   - For development: `http://localhost:3000`
   - For production: Your production URL
8. Add authorized redirect URIs:
   - For development: `http://localhost:3000/auth/callback`
   - For production: `https://your-domain.com/auth/callback`
9. Click "Create" to generate your credentials
10. Note the "Client ID" - you'll need it for the next step

## Environment Setup

Create a `.env.local` file in the root of your project with the following content:

```
# Google OAuth Client ID for zkLogin
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id-here

# Sui network (testnet, devnet, or mainnet)
NEXT_PUBLIC_SUI_NETWORK=testnet
```

Replace `your-google-client-id-here` with the Client ID you obtained from Google Cloud Console.

## Key Components

The zkLogin implementation includes:

1. **ZkLoginContext** (`src/contexts/ZkLoginContext.tsx`): Manages authentication state and zkLogin flow
2. **zkLogin Utils** (`src/utils/zkLogin.ts`): Utility functions for working with zkLogin
3. **Sui Client** (`src/utils/suiClient.ts`): Functions for interacting with the Sui blockchain
4. **Auth Callback** (`src/app/auth/callback/page.tsx`): Handles OAuth redirects
5. **Wallet Info** (`src/components/SuiWalletInfo.tsx`): Displays user's Sui address and balance

## Import Structure

With the latest Sui SDK, we use the following import pattern:

```typescript
// For zkLogin functionality
import { jwtToAddress, generateRandomness } from '@mysten/sui/zklogin';

// For Sui client
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

// For keypairs
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

// For transaction handling
import { TransactionBlock } from '@mysten/sui/transactions';
```

## How It Works

1. When a user clicks "Sign in with Gmail", we generate:
   - An ephemeral keypair for this session
   - A nonce for the OAuth request
   
2. The user is redirected to Google's OAuth page and grants permission

3. After successful authentication, Google redirects back with a JWT (JSON Web Token)

4. We use this JWT along with a user salt to:
   - Generate a deterministic Sui address
   - Create zero-knowledge proofs for transaction signing

5. The user can now sign transactions using their Google identity without exposing their OAuth credentials on-chain

## Testing

The zkLogin flow can be tested in development:

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Navigate to http://localhost:3000/login

3. Click "Sign in with Gmail (zkLogin)" 

4. After successful authentication, you'll be redirected to the dashboard with your Sui wallet information

## Security Considerations

- The JWT and ephemeral keypair are stored in localStorage. For production, consider more secure storage options.
- The user salt is currently managed in localStorage. For better security, consider implementing server-side salt management.
- This implementation uses the Mysten Labs proving service. For highly sensitive applications, consider running your own proving service.

## Additional Resources

- [Sui zkLogin Documentation](https://docs.sui.io/build/zk_login)
- [Sui zkLogin Best Practices](https://blog.sui.io/zklogin-best-practices-considerations/)
- [Google OAuth Documentation](https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow) 