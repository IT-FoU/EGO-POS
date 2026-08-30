export const PRODUCTION_DB_FINGERPRINT = "ieutdqnlfiiaawctapor";
export const PRODUCTION_HYPERDRIVE_ID = "b8ec6fa6a71f44e5a40a6a108ffe6a85";
export const FORBIDDEN_DB_FINGERPRINTS = ["urqizygucheilflanlea", "luivrsuotrdkgxkhxxbq"] as const;

export const LOCAL_DUMMY_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:5432/igo_pos?schema=public";

export type DatabaseRole =
  | "production"
  | "development"
  | "test"
  | "production-readonly"
  | "production-migration";

export type DatabaseTargetClass = "PRODUCTION" | "FORBIDDEN" | "LOCAL" | "UNKNOWN" | "MISSING";

export function fingerprintDatabaseUrl(url: string | undefined) {
  const value = String(url ?? "");
  if (!value) return "missing";
  if (value.includes(PRODUCTION_DB_FINGERPRINT)) return PRODUCTION_DB_FINGERPRINT;
  for (const fingerprint of FORBIDDEN_DB_FINGERPRINTS) {
    if (value.includes(fingerprint)) return fingerprint;
  }
  if (/localhost|127\.0\.0\.1/.test(value)) return "localhost";
  return "other";
}

export function classifyDatabaseUrl(url: string | undefined): DatabaseTargetClass {
  const value = String(url ?? "");
  if (!value) return "MISSING";
  if (FORBIDDEN_DB_FINGERPRINTS.some((fingerprint) => value.includes(fingerprint))) return "FORBIDDEN";
  if (value.includes(PRODUCTION_DB_FINGERPRINT)) return "PRODUCTION";
  if (/localhost|127\.0\.0\.1/.test(value)) return "LOCAL";
  return "UNKNOWN";
}

export function isProductionDatabaseUrl(url: string | undefined) {
  return classifyDatabaseUrl(url) === "PRODUCTION";
}

export function isBuildPhase() {
  return process.env.NEXT_PHASE === "phase-production-build" || process.env.NEXT_PHASE === "phase-production-compile";
}

export function inferDatabaseRole(): DatabaseRole {
  if (process.env.EGO_APP_ENV === "test" || process.env.NODE_ENV === "test" || process.env.VITEST) {
    return "test";
  }
  if (typeof navigator === "object" && navigator.userAgent === "Cloudflare-Workers") {
    return "production";
  }
  // Local Next.js, scripts, and `next start` never inherit Production from NODE_ENV alone.
  return "development";
}

export function assertSafeDatabaseTarget(input: {
  environment: DatabaseRole;
  databaseUrl: string | undefined;
  operation?: string;
}) {
  const target = classifyDatabaseUrl(input.databaseUrl);
  const operation = input.operation ? ` (${input.operation})` : "";

  if (target === "FORBIDDEN") {
    throw new Error(`REFUSING DATABASE ACCESS: unrecognized or retired database fingerprint${operation}.`);
  }

  if (input.environment === "production") {
    if (target !== "PRODUCTION") {
      throw new Error(`REFUSING PRODUCTION RUNTIME: database fingerprint is not Production${operation}.`);
    }
    return;
  }

  if (input.environment === "production-readonly" || input.environment === "production-migration") {
    if (target !== "PRODUCTION") {
      throw new Error(`REFUSING ${input.environment.toUpperCase()}: database fingerprint is not Production${operation}.`);
    }
    if (input.environment === "production-migration" && process.env.EGO_ALLOW_PRODUCTION_MIGRATION !== "true") {
      throw new Error("REFUSING PRODUCTION MIGRATION: set EGO_ALLOW_PRODUCTION_MIGRATION=true for this command only.");
    }
    return;
  }

  if (target === "PRODUCTION") {
    throw new Error(
      `REFUSING LOCAL DATABASE ACCESS: ${input.environment} environment is targeting the Production database${operation}.`,
    );
  }

  if (target === "MISSING") {
    throw new Error(
      `REFUSING LOCAL DATABASE ACCESS: ${input.environment} database URL is missing. Set DEV_DATABASE_URL or TEST_DATABASE_URL. Development does not fall back to Production.`,
    );
  }
}

export function resolveLocalDatabaseUrl(role: "development" | "test") {
  const url =
    role === "test"
      ? process.env.TEST_DATABASE_URL || process.env.DEV_DATABASE_URL
      : process.env.DEV_DATABASE_URL;
  assertSafeDatabaseTarget({ databaseUrl: url, environment: role, operation: "resolveLocalDatabaseUrl" });
  return String(url);
}
