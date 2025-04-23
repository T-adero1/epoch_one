/**
 * This script manually copies WebAssembly files to the Next.js output directory
 * to avoid issues with WebAssembly modules in Next.js
 */
const fs = require('fs');
const path = require('path');

// Source WebAssembly files
const wasmSources = [
  path.join(__dirname, '../node_modules/@mysten/walrus-wasm/walrus_wasm_bg.wasm'),
  path.join(__dirname, '../node_modules/@mysten/walrus-wasm/web/walrus_wasm_bg.wasm'),
];

// Destination directories
const destDirs = [
  path.join(__dirname, '../.next/server/vendor-chunks'),
  path.join(__dirname, '../.next/static/chunks'),
  path.join(__dirname, '../public/wasm'), // Also copy to public for client-side access
];

// Ensure destination directories exist
destDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    console.log(`Creating directory: ${dir}`);
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Copy WebAssembly files
wasmSources.forEach(sourcePath => {
  if (fs.existsSync(sourcePath)) {
    const fileName = path.basename(sourcePath);
    
    destDirs.forEach(destDir => {
      const destPath = path.join(destDir, fileName);
      try {
        fs.copyFileSync(sourcePath, destPath);
        console.log(`Successfully copied: ${sourcePath} -> ${destPath}`);
      } catch (error) {
        console.error(`Error copying ${sourcePath} to ${destPath}:`, error.message);
      }
    });
  } else {
    console.warn(`Source file not found: ${sourcePath}`);
  }
});

console.log('WebAssembly file copying completed.'); 