import { existsSync, readFileSync } from "node:fs";

for (const fileName of [".env", ".env.local"]) {
  if (!existsSync(fileName)) continue;
  for (const line of readFileSync(fileName, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i === -1) continue;
    const key = trimmed.slice(0, i).trim();
    let value = trimmed.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

const { PrismaClient } = await import("@prisma/client");
const { PrismaPg } = await import("@prisma/adapter-pg");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const sales = await prisma.sale.findMany({
  where: { companyId: "gobox-company", saleNo: { startsWith: "A15742ZZZZZZZ" } },
  orderBy: { createdAt: "desc" },
  take: 3,
  select: { createdAt: true, customerId: true, saleNo: true },
});
console.log(JSON.stringify(sales, null, 2));
await prisma.$disconnect();
