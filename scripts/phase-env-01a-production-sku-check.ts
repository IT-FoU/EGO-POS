import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";

loadProjectEnvFiles();
const url = resolveScriptDatabaseUrl("production-readonly");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url, ssl: { rejectUnauthorized: false } }),
});
const rows = await prisma.product.findMany({
  select: { barcode: true, nameEn: true, sku: true },
  where: {
    OR: [
      { barcode: { in: ["ENVTESTLOCAL", "ENVTESTONLY", "ENVLOCAL001", "ENVLOCAL002", "ENVLOCAL003"] } },
      { sku: { in: ["ENV-TEST-MUTATION", "ENV-TEST-ONLY", "ENV-WATER", "ENV-SOAP", "ENV-RICE"] } },
    ],
  },
});
await prisma.$disconnect();
console.log(JSON.stringify({ localSkusOnProduction: rows }));
if (rows.length) process.exit(1);
