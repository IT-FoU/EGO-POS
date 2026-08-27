import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const TARGET_REF = "ieutdqnlfiiaawctapor";
const GOFLO_REF = "luivrsuotrdkgxkhxxbq";
const OLD_PRO_REF = "urqizygucheilflanlea";
const mode = process.argv[2] === "empty" ? "empty" : "production";

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
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadEnv();

function qaText(value: unknown) {
  return /(?:^|[^a-z])(?:qa|test|igo-admin|igopos|p3-qa|p5-qa|dash-qa|promo-qa|mem-qa|inv-qa)(?:[^a-z]|$)/i.test(
    String(value ?? ""),
  );
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes(TARGET_REF) || url.includes(GOFLO_REF) || url.includes(OLD_PRO_REF)) {
    throw new Error("Refusing cleanliness check: DATABASE_URL is not the promoted Production project");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, ssl: { rejectUnauthorized: false } }),
  });

  try {
    const [
      migrations,
      companies,
      users,
      products,
      sales,
      payments,
      refunds,
      holds,
      customers,
      promotions,
      balances,
    ] = await Promise.all([
      prisma.$queryRaw<Array<{ n: bigint }>>`select count(*)::bigint as n from _prisma_migrations`,
      prisma.company.findMany({ select: { id: true, name: true, storeCode: true } }),
      prisma.user.findMany({ select: { username: true, email: true } }),
      prisma.product.findMany({ select: { sku: true, nameEn: true, nameLo: true, isActive: true, status: true } }),
      prisma.sale.count(),
      prisma.salePayment.count(),
      prisma.refund.count(),
      prisma.holdBill.count(),
      prisma.customer.count(),
      prisma.promotion.count(),
      prisma.inventoryBalance.findMany({ select: { quantity: true, productId: true } }),
    ]);

    const migrationCount = Number(migrations[0]?.n ?? 0);
    const millionQty = balances.some((row) => Number(row.quantity) >= 1_000_000);
    const qaUsers = users.filter((user) => ["igo-admin", "manager", "cashier"].includes(user.username) || qaText(user.email));
    const qaProducts = products.filter((product) => qaText(`${product.sku} ${product.nameEn} ${product.nameLo}`) && product.nameEn !== "BETA WATER");
    const failures: string[] = [];

    if (migrationCount !== 18) failures.push(`migrations=${migrationCount}`);
    if (millionQty) failures.push("million-quantity fixture present");
    if (qaUsers.length) failures.push(`qa-users=${qaUsers.map((user) => user.username).join(",")}`);
    if (qaProducts.length) failures.push(`qa-products=${qaProducts.length}`);

    if (mode === "empty") {
      if (companies.length) failures.push("companies not empty");
      if (users.length) failures.push("users not empty");
      if (products.length) failures.push("products not empty");
      if (sales || payments || refunds || holds || customers || promotions) failures.push("business transactions not empty");
    } else {
      if (companies.length !== 1 || companies[0]?.name !== "GO BOX Mini Mart" || companies[0]?.storeCode !== "0001") {
        failures.push("production company mismatch");
      }
      if (!users.some((user) => user.username === "gobox")) failures.push("gobox owner missing");
      if (products.length !== 1 || products[0]?.nameEn !== "BETA WATER") failures.push("beta product mismatch");
    }

    if (failures.length) {
      throw new Error(failures.join("; "));
    }

    console.log(
      `CLEANLINESS_OK mode=${mode} migrations=${migrationCount} companies=${companies.length} users=${users.length} products=${products.length} sales=${sales}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`CLEANLINESS_FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
