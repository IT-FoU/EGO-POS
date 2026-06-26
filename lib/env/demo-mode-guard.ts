export const PRODUCTION_DEMO_MODE_ERROR =
  "Unsafe configuration: IGO_DEMO_MODE=true is not allowed in production.";

export function isProductionNodeEnv() {
  return process.env.NODE_ENV === "production";
}

export function readDemoModeEnvFlag() {
  return process.env.IGO_DEMO_MODE === "true";
}

export function isUnsafeProductionDemoMode() {
  return isProductionNodeEnv() && readDemoModeEnvFlag();
}

export function assertProductionDemoModeSafe() {
  if (isUnsafeProductionDemoMode()) {
    throw new Error(PRODUCTION_DEMO_MODE_ERROR);
  }
}

/** Effective demo mode: always false in production, even if env is mis-set. */
export function resolveEffectiveDemoMode() {
  if (isProductionNodeEnv()) {
    return false;
  }

  return readDemoModeEnvFlag();
}

export function getDemoModeHealthStatus() {
  const requestedDemoMode = readDemoModeEnvFlag();
  const effectiveDemoMode = resolveEffectiveDemoMode();
  const production = isProductionNodeEnv();
  const unsafe = isUnsafeProductionDemoMode();

  return {
    demoOnboardingEnabled: effectiveDemoMode,
    effectiveDemoMode,
    ok: !unsafe,
    production,
    requestedDemoMode,
    ...(unsafe ? { error: PRODUCTION_DEMO_MODE_ERROR } : {}),
  };
}
