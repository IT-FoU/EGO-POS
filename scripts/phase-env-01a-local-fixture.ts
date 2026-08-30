import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { classifyDatabaseUrl, fingerprintDatabaseUrl } from "../lib/db/database-target";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";

loadProjectEnvFiles();
const url = resolveScriptDatabaseUrl("dev-write");
console.log(
  JSON.stringify({
    class: classifyDatabaseUrl(url),
    fingerprint: fingerprintDatabaseUrl(url),
    host: "127.0.0.1",
  }),
);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});

const products = [
  { barcode: "ENVLOCAL001", name: "Local Water", sku: "ENV-WATER", price: 5000, qty: 20 },
  { barcode: "ENVLOCAL002", name: "Local Soap", sku: "ENV-SOAP", price: 8000, qty: 10 },
  { barcode: "ENVLOCAL003", name: "Local Rice", sku: "ENV-RICE", price: 25000, qty: 5 },
];

const ping = await prisma.$queryRaw<Array<{ one: number }>>`SELECT 1 AS one`;
if (Number(ping[0]?.one) !== 1) throw new Error("Dev SELECT 1 failed");

const company = await prisma.company.findFirst({ where: { id: "gobox-company" } });
if (!company) throw new Error("Local seed company missing");
const branch = await prisma.branch.findFirst({ where: { id: "gobox-main-branch" } });
const warehouse = await prisma.warehouse.findFirst({ where: { id: "gobox-default-warehouse" } });
if (!branch || !warehouse) throw new Error("Local seed branch/warehouse missing");

for (const item of products) {
  const existing = await prisma.product.findFirst({
    where: { companyId: company.id, sku: item.sku },
  });
  if (existing) continue;
  const product = await prisma.product.create({
    data: {
      barcode: item.barcode,
      branchId: branch.id,
      companyId: company.id,
      costPriceLak: item.price / 2,
      nameEn: item.name,
      nameLo: item.name,
      sellingPriceLak: item.price,
      sku: item.sku,
    },
  });
  await prisma.productUnit.create({
    data: {
      conversionQty: 1,
      isBaseUnit: true,
      isDefaultSaleUnit: true,
      productId: product.id,
      sellingPriceLak: item.price,
      unitName: "Piece",
    },
  });
  await prisma.inventoryBalance.create({
    data: {
      companyId: company.id,
      productId: product.id,
      quantity: item.qty,
      warehouseId: warehouse.id,
    },
  });
}

const count = await prisma.product.count({ where: { companyId: company.id } });
await prisma.$disconnect();

const testUrl = resolveScriptDatabaseUrl("test-write");
const test = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl }) });
await test.company.upsert({
  where: { storeCode: "0001" },
  update: {},
  create: {
    businessTemplateKey: "mini_mart",
    id: "local-gobox-placeholder",
    name: "Local Test Store",
    storeCode: "0001",
  },
});
await test.$disconnect();
console.log(`local-fixture-products=${count}`);
