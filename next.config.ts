import type { NextConfig } from "next";
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
};

export default nextConfig;
