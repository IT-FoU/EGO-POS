import { isDemoMode } from "@/lib/demo-mode";
import { isProductionNodeEnv } from "@/lib/env/demo-mode-guard";

/**
 * Demo-only localStorage onboarding (template picker, business setup draft).
 * Production store creation uses EGO Admin provisioning + DB company.businessTemplateKey.
 */
export function isDemoOnboardingEnabled(): boolean {
  if (isProductionNodeEnv()) {
    return false;
  }

  if (typeof window === "undefined") {
    return isDemoMode();
  }

  return process.env.NEXT_PUBLIC_IGO_DEMO_MODE === "true";
}
