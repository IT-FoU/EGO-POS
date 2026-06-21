import { existsSync, readFileSync } from "node:fs";

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

const sku = process.argv[2] ?? "A2-1782049664447";
const { PrismaClient } = await import("@prisma/client");
const { PrismaPg } = await import("@prisma/adapter-pg");
const { getPrismaProducts } = await import("../features/products/prisma-repository");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const row = await prisma.product.findFirst({ where: { companyId: "gobox-company", sku } });
const user = await prisma.user.findFirst({ where: { username: "igo-admin" } });
const tenant = {
  branchId: "gobox-main-branch",
  companyId: "gobox-company",
  userId: user!.id,
  warehouseId: "gobox-default-warehouse",
};
const list = await getPrismaProducts(tenant);
console.log(JSON.stringify({
  dbProduct: row ? { id: row.id, nameEn: row.nameEn, sku: row.sku } : null,
  inRepositoryList: list.some((product: { sku?: string }) => product.sku === sku),
  totalProducts: list.length,
}, null, 2));
await prisma.$disconnect();
