# Migrating from Vercel Blob to Walrus

This document outlines the steps to migrate our storage solution from Vercel Blob to Walrus, a "blob-on-Sui" decentralized storage layer.

## Overview

Walrus is a decentralized storage system built on the Sui blockchain. It provides a simple API for storing and retrieving data, with a similar interface to Vercel Blob but with the added benefits of decentralization and blockchain-based security.

## Migration Plan

The migration involves the following steps:

1. Set up Walrus capacity (one-time)
2. Configure environment variables
3. Run the migration script to transfer all existing data
4. Switch to using the Walrus client in the codebase
5. Remove Vercel Blob dependencies

## 1. Setting up Walrus Capacity

Before you can use Walrus, you need to purchase storage capacity on the Sui blockchain:

```bash
sui client call --package 0x1... --function buy_capacity --args 100000000
```

This purchases approximately 10MB of capacity at 1 SUI/GB. Adjust the amount based on your storage needs.

## 2. Environment Variables

Add the following environment variables to your project:

```bash
# Walrus
WALRUS_PUBLISHER_KEY=<hex private key that owns capacity>
WALRUS_AGGREGATOR=https://agg.mainnet.wal.xyz   # default CDN
WALRUS_CAPACITY_ID=<object id you bought once>
```

## 3. Migration Script

Run the migration script to transfer all data from Vercel Blob to Walrus:

```bash
# Install required dependencies
npm install @mysten/walrus @mysten/sui

# Run the migration script
npx tsx scripts/migrate-to-walrus.ts
```

The script will:

- List all blobs in Vercel Blob with the prefixes `contracts/` and `invites/`
- Download each blob and upload it to Walrus
- Create a mapping file of old URLs to new blob IDs

## 4. Code Changes

We've updated the following files to use Walrus instead of Vercel Blob:

- `src/utils/walrusClient.ts` - New utility file with Walrus client functions
- `src/app/api/contracts/route.ts` - Updated to use Walrus for storing and retrieving contracts
- `src/app/api/invite/create/route.ts` - Updated to use Walrus for storing invitations

### API Changes

The main API changes are:

- `list()` → `walrusClient.list({ prefix })`
- `put()` → `walrusClient.uploadJSON({ capacityId, path, data })`
- `fetch(blob.url)` → `walrusClient.fetchJSON(blobId)`

## 5. Testing

After making these changes, test the following functionality:

- Contract creation
- Contract listing
- Invitation creation
- Invitation retrieval

Verify that both new data and migrated data are accessible.

## 6. Dual-Write Period (Optional)

For additional safety, you may want to implement a dual-write approach for a period of time:

- Write to both Vercel Blob and Walrus
- Read preferably from Walrus, falling back to Vercel Blob if needed
- Monitor for any issues

## 7. Complete Migration

Once you're confident that everything is working correctly:

1. Remove the Vercel Blob dependency from your project
2. Remove the `BLOB_READ_WRITE_TOKEN` environment variable
3. Clean up any dual-write code

## Benefits of Walrus

- Decentralized storage with no single point of failure
- One-time capacity purchase instead of ongoing billing
- Documents remain on IPFS (unchanged) while metadata is stored on Walrus
- Minimal code changes required 