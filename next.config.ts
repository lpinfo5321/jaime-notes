import type { NextConfig } from "next";

// Generate a unique build ID based on current timestamp — changes on every Vercel deploy
const BUILD_ID = new Date().toISOString();

const nextConfig: NextConfig = {
  generateBuildId: async () => BUILD_ID,
  env: {
    NEXT_PUBLIC_BUILD_ID: BUILD_ID,
  },
};

export default nextConfig;
