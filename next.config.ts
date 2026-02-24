import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Set the workspace root explicitly to suppress the lockfile conflict
    // warning caused by a pnpm-lock.yaml present in the home directory.
    root: __dirname,
  },
};

export default nextConfig;
