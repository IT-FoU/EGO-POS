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
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadEnv();

const url = process.env.DATABASE_URL ?? "";
if (!url.includes(TARGET_REF)) {
  throw new Error("Refusing non-Production database");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url, ssl: { rejectUnauthorized: false } }),
});

const company = await prisma.company.findFirst({ where: { storeCode: "0001" } });
if (!company) throw new Error("GO BOX company missing");
const warehouse = await prisma.warehouse.findFirst({
  orderBy: { createdAt: "asc" },
  where: { companyId: company.id },
});
if (!warehouse) throw new Error("warehouse missing");

const pepsi = await prisma.inventoryBalance.findFirst({
  where: { companyId: company.id, product: { barcode: "8859313502907" }, warehouseId: warehouse.id },
});
const sale = await prisma.sale.findFirst({ where: { companyId: company.id, saleNo: "00010001" } });
const saleCount = await prisma.sale.count({ where: { companyId: company.id } });
const heldCount = await prisma.holdBill.count({ where: { companyId: company.id, status: "held" } }).catch(() => -1);
const refundCount = await prisma.refund.count({ where: { companyId: company.id } });
const voidCount = await prisma.sale.count({ where: { companyId: company.id, saleStatus: "cancelled" } });
const exchangedCount = await prisma.sale.count({ where: { companyId: company.id, saleStatus: "exchanged" } });
const movementCount = await prisma.stockMovement.count({ where: { companyId: company.id } }).catch(() => -1);

console.log(`PEPSI stock: ${Number(pepsi?.quantity)} (expect 23)`);
console.log(`Sale 00010001: ${sale?.saleStatus} (expect completed)`);
console.log(`Total sales: ${saleCount} (expect 1)`);
console.log(`Held bills (held): ${heldCount}`);
console.log(`Refunds: ${refundCount} (expect 0)`);
console.log(`Voided/cancelled sales: ${voidCount} (expect 0)`);
console.log(`Exchanged sales: ${exchangedCount} (expect 0)`);
console.log(`Stock movements: ${movementCount}`);

const ok =
  Number(pepsi?.quantity) === 23 &&
  sale?.saleStatus === "completed" &&
  saleCount === 1 &&
  refundCount === 0 &&
  voidCount === 0 &&
  exchangedCount === 0 &&
  (heldCount === 0 || heldCount === -1);
console.log(ok ? "PRODUCTION SAFETY: PASS" : "PRODUCTION SAFETY: FAIL");
await prisma.$disconnect();
process.exit(ok ? 0 : 1);
