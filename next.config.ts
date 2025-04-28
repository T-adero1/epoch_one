import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Disable React StrictMode which causes double-mounting in development
  reactStrictMode: false
};

export default nextConfig;