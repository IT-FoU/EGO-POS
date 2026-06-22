// Fail-safe default: demo mode is OFF unless explicitly enabled with
// IGO_DEMO_MODE="true". This prevents production/runtime DB-backed flows from
// silently falling back to mock data when the env var is missing or misspelled.
// Used only by the write guard (lib/db/write-context.ts) and auth/admin demo
// helpers; runtime read services read live PostgreSQL via Prisma unconditionally.
export function isDemoMode() {
  return process.env.IGO_DEMO_MODE === "true";
}
