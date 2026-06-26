// Fail-safe default: demo mode is OFF unless explicitly enabled with
// IGO_DEMO_MODE="true" in non-production environments.
// Production (NODE_ENV=production) always resolves demo mode to false and
// rejects IGO_DEMO_MODE=true at build/startup via lib/env/demo-mode-guard.ts.
import { resolveEffectiveDemoMode } from "@/lib/env/demo-mode-guard";

export function isDemoMode() {
  return resolveEffectiveDemoMode();
}

export function isDemoFallbackEnabled() {
  return isDemoMode() && process.env.IGO_ENABLE_DEMO_FALLBACK === "true";
}
