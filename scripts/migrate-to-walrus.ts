/**
 * Script to migrate data from Vercel Blob to Walrus
 * 
 * This script will:
 * 1. List all blobs from Vercel Blob storage
 * 2. Download each blob
 * 3. Upload the data to Walrus
 * 4. Create a mapping of old URLs to new blob IDs for reference
 * 
 * Usage:
 * npx tsx scripts/migrate-to-walrus.ts
 */

import { list } from '@vercel/blob';
import { uploadJSON, migrateFromVercelBlob } from '../src/utils/walrusClient';
import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';

// Progress bar character settings
const PROGRESS_BAR_LENGTH = 30;
const PROGRESS_BAR_CHAR = '█';
const PROGRESS_BAR_EMPTY = '░';

// Tracking states 
interface MigrationStats {
  total: number;
  processed: number;
  successful: number;
  failed: number;
  totalSizeBytes: number;
  startTime: number;
  endTime?: number;
}

// Initialize mapping of old URLs to new blob IDs
const mapping: Record<string, string> = {};

// Load existing mapping if available
function loadExistingMapping(): Record<string, string> {
  const mappingPath = path.join(process.cwd(), 'vercel-to-walrus-mapping.json');
  if (fs.existsSync(mappingPath)) {
    try {
      console.log(`📂 Found existing mapping file, loading from ${mappingPath}`);
      const content = fs.readFileSync(mappingPath, 'utf8');
      const existingMapping = JSON.parse(content);
      console.log(`📊 Loaded ${Object.keys(existingMapping).length} mappings from file`);
      return existingMapping;
    } catch (error) {
      console.error(`❌ Error loading existing mapping file:`, error);
      return {};
    }
  }
  console.log(`📝 No existing mapping file found, starting fresh`);
  return {};
}

// Pretty print timer
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / (1000 * 60)) % 60;
  const hours = Math.floor(ms / (1000 * 60 * 60));
  
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);
  
  return parts.join(' ');
}

// Format bytes to human-readable format
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Draw a progress bar
function drawProgressBar(current: number, total: number): string {
  const percentage = Math.min(100, Math.round((current / total) * 100));
  const filledLength = Math.round((percentage / 100) * PROGRESS_BAR_LENGTH);
  const filled = PROGRESS_BAR_CHAR.repeat(filledLength);
  const empty = PROGRESS_BAR_EMPTY.repeat(PROGRESS_BAR_LENGTH - filledLength);
  
  return `[${filled}${empty}] ${percentage}% (${current}/${total})`;
}

// Print migration summary
function printMigrationSummary(stats: MigrationStats, prefix: string): void {
  const elapsed = stats.endTime ? stats.endTime - stats.startTime : performance.now() - stats.startTime;
  const avgTimePerItem = stats.processed > 0 ? elapsed / stats.processed : 0;
  
  console.log(`\n📊 SUMMARY: Migration of ${prefix}`);
  console.log(`┌─────────────────────────────────────────────────`);
  console.log(`│ Total items:      ${stats.total}`);
  console.log(`│ Processed:        ${stats.processed} (${Math.round((stats.processed / stats.total) * 100)}%)`);
  console.log(`│ Successful:       ${stats.successful} (${Math.round((stats.successful / stats.processed) * 100)}%)`);
  console.log(`│ Failed:           ${stats.failed} (${Math.round((stats.failed / stats.processed) * 100)}%)`);
  console.log(`│ Total size:       ${formatBytes(stats.totalSizeBytes)}`);
  console.log(`│ Time taken:       ${formatDuration(elapsed)}`);
  console.log(`│ Avg time per item: ${formatDuration(avgTimePerItem)}`);
  console.log(`└─────────────────────────────────────────────────`);
}

