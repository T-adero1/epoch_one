/**
 * Configuration file for the SEAL backend
 */

require('dotenv').config();

// Network configuration
const NETWORK = 'testnet';
const RPC_URL = 'https://fullnode.testnet.sui.io:443';

// Package IDs
const SEAL_PACKAGE_ID = process.env.SEAL_PACKAGE_ID || '0xb5c84864a69cb0b495caf548fa2bf0d23f6b69b131fa987d6f896d069de64429';
const ALLOWLIST_PACKAGE_ID = process.env.ALLOWLIST_PACKAGE_ID || '0xb5c84864a69cb0b495caf548fa2bf0d23f6b69b131fa987d6f896d069de64429';

// Walrus configuration for blob storage
const WALRUS_ENDPOINTS = [
  'https://suiftly-testnet-agg.mhax.io/',
  'https://suiftly-testnet-pub.mhax.io/',
  'https://walrus-testnet-1.testnet.mystenlabs.com/v1',
  'https://walrus-testnet-2.testnet.mystenlabs.com/v1',
  
];
const WALRUS_EPOCHS_TO_STORE = 2; // How many epochs to store documents

// User access configuration
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY; // Admin who creates document groups and manages access
const USER_PRIVATE_KEY = process.env.USER_PRIVATE_KEY;   // User who will access documents

// Other configuration
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB max file size
const TEMP_DIR = process.env.VERCEL ? '/tmp' : './temp';
const DEFAULT_TTL_MINUTES = 15; // Session key valid for 10 minutes

module.exports = {
  NETWORK,
  RPC_URL,
  SEAL_PACKAGE_ID,
  ALLOWLIST_PACKAGE_ID,
  WALRUS_ENDPOINTS,
  WALRUS_EPOCHS_TO_STORE,
  ADMIN_PRIVATE_KEY,
  USER_PRIVATE_KEY,
  MAX_FILE_SIZE,
  TEMP_DIR,
  DEFAULT_TTL_MINUTES
};