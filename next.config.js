/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Disable ESLint during builds
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Disable TypeScript checks during builds
    ignoreBuildErrors: true,
  },
  // Out of experimental configs
  outputFileTracingRoot: process.cwd(),
  outputFileTracingExcludes: {
    '*': ['node_modules/**/*']
  },
  experimental: {
    // Keep supported experimental features
    optimizePackageImports: ['@chakra-ui/react'],
  },
  reactStrictMode: true,
  // Suppress hydration warnings in development
  onDemandEntries: {
    // period (in ms) where the server will keep pages in the buffer
    maxInactiveAge: 25 * 1000,
    // number of pages that should be kept simultaneously without being disposed
    pagesBufferLength: 2,
  },
  webpack: (config, { isServer }) => {
    // Add WASM support
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true, 
      layers: true,
      syncWebAssembly: true, // Enable sync WebAssembly as well
    };

    // Fix for .wasm import errors
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      os: false,
      crypto: false,
    };

    // Make WebAssembly files discoverable during build
    // Handle both sync and async wasm
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'javascript/auto',
      use: {
        loader: 'wasm-loader',
      },
    });

    // Prevent WebAssembly from being included in the client bundle
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        '@mysten/walrus-wasm': false,
      };
    }

    // Copy WASM files to output directory
    if (isServer) {
      // For the server build, ensure WASM files are available
      const { join } = require('path');
      const { readdirSync, copyFileSync, mkdirSync, existsSync } = require('fs');
      
      try {
        // Copy WASM files from node_modules
        const wasmPaths = [
          join(process.cwd(), 'node_modules/@mysten/walrus-wasm'),
          join(process.cwd(), 'node_modules/@mysten/walrus-wasm/web'),
        ];
        
        for (const wasmPath of wasmPaths) {
          if (existsSync(wasmPath)) {
            const wasmFiles = readdirSync(wasmPath).filter(file => file.endsWith('.wasm'));
            
            if (wasmFiles.length > 0) {
              const destDir = join(process.cwd(), '.next/server/vendor-chunks');
              
              if (!existsSync(destDir)) {
                mkdirSync(destDir, { recursive: true });
              }
              
              for (const wasmFile of wasmFiles) {
                const sourcePath = join(wasmPath, wasmFile);
                const destPath = join(destDir, wasmFile);
                try {
                  copyFileSync(sourcePath, destPath);
                  console.log(`Copied WASM file: ${sourcePath} to ${destPath}`);
                } catch (e) {
                  console.warn(`Failed to copy WASM file: ${e.message}`);
                }
              }
            }
          }
        }
      } catch (err) {
        console.error('Error copying WASM files:', err);
      }
    }

    return config;
  },
  // Remove the unrecognized key
  reactProductionProfiling: false,
};

module.exports = nextConfig; 