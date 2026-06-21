import { existsSync, readFileSync } from "node:fs";
for (const f of [".env", ".env.local"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}
const { PrismaClient } = await import("@prisma/client");
const { PrismaPg } = await import("@prisma/adapter-pg");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const rows = await prisma.inventoryBalance.findMany({
  where: { companyId: "gobox-company", warehouseId: "gobox-default-warehouse", quantity: { gt: 0 } },
  take: 5,
  include: { product: { select: { sku: true, nameEn: true } } },
});
console.log(JSON.stringify(rows.map((r) => ({ sku: r.product.sku, name: r.product.nameEn, qty: r.quantity })), null, 2));
await prisma.$disconnect();