async function migrateBlobs(prefix: string): Promise<MigrationStats> {
  console.log(`\n🚀 Starting migration of blobs with prefix: ${prefix}`);
  const stats: MigrationStats = {
    total: 0,
    processed: 0,
    successful: 0,
    failed: 0,
    totalSizeBytes: 0,
    startTime: performance.now()
  };
  
  const failedItems: Array<{pathname: string, error: string}> = [];
  
  try {
    // List all blobs from Vercel Blob
    console.log(`📋 Listing blobs from Vercel with prefix "${prefix}"...`);
    const listStartTime = performance.now();
    const { blobs } = await list({ prefix });
    const listElapsed = performance.now() - listStartTime;
    
    stats.total = blobs.length;
    console.log(`🔍 Found ${blobs.length} blobs to migrate (listing took ${formatDuration(listElapsed)})`);
    
    if (blobs.length === 0) {
      console.log(`ℹ️ No blobs found with prefix "${prefix}", skipping`);
      stats.endTime = performance.now();
      return stats;
    }
    
    // Progress tracking variables
    let lastProgressUpdate = 0;
    const progressUpdateInterval = 500; // ms
    
    // Migrate each blob
    for (const [index, blob] of blobs.entries()) {
      const currentCount = index + 1;
      const now = performance.now();
      const shouldUpdateProgress = now - lastProgressUpdate > progressUpdateInterval;
      
      if (shouldUpdateProgress) {
        process.stdout.write(`\r${drawProgressBar(currentCount, blobs.length)} `);
        lastProgressUpdate = now;
      }
      
      try {
        // Check if we already migrated this blob
        if (mapping[blob.url]) {
          console.log(`\n♻️ Blob ${currentCount}/${blobs.length}: ${blob.pathname} was already migrated, skipping`);
          stats.processed++;
          stats.successful++;
          continue;
        }
        
        // Migrate the blob
        console.log(`\n⏳ Migrating blob ${currentCount}/${blobs.length}: ${blob.pathname}`);
        const startTime = performance.now();
        const blobId = await migrateFromVercelBlob(blob.url, blob.pathname);
        const elapsed = performance.now() - startTime;
        
        // Get blob size (fetch the URL to get headers)
        let blobSize = 0;
        try {
          const response = await fetch(blob.url, { method: 'HEAD' });
          const contentLength = response.headers.get('content-length');
          if (contentLength) {
            blobSize = parseInt(contentLength, 10);
            stats.totalSizeBytes += blobSize;
          }
        } catch (sizeError) {
          console.warn(`⚠️ Could not determine size for ${blob.pathname}: ${sizeError.message}`);
        }
        
        // Add to mapping
        mapping[blob.url] = blobId;
        stats.processed++;
        stats.successful++;
        
        console.log(`✅ Successfully migrated ${blob.pathname} (${formatBytes(blobSize)}, took ${formatDuration(elapsed)})`);
        console.log(`   Vercel URL: ${blob.url}`);
        console.log(`   Walrus ID:  ${blobId}`);
        
        // Save mapping after each successful migration
        fs.writeFileSync(
          path.join(process.cwd(), 'vercel-to-walrus-mapping.json'),
          JSON.stringify(mapping, null, 2)
        );
      } catch (error) {
        stats.processed++;
        stats.failed++;
        failedItems.push({ pathname: blob.pathname, error: error.message });
        
        console.error(`❌ Failed to migrate ${blob.pathname}:`, error);
      }
    }
    
    // Ensure progress bar is complete
    process.stdout.write(`\r${drawProgressBar(stats.processed, stats.total)} `);
    console.log('\n');
    
    // Log failed items if any
    if (failedItems.length > 0) {
      console.log(`\n⚠️ ${failedItems.length} items failed to migrate:`);
      for (const [i, item] of failedItems.entries()) {
        console.log(`  ${i+1}. ${item.pathname}: ${item.error}`);
      }
    }
    
    stats.endTime = performance.now();
    printMigrationSummary(stats, prefix);
    return stats;
  } catch (error) {
    console.error(`❌ Error during migration of ${prefix}:`, error);
    stats.endTime = performance.now();
    return stats;
  }
}

async function main() {
  // Show banner
  console.log('\n============================================');
  console.log('📦 VERCEL BLOB TO WALRUS MIGRATION UTILITY 📦');
  console.log('============================================\n');
  
  console.log(`🕒 Migration started at: ${new Date().toISOString()}`);
  const globalStartTime = performance.now();
  
  // Check for required environment variables
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('❌ ERROR: BLOB_READ_WRITE_TOKEN is required for reading from Vercel Blob');
    process.exit(1);
  }
  
  if (!process.env.WALRUS_CAPACITY_ID) {
    console.error('❌ ERROR: WALRUS_CAPACITY_ID is required for writing to Walrus');
    process.exit(1);
  }
  
  if (!process.env.WALRUS_AGGREGATOR) {
    console.warn('⚠️ WARNING: WALRUS_AGGREGATOR is not set, using default');
  }
  
  console.log('🔐 Environment variables check passed');
  
  // Load existing mapping
  Object.assign(mapping, loadExistingMapping());
  
  try {
    // Migrate contracts
    console.log('\n📜 CONTRACTS MIGRATION');
    const contractsStats = await migrateBlobs('contracts/');
    
    // Migrate invites
    console.log('\n📨 INVITES MIGRATION');
    const invitesStats = await migrateBlobs('invites/');
    
    // Global summary
    const globalEndTime = performance.now();
    const totalElapsed = globalEndTime - globalStartTime;
    
    console.log('\n===========================================');
    console.log('📊 GLOBAL MIGRATION SUMMARY');
    console.log('===========================================');
    console.log(`┌─────────────────────────────────────────────────`);
    console.log(`│ Contracts migrated:  ${contractsStats.successful} / ${contractsStats.total}`);
    console.log(`│ Invites migrated:    ${invitesStats.successful} / ${invitesStats.total}`);
    console.log(`│ Total migrated:      ${contractsStats.successful + invitesStats.successful}`);
    console.log(`│ Failed migrations:   ${contractsStats.failed + invitesStats.failed}`);
    console.log(`│ Total data size:     ${formatBytes(contractsStats.totalSizeBytes + invitesStats.totalSizeBytes)}`);
    console.log(`│ Total time taken:    ${formatDuration(totalElapsed)}`);
    console.log(`└─────────────────────────────────────────────────`);
    console.log('\n✅ Migration completed!');
    console.log(`📝 Mapping saved to: vercel-to-walrus-mapping.json`);
    console.log(`🕒 Migration finished at: ${new Date().toISOString()}`);
    console.log('\n============================================\n');
  } catch (error) {
    console.error('\n❌ FATAL ERROR during migration:', error);
    process.exit(1);
  }
}

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', () => {
  console.log('\n\n🛑 Migration interrupted by user');
  console.log('📝 Saving current mapping progress...');
  
  try {
    fs.writeFileSync(
      path.join(process.cwd(), 'vercel-to-walrus-mapping.json'),
      JSON.stringify(mapping, null, 2)
    );
    console.log('✅ Mapping saved successfully');
  } catch (error) {
    console.error('❌ Error saving mapping:', error);
  }
  
  console.log('👋 Exiting...');
  process.exit(0);
});

main().catch(error => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
}); 