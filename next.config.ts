import type { NextConfig } from "next";

// Static export: no server features, deployable to Vercel or any static host.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
};

export default nextConfig;
