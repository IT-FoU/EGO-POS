/**
 * Returns true while `next build` is collecting route data.
 * Used to skip database/session work that must not run at build time.
 */
export function isNextProductionBuildPhase() {
  return process.env.NEXT_PHASE === "phase-production-build";
}
