import { existsSync, readFileSync } from "node:fs";
import { assertSafeDatabaseTarget, type DatabaseRole } from "./database-target";

export function loadProjectEnvFiles() {
  for (const fileName of [".env", ".env.development", ".env.test", ".env.local", ".env.development.local", ".env.test.local"]) {
    if (!existsSync(fileName)) continue;
    for (const line of readFileSync(fileName, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const separatorIndex = trimmed.indexOf("=");
      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

export function resolveScriptDatabaseUrl(purpose: "dev-write" | "test-write" | "production-readonly" | "production-migration") {
  const role: DatabaseRole =
    purpose === "dev-write" ? "development" : purpose === "test-write" ? "test" : purpose;
  const url =
    purpose === "production-readonly" || purpose === "production-migration"
      ? process.env.DATABASE_URL
      : process.env.TEST_DATABASE_URL || process.env.DEV_DATABASE_URL;
  assertSafeDatabaseTarget({ databaseUrl: url, environment: role, operation: purpose });
  return String(url);
}
