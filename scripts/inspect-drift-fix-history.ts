import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const TARGET_REF = "ieutdqnlfiiaawctapor";

function loadEnv() {
  for (const fileName of [".env", ".env.local"]) {
    if (!existsSync(fileName)) continue;
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
}

loadEnv();

function redact(value: string) {
  return value
    .replace(/postgresql:\/\/[^@]+@/gi, "postgresql://***@")
    .replace(/[A-Za-z0-9+/=]{24,}/g, "[redacted]");
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes(TARGET_REF)) {
    throw new Error("Refusing inspect: not Production");
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const rows = await prisma.$queryRaw<
      Array<{
        applied_steps_count: number;
        finished_at: Date | null;
        logs: string | null;
        migration_name: string;
        rolled_back_at: Date | null;
        started_at: Date | null;
      }>
    >`SELECT migration_name, started_at, finished_at, rolled_back_at, applied_steps_count, logs
      FROM "_prisma_migrations"
      WHERE migration_name = '20260621_b6_schema_drift_fix'
      ORDER BY started_at ASC`;
    console.log(
      JSON.stringify(
        rows.map((row) => ({
          applied_steps_count: row.applied_steps_count,
          finished_at: row.finished_at,
          logs: row.logs ? redact(row.logs).slice(0, 800) : null,
          rolled_back_at: row.rolled_back_at,
          started_at: row.started_at,
        })),
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(redact(String(error)));
  process.exit(1);
});
