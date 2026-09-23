/**
 * Apply R10 reorder migration to local DEV/TEST DB only (127.0.0.1 / localhost).
 * Usage: npx tsx scripts/_r10-apply-local-dev-migration.ts [dev-write|test-write]
 * Used when `prisma migrate deploy` is blocked by an unrelated prior failed migration.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";
import {
  FORBIDDEN_DB_FINGERPRINTS,
  PRODUCTION_DB_FINGERPRINT,
} from "../lib/db/database-target";

const TARGET = "20260923030000_r10_reorder_settings_history";

async function main() {
  const purpose = process.argv[2] === "test-write" ? "test-write" : "dev-write";
  loadProjectEnvFiles();
  const url = resolveScriptDatabaseUrl(purpose);
  if (!url.includes("127.0.0.1") && !url.includes("localhost")) {
    throw new Error("STOP: refusing non-local database");
  }
  if (url.includes(PRODUCTION_DB_FINGERPRINT) || FORBIDDEN_DB_FINGERPRINTS.some((f) => url.includes(f))) {
    throw new Error("STOP: refusing Production/forbidden DB");
  }

  const sqlPath = join(process.cwd(), "prisma", "migrations", TARGET, "migration.sql");
  const sql = readFileSync(sqlPath, "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const cols = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name='products'
         AND column_name IN ('target_stock','reorder_qty_mode')
       ORDER BY column_name`,
    );
    console.log(`PURPOSE=${purpose}`);
    console.log("BEFORE_COLS=" + cols.rows.map((r: { column_name: string }) => r.column_name).join(","));

    const existing = await client.query(
      `SELECT migration_name, finished_at FROM public._prisma_migrations WHERE migration_name = $1`,
      [TARGET],
    );
    if (cols.rows.length >= 2) {
      console.log("ALREADY_APPLIED_SCHEMA");
      if (!existing.rows.length || !existing.rows[0].finished_at) {
        await client.query(
          `INSERT INTO public._prisma_migrations
            (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
           VALUES ($1, $2, NOW(), $3, NULL, NULL, NOW(), 1)`,
          [randomUUID(), checksum, TARGET],
        );
        console.log("HIST_BACKFILLED");
      }
      return;
    }

    await client.query("BEGIN");
    await client.query(sql);
    if (!existing.rows.length || !existing.rows[0].finished_at) {
      await client.query(
        `INSERT INTO public._prisma_migrations
          (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
         VALUES ($1, $2, NOW(), $3, NULL, NULL, NOW(), 1)`,
        [randomUUID(), checksum, TARGET],
      );
    }
    await client.query("COMMIT");

    const after = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name='products'
         AND column_name IN ('target_stock','reorder_qty_mode')
       ORDER BY column_name`,
    );
    console.log("AFTER_COLS=" + after.rows.map((r: { column_name: string }) => r.column_name).join(","));
    console.log("LOCAL_R10_APPLIED");
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
