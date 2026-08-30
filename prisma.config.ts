import { existsSync, readFileSync } from "node:fs";
import { defineConfig } from "prisma/config";
import {
  LOCAL_DUMMY_DATABASE_URL,
  assertSafeDatabaseTarget,
  classifyDatabaseUrl,
} from "./lib/db/database-target";

function loadEnvFile(fileName: string) {
  if (!existsSync(fileName)) return;
  for (const line of readFileSync(fileName, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
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

loadEnvFile(".env");
loadEnvFile(".env.development");
loadEnvFile(".env.local");

const isGenerate = process.argv.some((arg) => arg === "generate");
const allowProductionMigration = process.env.EGO_ALLOW_PRODUCTION_MIGRATION === "true";
const preferred = process.env.DEV_DATABASE_URL || process.env.TEST_DATABASE_URL || "";
const productionUrl = process.env.DATABASE_URL || "";

function resolvePrismaUrl() {
  if (isGenerate) {
    return preferred || LOCAL_DUMMY_DATABASE_URL;
  }

  if (allowProductionMigration) {
    assertSafeDatabaseTarget({
      databaseUrl: productionUrl,
      environment: "production-migration",
      operation: "prisma-migrate",
    });
    return productionUrl;
  }

  const url = preferred || productionUrl;
  if (classifyDatabaseUrl(url) === "PRODUCTION") {
    throw new Error(
      "REFUSING PRODUCTION MIGRATION: local Prisma commands do not use Production. Set DEV_DATABASE_URL, or EGO_ALLOW_PRODUCTION_MIGRATION=true for an explicit Production migrate.",
    );
  }
  assertSafeDatabaseTarget({
    databaseUrl: url,
    environment: "development",
    operation: "prisma-config",
  });
  return url;
}

const url = resolvePrismaUrl();
const target = classifyDatabaseUrl(url);
console.info(`prisma-config-target=${target === "LOCAL" ? "DEVELOPMENT" : target}`);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url,
  },
});
