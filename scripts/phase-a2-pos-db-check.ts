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

process.env.IGO_DEMO_MODE = "false";

const companyId = "gobox-company";
const warehouseId = "gobox-default-warehouse";
const branchId = "gobox-main-branch";

const { PrismaClient } = await import("@prisma/client");
const { PrismaPg } = await import("@prisma/adapter-pg");
const { completePrismaSale, getPrismaPosSnapshot } = await import("../features/pos/prisma-repository");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: SCRIPT_DATABASE_URL }) });

async function tenantFor(username: string) {
  const user = await prisma.user.findFirst({ where: { username } });
  if (!user) throw new Error(`Missing user ${username}`);
  return { branchId, companyId, userId: user.id, warehouseId };
}

for (const username of ["manager", "cashier", "igo-admin"]) {
  const tenant = await tenantFor(username);
  const snapshot = await getPrismaPosSnapshot(tenant);
  const product = snapshot.products.find((item: { stockQty: number }) => item.stockQty > 0) ?? snapshot.products[0];
  if (!product) {
    console.log(username, "NO_PRODUCT");
    continue;
  }
  const stockBefore = await prisma.inventoryBalance.findFirst({
    where: { companyId, productId: product.id, warehouseId },
  });
  const saleNo = `INV-POS-${username}-${Date.now()}`;
  const price = Number(product.priceLak ?? product.sellingPriceLak ?? 0);
  const sale = await completePrismaSale(
    {
      branchId,
      cardAmount: 0,
      cashAmount: price,
      changeAmount: 0,
      discountAmount: 0,
      discountPercent: 0,
      items: [{ productId: product.id, quantity: 1, sellingPrice: price }],
      paymentMode: "cash",
      qrAmount: 0,
      saleNo,
      taxAmount: 0,
      taxRate: 0,
      totalAmount: price,
      warehouseId,
    },
    tenant,
  );
  const stockAfter = await prisma.inventoryBalance.findFirst({
    where: { companyId, productId: product.id, warehouseId },
  });
  const saleRow = await prisma.sale.findFirst({
    where: { id: sale.id },
    include: { items: true, payments: true },
  });
  console.log(
    JSON.stringify({
      inventoryDeducted: Number(stockBefore?.quantity ?? 0) - Number(stockAfter?.quantity ?? 0) === 1,
      payments: saleRow?.payments?.length ?? 0,
      saleId: sale.id,
      saleItems: saleRow?.items?.length ?? 0,
      saleNo: saleRow?.saleNo,
      stockAfter: stockAfter?.quantity,
      stockBefore: stockBefore?.quantity,
      username,
    }),
  );
}

await prisma.$disconnect();
