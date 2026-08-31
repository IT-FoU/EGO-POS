import { createScriptPrismaClient } from "../lib/db/script-prisma";
import { classifyDatabaseUrl, fingerprintDatabaseUrl, PRODUCTION_DB_FINGERPRINT } from "../lib/db/database-target";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";
import { getPrismaInventoryListPage } from "../features/inventory/prisma-repository";

loadProjectEnvFiles();
const url = resolveScriptDatabaseUrl("production-readonly");
if (classifyDatabaseUrl(url) !== "PRODUCTION" || fingerprintDatabaseUrl(url) !== PRODUCTION_DB_FINGERPRINT) {
  throw new Error("REFUSING: production-readonly is not Production");
}

const prisma = createScriptPrismaClient("production-readonly");
const COMPANY_ID = "cmtbbgreh003hakbhogifi599";
const BRANCH_ID = "cmtbbgrnq003iakbheuap8vlo";
const WAREHOUSE_ID = "cmtbbgsbt003jakbhe8tq7asl";

const company = await prisma.company.findUnique({
  select: { ownerUserId: true },
  where: { id: COMPANY_ID },
});
if (!company) throw new Error("Production company not found");

const [productCount, pepsi, page] = await Promise.all([
  prisma.product.count({ where: { companyId: COMPANY_ID } }),
  prisma.inventoryBalance.findFirst({
    include: { product: { select: { costPriceLak: true, nameEn: true, sku: true } } },
    where: { companyId: COMPANY_ID, warehouseId: WAREHOUSE_ID, product: { barcode: "8859313502907" } },
  }),
  getPrismaInventoryListPage(
    { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: company.ownerUserId, warehouseId: WAREHOUSE_ID },
    { page: 1, pageSize: 100, warehouseId: WAREHOUSE_ID },
    prisma,
  ),
]);

const pepsiQty = Number(pepsi?.quantity ?? NaN);
const pepsiCost = Number(pepsi?.product.costPriceLak ?? 0);
const expectedValue = pepsiQty * pepsiCost;

console.log(
  JSON.stringify(
    {
      fingerprint: PRODUCTION_DB_FINGERPRINT,
      products: productCount,
      pepsiQty,
      expectedValue,
      summary: page.summary,
      writes: 0,
    },
    null,
    2,
  ),
);
await prisma.$disconnect();
