import {
  LOCAL_DUMMY_DATABASE_URL,
  assertSafeDatabaseTarget,
  inferDatabaseRole,
  isBuildPhase,
  resolveLocalDatabaseUrl,
} from "./database-target";

export function getDatabaseUrl() {
  if (isBuildPhase()) {
    return process.env.DEV_DATABASE_URL || LOCAL_DUMMY_DATABASE_URL;
  }

  const role = inferDatabaseRole();
  if (role === "development" || role === "test") {
    return resolveLocalDatabaseUrl(role);
  }

  if (role === "production-readonly" || role === "production-migration") {
    const url = process.env.DATABASE_URL;
    assertSafeDatabaseTarget({ databaseUrl: url, environment: role, operation: "getDatabaseUrl" });
    return String(url);
  }

  const url = process.env.DATABASE_URL;
  if (typeof navigator === "object" && navigator.userAgent === "Cloudflare-Workers") {
    assertSafeDatabaseTarget({ databaseUrl: url, environment: "production", operation: "getDatabaseUrl" });
    return String(url);
  }

  // Local `next start` / Node production without Worker Hyperdrive must not inherit Production DATABASE_URL.
  return resolveLocalDatabaseUrl("development");
}

export const databaseUrl = getDatabaseUrl;
