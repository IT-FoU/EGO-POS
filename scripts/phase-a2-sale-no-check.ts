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

const { PrismaClient } = await import("@prisma/client");
const { PrismaPg } = await import("@prisma/adapter-pg");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const companyId = "gobox-company";
const recent = await prisma.sale.findMany({
  where: { companyId },
  orderBy: { createdAt: "desc" },
  take: 5,
  select: { saleNo: true, createdAt: true, totalAmount: true },
});
const a0001 = await prisma.sale.findFirst({ where: { companyId, saleNo: "A0001" } });
console.log(JSON.stringify({ a0001Exists: Boolean(a0001), recentSales: recent }, null, 2));
await prisma.$disconnect();
