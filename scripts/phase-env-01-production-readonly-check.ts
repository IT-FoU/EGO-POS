import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PRODUCTION_DB_FINGERPRINT } from "../lib/db/database-target";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";

loadProjectEnvFiles();
const url = resolveScriptDatabaseUrl("production-readonly");
if (!url.includes(PRODUCTION_DB_FINGERPRINT)) {
  throw new Error("Refusing ENV-01 read-only check: not Production");
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
  include: { product: { select: { barcode: true, nameEn: true } } },
  where: { companyId: company.id, product: { barcode: "8859313502907" }, warehouseId: warehouse.id },
});
const sales = await prisma.sale.findMany({
  orderBy: { saleNo: "asc" },
  select: { saleNo: true, saleStatus: true, totalAmount: true },
  where: { companyId: company.id, saleNo: { in: ["00010001", "00010002", "00010003", "00010004", "00010005"] } },
});

await prisma.$disconnect();

console.log(
  JSON.stringify(
    {
      pepsiQty: Number(pepsi?.quantity ?? NaN),
      pepsiBarcode: pepsi?.product.barcode ?? null,
      sales: sales.map((row) => ({ saleNo: row.saleNo, saleStatus: row.saleStatus })),
      writes: 0,
    },
    null,
    2,
  ),
);
