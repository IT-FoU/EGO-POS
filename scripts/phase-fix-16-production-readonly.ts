import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";

loadProjectEnvFiles();
const url = resolveScriptDatabaseUrl("production-readonly");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url, ssl: { rejectUnauthorized: false } }),
});
const cashIn = await prisma.cashTransaction.count({ where: { transactionType: "cash_in" } });
const cashOut = await prisma.cashTransaction.count({ where: { transactionType: "cash_out" } });
const pepsi = await prisma.inventoryBalance.findFirst({
  where: { product: { barcode: "8859313502907" } },
});
await prisma.$disconnect();
console.log(JSON.stringify({ cashIn, cashOut, pepsiQty: Number(pepsi?.quantity ?? NaN), writes: 0 }));
