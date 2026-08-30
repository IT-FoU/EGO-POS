import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";

const TARGET_REF = "ieutdqnlfiiaawctapor";
const HOLD_NO = "HOLD-MTFENG3L-KBB9J";

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
loadProjectEnvFiles();

const url = resolveScriptDatabaseUrl("production-readonly");
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
const sales = await prisma.sale.findMany({
  orderBy: { saleNo: "asc" },
  select: { saleNo: true, saleStatus: true },
  where: { companyId: company.id },
});
const hold = await prisma.holdBill.findFirst({
  select: { holdNo: true, status: true, resumedAt: true },
  where: { companyId: company.id, holdNo: HOLD_NO },
});
const heldCount = await prisma.holdBill.count({ where: { companyId: company.id, status: "held" } });
const holdCount = await prisma.holdBill.count({ where: { companyId: company.id } });
const movementCount = await prisma.stockMovement.count({ where: { companyId: company.id } });
const refundCount = await prisma.refund.count({ where: { companyId: company.id } });

const expectedSales = [
  { saleNo: "00010001", saleStatus: "completed" },
  { saleNo: "00010002", saleStatus: "completed" },
  { saleNo: "00010003", saleStatus: "completed" },
  { saleNo: "00010004", saleStatus: "refunded" },
  { saleNo: "00010005", saleStatus: "cancelled" },
];
const salesMatch =
  sales.length === expectedSales.length &&
  expectedSales.every((row, index) => sales[index]?.saleNo === row.saleNo && sales[index]?.saleStatus === row.saleStatus);

console.log(`PEPSI stock: ${Number(pepsi?.quantity)} (expect 18)`);
console.log(`Sales: ${sales.map((row) => `${row.saleNo}:${row.saleStatus}`).join(", ")}`);
console.log(`Hold ${HOLD_NO}: ${hold?.status ?? "missing"} resumedAt=${hold?.resumedAt ?? "null"}`);
console.log(`Active held bills: ${heldCount} (expect 0)`);
console.log(`Total hold rows: ${holdCount} (expect 2 pre-existing resumed)`);
console.log(`Refunds: ${refundCount} (expect 1)`);
console.log(`Stock movements: ${movementCount} (expect 8)`);

const ok =
  Number(pepsi?.quantity) === 18 &&
  salesMatch &&
  hold?.status === "resumed" &&
  heldCount === 0 &&
  holdCount === 2 &&
  refundCount === 1 &&
  movementCount === 8;

console.log(ok ? "PRODUCTION SAFETY: PASS" : "PRODUCTION SAFETY: FAIL");
await prisma.$disconnect();
process.exit(ok ? 0 : 1);
