/**
 * Apply R10 reorder settings/history migration to QA DB ONLY.
 * Usage: npx tsx scripts/_r10-apply-qa-migration.ts qa
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import {
  FORBIDDEN_DB_FINGERPRINTS,
  PRODUCTION_DB_FINGERPRINT,
} from "../lib/db/database-target";

const QA = "arkhwskvcnntluoakmef";
const TARGET = "20260923030000_r10_reorder_settings_history";

function assertQaOnly(url: string) {
  if (!url.includes(QA)) throw new Error("STOP: QA DB fingerprint missing");
  if (url.includes(PRODUCTION_DB_FINGERPRINT) || FORBIDDEN_DB_FINGERPRINTS.some((f) => url.includes(f))) {
    throw new Error("STOP: refusing Production/forbidden DB");
  }
}

async function main() {
  if (process.argv[2] !== "qa") {
    throw new Error("Usage: npx tsx scripts/_r10-apply-qa-migration.ts qa");
  }
  const secretsRaw = readFileSync(`${process.env.LOCALAPPDATA}/ego-pos-qa/secrets.json`, "utf8").replace(/^\uFEFF/, "");
  const secrets = JSON.parse(secretsRaw) as Record<string, string>;
  const url = String(secrets.databaseUrl || secrets.DATABASE_URL || "");
  assertQaOnly(url);

  const sqlPath = join(process.cwd(), "prisma", "migrations", TARGET, "migration.sql");
  const sql = readFileSync(sqlPath, "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");

  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const existing = await client.query(
      `SELECT migration_name, finished_at FROM public._prisma_migrations WHERE migration_name = $1`,
      [TARGET],
    );
    if (existing.rows.length && existing.rows[0].finished_at) {
      console.log("HIST=ALREADY_APPLIED");
      const cols = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='products'
          AND column_name IN ('target_stock','reorder_qty_mode')
        ORDER BY column_name`);
      console.log("COLS=" + cols.rows.map((r: { column_name: string }) => r.column_name).join(","));
      return;
    }

    await client.query("BEGIN");
    await client.query(sql);
    await client.query(
      `INSERT INTO public._prisma_migrations
        (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
       VALUES ($1, $2, NOW(), $3, NULL, NULL, NOW(), 1)`,
      [randomUUID(), checksum, TARGET],
    );
    await client.query("COMMIT");
    console.log("APPLIED=" + TARGET);
    console.log("CHECKSUM=" + checksum);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
