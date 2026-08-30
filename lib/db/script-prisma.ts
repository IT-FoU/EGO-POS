import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "./script-database";

export function createScriptPrismaClient(
  purpose: "dev-write" | "test-write" | "production-readonly" | "production-migration",
) {
  loadProjectEnvFiles();
  const connectionString = resolveScriptDatabaseUrl(purpose);
  const localDatabase = /localhost|127\.0\.0\.1/.test(connectionString);
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      ...(localDatabase ? {} : { ssl: { rejectUnauthorized: false } }),
    }),
  });
}
