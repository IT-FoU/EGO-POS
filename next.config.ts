import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import {
  assertProductionDemoModeSafe,
  isProductionNodeEnv,
  readDemoModeEnvFlag,
} from "./lib/env/demo-mode-guard";

assertProductionDemoModeSafe();

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_IGO_DEMO_MODE: isProductionNodeEnv()
      ? "false"
      : readDemoModeEnvFlag()
        ? "true"
        : "false",
  },
  reactStrictMode: true,
  serverExternalPackages: ["@prisma/client", ".prisma/client", "pg", "pg-cloudflare"],
};

export default nextConfig;

initOpenNextCloudflareForDev();
