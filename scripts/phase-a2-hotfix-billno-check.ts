import { existsSync, readFileSync } from "node:fs";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";

loadProjectEnvFiles();
const SCRIPT_DATABASE_URL = resolveScriptDatabaseUrl("test-write");

for (const fileName of [".env", ".env.local"]) {
  if (!existsSync(fileName)) continue;
  for (const line of readFileSync(fileName, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

const { getNextPosSaleNo } = await import("../features/pos/prisma-repository");
const { PrismaClient } = await import("@prisma/client");
const { PrismaPg } = await import("@prisma/adapter-pg");
const companyId = "gobox-company";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: SCRIPT_DATABASE_URL }) });
const settings = await prisma.companySetting.findUnique({ where: { companyId } });
const prefix = settings?.receiptPrefix ?? "INV";
const nextSaleNo = await getNextPosSaleNo(companyId, prefix);
const collision = await prisma.sale.findFirst({ where: { companyId, saleNo: nextSaleNo } });
console.log(JSON.stringify({ collision: Boolean(collision), nextSaleNo, prefix }, null, 2));
await prisma.$disconnect();
