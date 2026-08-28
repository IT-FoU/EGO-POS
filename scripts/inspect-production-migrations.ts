import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const TARGET_REF = "ieutdqnlfiiaawctapor";
const GOFLO_REF = "luivrsuotrdkgxkhxxbq";
const OLD_PRO_REF = "urqizygucheilflanlea";

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

function classify(url: string) {
  if (!url) return "UNKNOWN";
  if (url.includes("localhost") || url.includes("127.0.0.1")) return "LOCAL";
  if (url.includes(GOFLO_REF) || url.includes(OLD_PRO_REF)) return "UNKNOWN";
  if (url.includes(TARGET_REF)) return "PRODUCTION";
  return "UNKNOWN";
}

function hostKind(url: string) {
  if (url.includes("pooler.supabase.com")) return "supabase-pooler";
  if (url.includes("supabase.co")) return "supabase-direct";
  if (url.includes("localhost") || url.includes("127.0.0.1")) return "localhost";
  return "other";
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const classification = classify(url);
  if (classification !== "PRODUCTION") {
    console.log(JSON.stringify({ classification, STOP: true }, null, 2));
    process.exit(1);
  }

  const repoMigrations = readdirSync(join(process.cwd(), "prisma", "migrations"))
    .filter((name) => /^\d{8}/.test(name) && existsSync(join(process.cwd(), "prisma", "migrations", name, "migration.sql")))
    .sort();

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });

  try {
    const history = await prisma.$queryRaw<
      Array<{
        applied_steps_count: number;
        checksum: string | null;
        finished_at: Date | null;
        id: string;
        logs: string | null;
        migration_name: string;
        rolled_back_at: Date | null;
        started_at: Date | null;
      }>
    >`SELECT id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count
      FROM "_prisma_migrations"
      ORDER BY started_at ASC`;

    const defaults = await prisma.$queryRaw<
      Array<{ column_default: string | null; column_name: string; table_name: string }>
    >`SELECT table_name, column_name, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('approval_rules', 'approvals', 'company_users')
        AND column_name = 'updated_at'
      ORDER BY table_name`;

    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('approval_rules', 'approvals', 'company_users', 'super_admins', 'companies')
      ORDER BY table_name`;

    const [
      companies,
      owners,
      superAdmins,
      products,
      balances,
      sales,
      customers,
      promotions,
    ] = await Promise.all([
      prisma.company.findMany({ select: { name: true, storeCode: true, status: true } }),
      prisma.user.findMany({ select: { status: true, username: true } }),
      prisma.superAdmin.findMany({ select: { email: true, status: true, username: true } }),
      prisma.product.count(),
      prisma.inventoryBalance.count(),
      prisma.sale.count(),
      prisma.customer.count(),
      prisma.promotion.count(),
    ]);

    const rows = history.map((row) => {
      let status = "FINISHED";
      if (row.rolled_back_at) status = "ROLLED_BACK";
      else if (!row.finished_at) status = "UNFINISHED";
      return {
        applied_steps_count: row.applied_steps_count,
        finished: Boolean(row.finished_at),
        inRepo: repoMigrations.includes(row.migration_name),
        logsPresent: Boolean(row.logs),
        migration_name: row.migration_name,
        rolledBack: Boolean(row.rolled_back_at),
        started: Boolean(row.started_at),
        status,
      };
    });

    console.log(
      JSON.stringify(
        {
          business: {
            companies,
            customers,
            owners: owners.map((row) => ({ status: row.status, username: row.username })),
            products,
            promotions,
            sales,
            stock: balances,
            superAdmins: superAdmins.map((row) => ({
              email: row.email,
              status: row.status,
              username: row.username,
            })),
          },
          classification,
          columnDefaults: defaults,
          driftTables: tables.map((row) => row.table_name),
          envFiles: {
            dotenv: existsSync(".env"),
            dotenvLocal: existsSync(".env.local"),
          },
          historyCount: history.length,
          hostKind: hostKind(url),
          repoMigrations,
          rows,
          unfinished: rows.filter((row) => row.status !== "FINISHED"),
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(String(error).replace(/postgresql:\/\/[^@]+@/gi, "postgresql://***@"));
  process.exit(1);
});
