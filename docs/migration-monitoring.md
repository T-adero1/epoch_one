# Monitoring the Vercel Blob to Walrus Migration

This document outlines how to monitor the migration from Vercel Blob to Walrus, interpret the logs, and troubleshoot any issues that might arise during the process.

## Enhanced Logging Overview

We've implemented extensive logging throughout the migration process to provide detailed insights into each step. The log entries follow a consistent format:

```
[timestamp] [level] [component] message | metadata
```

For example:
```
[2024-04-22T16:30:45.123Z] [INFO] [WalrusClient] Uploading JSON data to contracts/abc123.json | {"dataSize":2048,"dataType":"object"}
```

## Migration Script Monitoring

### Running the Migration Script

To start the migration, run:

```bash
npx tsx scripts/migrate-to-walrus.ts
```

The script provides real-time feedback with a progress bar and detailed logs for each operation.

### Log Output Structure

The migration script outputs the following information:

1. **Banner and Environment Check**
   - Script start time
   - Environment variable validation

2. **Per-Collection Migration**
   - For each collection (contracts, invites):
     - Progress bar showing completion percentage
     - Details for each migrated item
     - Timing information for each operation

3. **Summary Statistics**
   - Total items migrated
   - Success/failure counts
   - Total data size
   - Time taken for migration

### Progress Indicators

The script displays a progress bar in the terminal:

```
[█████████████████░░░░░░░░░░░] 60% (15/25)
```

### Error Handling

Failed migrations are logged with detailed error information:

```
❌ Failed to migrate invites/abc123.json: Network error while requesting data
```

At the end of the migration, a summary of failed items is displayed.

## Timing Metrics

The following timing metrics are available in the logs:

| Metric | Description |
|--------|-------------|
| `fetchTimeMs` | Time to fetch data from Vercel Blob |
| `parseTimeMs` | Time to parse JSON from the response |
| `uploadTimeMs` | Time to upload data to Walrus |
| `totalTimeMs` | Total operation time |

## API Route Monitoring

API routes have been enhanced with detailed logging that includes:

1. **Request Lifecycle Logs**
   - Request start/end timestamps
   - Total request processing time
   - Step-by-step operation timing

2. **Operation Timing**
   - Authentication time
   - JSON parsing time
   - Storage operations time (list, fetch, upload)

3. **Detailed Error Information**
   - Stack traces
   - Error categorization
   - Contextualized error messages

Example log from a successful contract creation:

```
[2024-04-22T16:35:12.543Z] POST /api/contracts - Storing contract 1a2b3c in Walrus storage...
[2024-04-22T16:35:12.643Z] POST /api/contracts - Contract 1a2b3c size: 4096 bytes
[2024-04-22T16:35:12.943Z] POST /api/contracts - Contract 1a2b3c created successfully with blob ID: 0x123abc (300.12ms)
[2024-04-22T16:35:12.945Z] POST /api/contracts - Total request time: 402.34ms
```

## Monitoring Tips

1. **Watch for Error Patterns**
   - Network timeouts indicate connectivity issues
   - Authentication errors suggest credential problems
   - Capacity errors point to Walrus capacity limitations

2. **Performance Monitoring**
   - Migration speed should be relatively consistent
   - Large variations in timing may indicate network issues
   - Individual operations taking significantly longer than average warrant investigation

3. **Log Files**
   - Consider redirecting the migration script output to a file:
     ```bash
     npx tsx scripts/migrate-to-walrus.ts > migration.log 2>&1
     ```
   - This allows post-migration analysis of the process

4. **Real-time Analysis**
   - The migration mapping file (`vercel-to-walrus-mapping.json`) is updated after each successful migration
   - You can check this file during migration to see progress

## Troubleshooting Common Issues

### Network Errors

If you see frequent network errors:
- Check your internet connection
- Verify firewall settings
- Ensure Walrus aggregator URL is correct

### Authentication Errors

If authentication fails:
- Verify WALRUS_CAPACITY_ID is set correctly
- Check if capacity object exists on the blockchain
- Ensure WALRUS_PUBLISHER_KEY has permission to use the capacity

### Capacity Issues

If you encounter capacity errors:
- Purchase additional capacity with:
  ```bash
  sui client call --package 0x1... --function buy_capacity --args <increased size>
  ```
- Update the WALRUS_CAPACITY_ID environment variable with the new capacity ID

### Interrupted Migration

If the migration is interrupted:
- The script can be restarted and will resume from where it left off
- Already migrated items will be skipped based on the mapping file

## Post-Migration Verification

After migration completes:

1. Check the summary statistics for any failed migrations
2. Verify a sampling of migrated data by accessing it through your application
3. Monitor API response times to ensure they are within acceptable limits
4. Check Walrus storage usage to ensure it aligns with your expectations

## Dual-Write Period

During the dual-write period:

1. Monitor logs for both storage systems
2. Compare success rates between Vercel Blob and Walrus
3. Track timing differences to identify performance issues
4. Verify data consistency between the two systems 