export async function register() {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const { assertProductionDemoModeSafe } = await import("@/lib/env/demo-mode-guard");
  assertProductionDemoModeSafe();
}
