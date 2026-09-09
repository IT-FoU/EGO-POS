import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import { getDatabaseUrl } from "./lib/db/database-url";
import { inferDatabaseRole, isBuildPhase } from "./lib/db/database-target";
import {
  assertProductionDemoModeSafe,
  isProductionNodeEnv,
  readDemoModeEnvFlag,
} from "./lib/env/demo-mode-guard";

assertProductionDemoModeSafe();
if (process.env.NODE_ENV !== "production" && !isBuildPhase() && inferDatabaseRole() !== "production") {
  getDatabaseUrl();
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_IGO_DEMO_MODE: isProductionNodeEnv()
      ? "false"
      : readDemoModeEnvFlag()
        ? "true"
        : "false",
  },
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  serverExternalPackages: ["@prisma/client", ".prisma/client", "pg", "pg-cloudflare", "@supabase/supabase-js"],
};

export default nextConfig;

initOpenNextCloudflareForDev();
