import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "./script-database";

export function createScriptPrismaClient(
  purpose: "dev-write" | "test-write" | "production-readonly" | "production-migration",
) {
  loadProjectEnvFiles();
  const connectionString = resolveScriptDatabaseUrl(purpose);
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString, ssl: { rejectUnauthorized: false } }),
  });
}
