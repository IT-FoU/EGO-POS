import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { Prisma as NodePrisma, PrismaClient as NodePrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma as WorkerPrisma, PrismaClient as WorkerPrismaClient } from "../generated/prisma/client";
import { getPrismaInventoryListPage } from "../features/inventory/prisma-repository";
import { summarizeInventoryItems, type InventoryListSummary } from "../features/inventory/list-query";
import type { TenantContext } from "../lib/db/write-context";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";

loadProjectEnvFiles();
process.env.IGO_DEMO_MODE = "false";

const results: Array<{ detail: string; name: string; ok: boolean }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

class RollbackError extends Error {
  constructor() {
    super("PERF-09D isolated fixture rollback");
    this.name = "RollbackError";
  }
}

const inventoryList = readFileSync("features/inventory/list-query.ts", "utf8");
const prismaSrc = readFileSync("lib/db/prisma.ts", "utf8");

check("Worker client is generated/prisma", prismaSrc.includes("@/generated/prisma/client"));
check("list-query no longer imports Prisma.sql helpers", !inventoryList.includes('from "@prisma/client"') && !inventoryList.includes("Prisma.empty") && !inventoryList.includes("Prisma.sql"));
check("json_agg removed from inventory list-query", !inventoryList.includes("json_agg"));
check("Scalar summary + separate page IDs", inventoryList.includes("loadInventoryListSummary") && inventoryList.includes("loadInventoryPageIds"));
check("PrismaPg max/maxUses unchanged", prismaSrc.includes("max: 1") && prismaSrc.includes("maxUses: 1"));
check("Sql constructors differ across Prisma packages", NodePrisma.Sql !== WorkerPrisma.Sql, `node=${String(NodePrisma.Sql)} worker=${String(WorkerPrisma.Sql)}`);
check(
  "Node Prisma.empty is not a Worker Sql instance",
  !(NodePrisma.empty instanceof (WorkerPrisma.Sql as unknown as new (...args: never[]) => unknown)),
);

function isRscSafe(value: unknown): boolean {
  if (value == null) return true;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return true;
  if (t === "bigint") return false;
  if (Array.isArray(value)) return value.every(isRscSafe);
  if (t !== "object") return false;
  if (value instanceof Date) return false;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  return Object.values(value as Record<string, unknown>).every(isRscSafe);
}

function summaryKey(summary: InventoryListSummary) {
  return [
    summary.totalProducts,
    summary.totalQuantity,
    summary.inventoryValue,
    summary.lowStock,
    summary.deadStock,
    summary.nearExpiry,
    summary.fastMoving,
  ].join("|");
}

