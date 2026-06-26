import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_IGO_DEMO_MODE: process.env.IGO_DEMO_MODE ?? "false",
  },
  reactStrictMode: true,
};

export default nextConfig;
