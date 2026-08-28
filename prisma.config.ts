import { existsSync, readFileSync } from "node:fs";
import { defineConfig } from "prisma/config";
import { getDatabaseUrl } from "./lib/db/database-url";

function loadEnvFile(fileName: string) {
  if (!existsSync(fileName)) {
    return;
  }

  for (const line of readFileSync(fileName, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

const url = getDatabaseUrl();
const target = url.includes("ieutdqnlfiiaawctapor")
  ? "PRODUCTION"
  : url.includes("localhost") || url.includes("127.0.0.1")
    ? "LOCAL"
    : "UNKNOWN";

if (target === "UNKNOWN") {
  throw new Error("Prisma config refused an unrecognized database target");
}

console.info(`prisma-config-target=${target}`);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url,
  },
});