async function main() {
  const url = resolveScriptDatabaseUrl("test-write");
  const nodeClient = new NodePrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  let workerClient: InstanceType<typeof WorkerPrismaClient> | null = null;
  try {
    workerClient = new WorkerPrismaClient({
      adapter: new PrismaPg({ connectionString: url, max: 1, maxUses: 1 }),
    });
    check("Worker PrismaClient constructs in Node", true);
  } catch (error) {
    check("Worker PrismaClient constructs in Node", false, error instanceof Error ? error.message : String(error));
  }

  const brokenSql = WorkerPrisma.sql`SELECT 1 ${NodePrisma.empty} AS ok`;
  const safeSql = WorkerPrisma.sql`SELECT 1::int AS ok`;
  const brokenBindsObject = brokenSql.values.some((value) => value != null && typeof value === "object");
  check(
    "Cross-package Prisma.empty is bound as a parameter object",
    brokenBindsObject && brokenSql.values.length > 0,
    `text=${brokenSql.text} values=${JSON.stringify(brokenSql.values).slice(0, 180)}`,
  );
  check("Scalar Worker sql has no object binds", safeSql.values.length === 0, `text=${safeSql.text}`);

  try {
    await nodeClient.$queryRawUnsafe(brokenSql.text, ...brokenSql.values);
    check("Original Prisma.empty composition fails on Worker client", false, "query unexpectedly succeeded");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    check(
      "Original Prisma.empty composition fails on Worker client",
      /42601|syntax error at or near "\$1"|22P02|invalid input syntax/i.test(message),
      message.slice(0, 240),
    );
    console.log(JSON.stringify({ reproducedException: message.slice(0, 500) }));
  }

  try {
    const rows = await nodeClient.$queryRaw<Array<{ ok: number }>>`SELECT 1::int AS ok`;
    check("Scalar-only raw query works", rows[0]?.ok === 1);
  } catch (error) {
    check("Scalar-only raw query works", false, error instanceof Error ? error.message : String(error));
  }

  try {
    await nodeClient.$transaction(
      async (tx) => {
        const token = randomBytes(6).toString("hex");
        const user = await tx.user.create({
          data: { fullName: "PERF-09D", passwordHash: "isolated-fixture", username: `p9d${token}` },
        });
        const company = await tx.company.create({
          data: { businessTemplateKey: "mini-mart", name: "PERF-09D", ownerUserId: user.id, storeCode: `p9d${token}` },
        });
        const branch = await tx.branch.create({ data: { companyId: company.id, isMainBranch: true, name: "Main" } });
        const warehouse = await tx.warehouse.create({
          data: { branchId: branch.id, companyId: company.id, name: "WH-A", type: "store" },
        });
        await tx.companyUser.create({
          data: { branchId: branch.id, companyId: company.id, isOwner: true, status: "active", userId: user.id },
        });
        const tenant: TenantContext = {
          branchId: branch.id,
          companyId: company.id,
          userId: user.id,
          warehouseId: warehouse.id,
        };
        const product = await tx.product.create({
          data: {
            barcode: "8859313502907",
            branchId: branch.id,
            companyId: company.id,
            costPriceLak: 8000,
            minStock: 5,
            nameEn: "PEPSI 320ml",
            nameLo: "PEPSI 320ml",
            sellingPriceLak: 11000,
            sku: "PEPSI",
            status: "active",
          },
        });
        await tx.productUnit.create({
          data: {
            barcode: "8859313502907",
            conversionQty: 1,
            costPriceLak: 8000,
            isBaseUnit: true,
            productId: product.id,
            sellingPriceLak: 11000,
            unitName: "Piece",
          },
        });
        await tx.inventoryBalance.create({
          data: { companyId: company.id, productId: product.id, quantity: 16, warehouseId: warehouse.id },
        });
        await tx.sale.create({
          data: {
            branchId: branch.id,
            companyId: company.id,
            createdAt: new Date(Date.now() - 2 * 86_400_000),
            items: {
              create: {
                costPrice: 8000,
                productId: product.id,
                quantity: 1,
                sellingPrice: 11000,
                totalAmount: 11000,
                unitId: (await tx.productUnit.findFirst({ where: { productId: product.id } }))!.id,
              },
            },
            paymentStatus: "paid",
            saleNo: `S-${token}`,
            saleStatus: "completed",
            totalAmount: 11000,
            warehouseId: warehouse.id,
          },
        });

        const page = await getPrismaInventoryListPage(tenant, { page: 1, pageSize: 100 }, tx);
        check("PEPSI inventory value 128000", page.summary.inventoryValue === 128000, `value=${page.summary.inventoryValue}`);
        check("Total products 1", page.summary.totalProducts === 1);
        check("Total quantity 16", page.summary.totalQuantity === 16);
        check("Fast moving 1", page.summary.fastMoving === 1);
        check("Low/dead/expiring 0", page.summary.lowStock === 0 && page.summary.deadStock === 0 && page.summary.nearExpiry === 0);
        check("Page rows bounded", page.items.length === 1);

        const serialized = JSON.stringify(page);
        const revived = JSON.parse(serialized) as typeof page;
        check("Inventory page JSON serializes", serialized.includes('"inventoryValue":128000'));
        check("Summary RSC-safe", isRscSafe(page.summary));
        check("Items RSC-safe after mapper", isRscSafe(JSON.parse(JSON.stringify(page.items))));
        check("No BigInt in serialized page", !/"[0-9]+n"/.test(serialized) && !serialized.includes('"__bigint"'));
        check("Revived summary matches", revived.summary.inventoryValue === 128000 && revived.summary.totalQuantity === 16);

        const oldStyle = summarizeInventoryItems(page.items);
        check(
          "Differential cards vs hydrated items",
          summaryKey({ ...oldStyle, alertCenter: 0 }) === summaryKey({ ...page.summary, alertCenter: 0 }),
          `old=${summaryKey(oldStyle)} new=${summaryKey(page.summary)}`,
        );

        throw new RollbackError();
      },
      { maxWait: 20_000, timeout: 60_000 },
    );
  } catch (error) {
    if (!(error instanceof RollbackError)) {
      check("09D fixture transaction", false, error instanceof Error ? error.message : String(error));
    }
  }

  if (workerClient) {
    try {
      await workerClient.$disconnect();
    } catch {
      // ignore
    }
  }
  await nodeClient.$disconnect();
  const failed = results.filter((row) => !row.ok);
  console.log(`\nPERF-09D worker summary: ${results.length - failed.length}/${results.length} PASS${failed.length ? ` (${failed.length} FAIL)` : ""}`);
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
