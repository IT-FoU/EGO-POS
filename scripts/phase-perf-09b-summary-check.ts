import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getPrismaInventoryListPage, getPrismaInventorySnapshot } from "../features/inventory/prisma-repository";
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
    super("PERF-09B isolated fixture rollback");
    this.name = "RollbackError";
  }
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function payloadBytes(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function daysFromNow(days: number) {
  return new Date(Date.now() + days * 86_400_000);
}

const inventoryList = readFileSync("features/inventory/list-query.ts", "utf8");
const inventoryRepo = readFileSync("features/inventory/prisma-repository.ts", "utf8");
const dashboardPage = readFileSync("app/(dashboard)/dashboard/page.tsx", "utf8");
const prismaSrc = readFileSync("lib/db/prisma.ts", "utf8");
const inventoryPage = readFileSync("app/(dashboard)/inventory/page.tsx", "utf8");

check("Inventory summary uses parameterized aggregate SQL", inventoryList.includes("loadInventoryListSummary") && inventoryList.includes("$queryRaw"));
check("Inventory value uses product cost * quantity", inventoryList.includes("SUM(quantity * cost_price_lak)"));
check("No $queryRawUnsafe in inventory list-query", !inventoryList.includes("$queryRawUnsafe"));
check("No Prisma.sql fragment interpolation", !inventoryList.includes("Prisma.empty") && !inventoryList.includes("Prisma.sql"));
check("No json_agg in inventory list-query", !inventoryList.includes("json_agg"));
check("Summary does not load all balances into memory", !inventoryList.includes("summaryRows") && inventoryList.includes("hydrateIds"));
check("Inventory page stays paginated", inventoryPage.includes("getInventoryListPage") && inventoryList.includes("OFFSET"));
check("Stock Count snapshot is not paginated", inventoryRepo.includes("getPrismaInventorySnapshot") && inventoryRepo.includes("inventoryBalance.findMany"));
check("Dashboard page was not changed", dashboardPage.includes("getMiniMartDashboardCriticalSnapshot") && dashboardPage.includes("Suspense"));
check("PrismaPg max/maxUses unchanged", prismaSrc.includes("max: 1") && prismaSrc.includes("maxUses: 1"));

type Tx = any;
type Stage = { ms: number; name: string; rows: number };

function wrapClient(tx: Tx): { restore: () => void; stages: Stage[] } {
  const stages: Stage[] = [];
  const originals = {
    groupBy: tx.saleItem.groupBy,
    inventoryFindMany: tx.inventoryBalance.findMany,
    movementFindMany: tx.stockMovement.findMany,
    queryRaw: tx.$queryRaw,
    warehouseFindMany: tx.warehouse.findMany,
  };
  function tap(name: string, fn: (...args: unknown[]) => Promise<unknown>) {
    return async (...args: unknown[]) => {
      const started = Date.now();
      const result = await fn.apply(tx, args);
      const rows = Array.isArray(result) ? result.length : result == null ? 0 : 1;
      stages.push({ ms: Date.now() - started, name, rows });
      return result;
    };
  }
  tx.warehouse.findMany = tap("warehouses.findMany", originals.warehouseFindMany.bind(tx.warehouse));
  tx.inventoryBalance.findMany = tap("inventoryBalance.findMany", originals.inventoryFindMany.bind(tx.inventoryBalance));
  tx.stockMovement.findMany = tap("stockMovement.findMany", originals.movementFindMany.bind(tx.stockMovement));
  tx.saleItem.groupBy = tap("saleItem.groupBy", originals.groupBy.bind(tx.saleItem));
  tx.$queryRaw = tap("$queryRaw", originals.queryRaw.bind(tx));
  return {
    restore() {
      tx.warehouse.findMany = originals.warehouseFindMany;
      tx.inventoryBalance.findMany = originals.inventoryFindMany;
      tx.stockMovement.findMany = originals.movementFindMany;
      tx.saleItem.groupBy = originals.groupBy;
      tx.$queryRaw = originals.queryRaw;
    },
    stages,
  };
}

async function createIsolatedTenant(tx: Tx, label: string, extraWarehouse = false) {
  const token = randomBytes(6).toString("hex");
  const user = await tx.user.create({
    data: { fullName: `PERF-09B ${label}`, passwordHash: "isolated-fixture", username: `p9b${token}` },
  });
  const company = await tx.company.create({
    data: { businessTemplateKey: "mini-mart", name: `PERF-09B ${label}`, ownerUserId: user.id, storeCode: `p9b${token}` },
  });
  const branch = await tx.branch.create({ data: { companyId: company.id, isMainBranch: true, name: "Main" } });
  const warehouseA = await tx.warehouse.create({
    data: { branchId: branch.id, companyId: company.id, name: "WH-A", type: "store" },
  });
  const warehouseB = extraWarehouse
    ? await tx.warehouse.create({
        data: { branchId: branch.id, companyId: company.id, name: "WH-B", type: "store" },
      })
    : null;
  await tx.companyUser.create({
    data: { branchId: branch.id, companyId: company.id, isOwner: true, status: "active", userId: user.id },
  });
  const tenant: TenantContext = {
    branchId: branch.id,
    companyId: company.id,
    userId: user.id,
    warehouseId: warehouseA.id,
  };
  return { tenant, warehouseAId: warehouseA.id, warehouseBId: warehouseB?.id ?? null };
}

async function createSku(
  tx: Tx,
  tenant: TenantContext,
  input: {
    barcode: string;
    cost: number;
    expiryDays?: number;
    minStock: number;
    name: string;
    quantity: number;
    sku: string;
    warehouseId: string;
  },
) {
  const product = await tx.product.create({
    data: {
      barcode: input.barcode,
      branchId: tenant.branchId!,
      companyId: tenant.companyId,
      costPriceLak: input.cost,
      minStock: input.minStock,
      nameEn: input.name,
      nameLo: input.name,
      sellingPriceLak: input.cost + 2000,
      sku: input.sku,
      status: "active",
    },
  });
  const unit = await tx.productUnit.create({
    data: {
      barcode: input.barcode,
      conversionQty: 1,
      costPriceLak: input.cost,
      isBaseUnit: true,
      productId: product.id,
      sellingPriceLak: input.cost + 2000,
      unitName: "Piece",
    },
  });
  await tx.inventoryBalance.create({
    data: {
      companyId: tenant.companyId,
      productId: product.id,
      quantity: input.quantity,
      warehouseId: input.warehouseId,
    },
  });
  if (input.expiryDays != null) {
    await tx.inventoryLot.create({
      data: {
        companyId: tenant.companyId,
        expiryDate: daysFromNow(input.expiryDays),
        productId: product.id,
        quantity: Math.max(input.quantity, 1),
        warehouseId: input.warehouseId,
      },
    });
  }
  return { product, unit };
}

async function createSale(
  tx: Tx,
  tenant: TenantContext,
  input: { daysAgo: number; productId: string; quantity: number; unitId: string; warehouseId: string },
) {
  return tx.sale.create({
    data: {
      branchId: tenant.branchId!,
      companyId: tenant.companyId,
      createdAt: daysFromNow(-input.daysAgo),
      items: {
        create: {
          costPrice: 0,
          productId: input.productId,
          quantity: input.quantity,
          sellingPrice: 1000,
          totalAmount: 1000,
          unitId: input.unitId,
        },
      },
      paymentStatus: "paid",
      saleNo: `S-${randomBytes(6).toString("hex")}`,
      saleStatus: "completed",
      totalAmount: 1000,
      warehouseId: input.warehouseId,
    },
  });
}

async function seedScaleCatalog(tx: Tx, tenant: TenantContext, warehouseId: string, count: number) {
  const chunk = 500;
  for (let offset = 0; offset < count; offset += chunk) {
    const slice = Array.from({ length: Math.min(chunk, count - offset) }, (_, index) => {
      const n = offset + index;
      return {
        barcode: `P9B${String(n).padStart(10, "0")}`,
        branchId: tenant.branchId!,
        companyId: tenant.companyId,
        costPriceLak: 8000,
        minStock: 5,
        nameEn: `Scale ${n}`,
        nameLo: `Scale ${n}`,
        sellingPriceLak: 10000,
        sku: `P9B-${String(n).padStart(5, "0")}`,
        status: "active" as const,
      };
    });
    const created = await tx.product.createManyAndReturn({ data: slice });
    await tx.productUnit.createMany({
      data: created.map((product: { barcode: string; id: string }) => ({
        barcode: product.barcode,
        conversionQty: 1,
        costPriceLak: 8000,
        isBaseUnit: true,
        productId: product.id,
        sellingPriceLak: 10000,
        unitName: "Piece",
      })),
    });
    await tx.inventoryBalance.createMany({
      data: created.map((product: { id: string }) => ({
        companyId: tenant.companyId,
        productId: product.id,
        quantity: 2,
        warehouseId,
      })),
    });
  }
}

async function main() {
  const url = resolveScriptDatabaseUrl("test-write");
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const clientOriginals = {
    groupBy: client.saleItem.groupBy,
    inventoryFindMany: client.inventoryBalance.findMany,
    movementFindMany: client.stockMovement.findMany,
    queryRaw: client.$queryRaw,
    warehouseFindMany: client.warehouse.findMany,
  };
  function restoreClient() {
    client.saleItem.groupBy = clientOriginals.groupBy;
    client.inventoryBalance.findMany = clientOriginals.inventoryFindMany;
    client.stockMovement.findMany = clientOriginals.movementFindMany;
    client.$queryRaw = clientOriginals.queryRaw;
    client.warehouse.findMany = clientOriginals.warehouseFindMany;
  }
  const catalogTimings: Record<number, { loaderMedianMs: number; payloadBytes: number; stages: Stage[]; summaryBytes: number }> =
    {};

  try {
    await client.$transaction(
      async (tx) => {
        const empty = await createIsolatedTenant(tx, "empty");
        const emptyPage = await getPrismaInventoryListPage(empty.tenant, { page: 1, pageSize: 100 }, tx);
        check("Empty inventory total products is 0", emptyPage.summary.totalProducts === 0);
        check("Empty inventory quantity is 0", emptyPage.summary.totalQuantity === 0);
        check("Empty inventory value is 0", emptyPage.summary.inventoryValue === 0);
        check("Empty inventory low/dead/expiring/fast are 0", emptyPage.summary.lowStock === 0 && emptyPage.summary.deadStock === 0 && emptyPage.summary.nearExpiry === 0 && emptyPage.summary.fastMoving === 0);
        check("Empty inventory does not crash on Decimal", emptyPage.items.length === 0 && Number.isFinite(emptyPage.summary.inventoryValue));

        const { tenant, warehouseAId, warehouseBId } = await createIsolatedTenant(tx, "correct", true);
        if (!warehouseBId) throw new Error("warehouse B missing");

        const pepsi = await createSku(tx, tenant, {
          barcode: "8859313502907",
          cost: 8000,
          minStock: 5,
          name: "PEPSI 320ml",
          quantity: 16,
          sku: "PEPSI",
          warehouseId: warehouseAId,
        });
        await createSale(tx, tenant, {
          daysAgo: 2,
          productId: pepsi.product.id,
          quantity: 1,
          unitId: pepsi.unit.id,
          warehouseId: warehouseAId,
        });

        await createSku(tx, tenant, {
          barcode: "LOWBELOW",
          cost: 1000,
          minStock: 5,
          name: "Low Below",
          quantity: 2,
          sku: "LOW-BELOW",
          warehouseId: warehouseAId,
        });
        await createSku(tx, tenant, {
          barcode: "LOWEQUAL",
          cost: 1000,
          minStock: 5,
          name: "Low Equal",
          quantity: 5,
          sku: "LOW-EQUAL",
          warehouseId: warehouseAId,
        });
        await createSku(tx, tenant, {
          barcode: "ABOVE",
          cost: 1000,
          minStock: 5,
          name: "Above Threshold",
          quantity: 10,
          sku: "ABOVE",
          warehouseId: warehouseAId,
        });
        await createSku(tx, tenant, {
          barcode: "ZERO",
          cost: 1000,
          minStock: 5,
          name: "Zero Stock",
          quantity: 0,
          sku: "ZERO",
          warehouseId: warehouseAId,
        });

        const deadOld = await createSku(tx, tenant, {
          barcode: "DEADOLD",
          cost: 1000,
          minStock: 1,
          name: "Dead Old Sale",
          quantity: 4,
          sku: "DEAD-OLD",
          warehouseId: warehouseAId,
        });
        await createSale(tx, tenant, {
          daysAgo: 40,
          productId: deadOld.product.id,
          quantity: 1,
          unitId: deadOld.unit.id,
          warehouseId: warehouseAId,
        });

        const fastRecent = await createSku(tx, tenant, {
          barcode: "FASTREC",
          cost: 1000,
          minStock: 1,
          name: "Fast Recent",
          quantity: 8,
          sku: "FAST-REC",
          warehouseId: warehouseAId,
        });
        await createSale(tx, tenant, {
          daysAgo: 3,
          productId: fastRecent.product.id,
          quantity: 2,
          unitId: fastRecent.unit.id,
          warehouseId: warehouseAId,
        });

        await createSku(tx, tenant, {
          barcode: "EXP10",
          cost: 1000,
          expiryDays: 10,
          minStock: 1,
          name: "Expire 10",
          quantity: 1,
          sku: "EXP-10",
          warehouseId: warehouseAId,
        });
        await createSku(tx, tenant, {
          barcode: "EXP40",
          cost: 1000,
          expiryDays: 40,
          minStock: 1,
          name: "Expire 40",
          quantity: 1,
          sku: "EXP-40",
          warehouseId: warehouseAId,
        });
        await createSku(tx, tenant, {
          barcode: "EXPIRED",
          cost: 1000,
          expiryDays: -1,
          minStock: 1,
          name: "Already Expired",
          quantity: 1,
          sku: "EXPIRED",
          warehouseId: warehouseAId,
        });

        const split = await createSku(tx, tenant, {
          barcode: "SPLIT",
          cost: 8000,
          minStock: 1,
          name: "Split Warehouse",
          quantity: 10,
          sku: "SPLIT",
          warehouseId: warehouseAId,
        });
        await tx.inventoryBalance.create({
          data: {
            companyId: tenant.companyId,
            productId: split.product.id,
            quantity: 6,
            warehouseId: warehouseBId,
          },
        });
        await createSku(tx, tenant, {
          barcode: "WHBONLY",
          cost: 2000,
          minStock: 1,
          name: "Warehouse B Only",
          quantity: 7,
          sku: "WHB-ONLY",
          warehouseId: warehouseBId,
        });

        const decimalSku = await createSku(tx, tenant, {
          barcode: "DECSAFE",
          cost: 8000.5,
          minStock: 1,
          name: "Decimal Safe",
          quantity: 3,
          sku: "DEC-SAFE",
          warehouseId: warehouseAId,
        });

        const allPage = await getPrismaInventoryListPage(tenant, { page: 1, pageSize: 100 }, tx);
        const aPage = await getPrismaInventoryListPage(tenant, { page: 1, pageSize: 100, warehouseId: warehouseAId }, tx);
        const bPage = await getPrismaInventoryListPage(tenant, { page: 1, pageSize: 100, warehouseId: warehouseBId }, tx);

        check("PEPSI inventory value uses 16 x 8000", aPage.items.some((row) => row.sku === "PEPSI" && row.inventoryValueLak === 128000));
        check("Warehouse A quantity includes PEPSI 16", aPage.summary.totalQuantity >= 16);
        check("Warehouse A inventory value includes 128000 plus other A rows", aPage.summary.inventoryValue >= 128000);

        const expectedAValue =
          16 * 8000 +
          2 * 1000 +
          5 * 1000 +
          10 * 1000 +
          0 * 1000 +
          4 * 1000 +
          8 * 1000 +
          1 * 1000 +
          1 * 1000 +
          1 * 1000 +
          10 * 8000 +
          3 * 8000.5;
        check("Warehouse A inventory value matches product cost * qty", aPage.summary.inventoryValue === expectedAValue, `value=${aPage.summary.inventoryValue} expected=${expectedAValue}`);

        check("Low stock: below threshold counted", aPage.summary.lowStock >= 1);
        check("Low stock: equal threshold counted", aPage.items.concat(aPage.previewItems).some((row) => row.sku === "LOW-EQUAL"));
        const lowFilter = await getPrismaInventoryListPage(tenant, { page: 1, pageSize: 100, stockFilter: "low_stock", warehouseId: warehouseAId }, tx);
        check(
          "Low stock filter includes below and equal, excludes above/zero",
          lowFilter.summary.lowStock === lowFilter.summary.totalProducts &&
            lowFilter.items.some((row) => row.sku === "LOW-BELOW") &&
            lowFilter.items.some((row) => row.sku === "LOW-EQUAL") &&
            !lowFilter.items.some((row) => row.sku === "ABOVE") &&
            !lowFilter.items.some((row) => row.sku === "ZERO"),
        );

        const deadFilter = await getPrismaInventoryListPage(tenant, { page: 1, pageSize: 100, stockFilter: "dead_stock", warehouseId: warehouseAId }, tx);
        check("Dead stock excludes zero never-sold", !deadFilter.items.some((row) => row.sku === "ZERO") && deadFilter.summary.deadStock === deadFilter.summary.totalProducts);
        check("Dead stock includes never-sold in-stock and 40-day last sale", deadFilter.items.some((row) => row.sku === "LOW-BELOW") && deadFilter.items.some((row) => row.sku === "DEAD-OLD"));
        check("Dead stock excludes recent sale", !deadFilter.items.some((row) => row.sku === "FAST-REC" || row.sku === "PEPSI"));

        const expireFilter = await getPrismaInventoryListPage(tenant, { page: 1, pageSize: 100, stockFilter: "near_expiry", warehouseId: warehouseAId }, tx);
        check("Expiring includes 10-day and already expired, excludes 40-day", expireFilter.items.some((row) => row.sku === "EXP-10") && expireFilter.items.some((row) => row.sku === "EXPIRED") && !expireFilter.items.some((row) => row.sku === "EXP-40") && expireFilter.summary.nearExpiry === 2);

        const fastFilter = await getPrismaInventoryListPage(tenant, { page: 1, pageSize: 100, stockFilter: "fast_moving", warehouseId: warehouseAId }, tx);
        check("Fast moving includes recent sales and zero never-sold", fastFilter.items.some((row) => row.sku === "PEPSI") && fastFilter.items.some((row) => row.sku === "FAST-REC") && fastFilter.items.some((row) => row.sku === "ZERO"));
        check("Fast moving excludes in-stock never-sold", !fastFilter.items.some((row) => row.sku === "LOW-BELOW"));

        check("Warehouse A does not include WH-B-only SKU", !aPage.items.some((row) => row.sku === "WHB-ONLY") && !aPage.previewItems.some((row) => row.sku === "WHB-ONLY"));
        const expectedAQty = 16 + 2 + 5 + 10 + 0 + 4 + 8 + 1 + 1 + 1 + 10 + 3;
        check("Warehouse A total quantity is not double-counted", aPage.summary.totalQuantity === expectedAQty, `qty=${aPage.summary.totalQuantity} expected=${expectedAQty}`);
        check("Warehouse B summary is isolated", bPage.summary.totalQuantity === 6 + 7, `qty=${bPage.summary.totalQuantity}`);
        check("All-warehouse quantity sums A+B without duplicating split rows incorrectly", allPage.summary.totalQuantity === expectedAQty + 6 + 7, `qty=${allPage.summary.totalQuantity}`);
        check("All-warehouse counts split product as two balance rows", allPage.summary.totalProducts === aPage.summary.totalProducts + bPage.summary.totalProducts, `all=${allPage.summary.totalProducts} a=${aPage.summary.totalProducts} b=${bPage.summary.totalProducts}`);

        const searchPage = await getPrismaInventoryListPage(tenant, { page: 1, pageSize: 25, search: "PEPSI 320ml", warehouseId: warehouseAId }, tx);
        check("Search is server-side", searchPage.totalCount === 1 && searchPage.items[0]?.sku === "PEPSI");

        const snapshot = await getPrismaInventorySnapshot(tenant, tx);
        check("Stock Count snapshot still sees all warehouse-scope rows", snapshot.items.length === allPage.summary.totalProducts, `rows=${snapshot.items.length}`);

        const foreign = await createIsolatedTenant(tx, "foreign");
        await createSku(tx, foreign.tenant, {
          barcode: "8859313502907",
          cost: 1,
          minStock: 5,
          name: "PEPSI 320ml",
          quantity: 99,
          sku: "PEPSI",
          warehouseId: foreign.warehouseAId,
        });
        const foreignPage = await getPrismaInventoryListPage(foreign.tenant, { page: 1, pageSize: 100 }, tx);
        const homeAgain = await getPrismaInventoryListPage(tenant, { page: 1, pageSize: 100, warehouseId: warehouseAId }, tx);
        check("Tenant isolation: foreign PEPSI 99 is not visible to tenant A", homeAgain.summary.totalQuantity === expectedAQty && !homeAgain.items.some((row) => row.quantity === 99));
        check("Tenant isolation: tenant B sees only its own 99", foreignPage.summary.totalQuantity === 99 && foreignPage.summary.inventoryValue === 99);

        check("Decimal inventory value converts without Prisma leak", homeAgain.summary.inventoryValue === expectedAValue && !String(homeAgain.summary.inventoryValue).includes("[object"));
        check("Decimal SKU hydrated through DTO", homeAgain.items.some((row) => row.productId === decimalSku.product.id && Number.isFinite(row.inventoryValueLak ?? NaN)));

        const filler = Array.from({ length: 120 }, (_, index) => ({
          barcode: `FILL${String(index).padStart(8, "0")}`,
          branchId: tenant.branchId!,
          companyId: tenant.companyId,
          costPriceLak: 100,
          minStock: 1,
          nameEn: `Filler ${index}`,
          nameLo: `Filler ${index}`,
          sellingPriceLak: 150,
          sku: `FILL-${String(index).padStart(3, "0")}`,
          status: "active" as const,
        }));
        const createdFill = await tx.product.createManyAndReturn({ data: filler });
        await tx.productUnit.createMany({
          data: createdFill.map((product: { barcode: string; id: string }) => ({
            barcode: product.barcode,
            conversionQty: 1,
            costPriceLak: 100,
            isBaseUnit: true,
            productId: product.id,
            sellingPriceLak: 150,
            unitName: "Piece",
          })),
        });
        await tx.inventoryBalance.createMany({
          data: createdFill.map((product: { id: string }) => ({
            companyId: tenant.companyId,
            productId: product.id,
            quantity: 2,
            warehouseId: warehouseAId,
          })),
        });
        const page1 = await getPrismaInventoryListPage(tenant, { page: 1, pageSize: 100, warehouseId: warehouseAId }, tx);
        const page2 = await getPrismaInventoryListPage(tenant, { page: 2, pageSize: 100, warehouseId: warehouseAId }, tx);
        const pageIds = new Set(page1.items.map((row) => row.id));
        check("Server pagination page size is 100", page1.items.length === 100, `rows=${page1.items.length}`);
        check("Second page has no duplicate ids", page2.items.every((row) => !pageIds.has(row.id)));
        check("First-page payload stays bounded after extra rows", page1.items.length === 100 && payloadBytes(page1.items) < 250_000);
        throw new RollbackError();
      },
      { maxWait: 20_000, timeout: 180_000 },
    );
  } catch (error) {
    if (!(error instanceof RollbackError)) {
      check("Correctness transaction", false, error instanceof Error ? error.message : String(error));
    }
  }

  const catalogSizes = existsSync("package.json") ? [100, 1000, 5000, 10000] : [100, 1000, 5000];
  for (const size of catalogSizes) {
    try {
      await client.$transaction(
        async (tx) => {
          const { tenant, warehouseAId } = await createIsolatedTenant(tx, `n${size}`);
          await seedScaleCatalog(tx, tenant, warehouseAId, size);
          const wrapped = wrapClient(tx);
          const runs: number[] = [];
          let firstStages: Stage[] = [];
          let lastPage: Awaited<ReturnType<typeof getPrismaInventoryListPage>> | null = null;
          try {
            for (let run = 0; run < 3; run += 1) {
              const before = wrapped.stages.length;
              const started = Date.now();
              lastPage = await getPrismaInventoryListPage(tenant, { page: 1, pageSize: 100 }, tx);
              runs.push(Date.now() - started);
              if (run === 0) firstStages = wrapped.stages.slice(before);
            }
          } finally {
            wrapped.restore();
          }
          const loaderMedianMs = median(runs);
          const balanceHydrate = firstStages.filter((row) => row.name === "inventoryBalance.findMany");
          const hydrateRows = balanceHydrate.reduce((sum, row) => sum + row.rows, 0);
          catalogTimings[size] = {
            loaderMedianMs,
            payloadBytes: payloadBytes(lastPage?.items),
            stages: firstStages,
            summaryBytes: payloadBytes(lastPage?.summary),
          };
          check(`${size} products: first page stays at 100 rows`, lastPage?.items.length === 100, `rows=${lastPage?.items.length} median=${loaderMedianMs}ms`);
          check(`${size} products: total count is ${size}`, lastPage?.totalCount === size, `total=${lastPage?.totalCount}`);
          check(`${size} products: summary hydrates a bounded row set`, hydrateRows <= 250, `hydrateRows=${hydrateRows} stages=${JSON.stringify(firstStages)}`);
          check(`${size} products: summary payload stays tiny`, payloadBytes(lastPage?.summary) < 1000, `bytes=${payloadBytes(lastPage?.summary)}`);
          if (size === 100) check("100 products loader preferably <1s", loaderMedianMs < 1000, `${loaderMedianMs}ms`);
          if (size === 1000) check("1,000 products loader preferably <1s", loaderMedianMs < 1000, `${loaderMedianMs}ms`);
          if (size === 5000) check("5,000 products loader preferably <1.5s", loaderMedianMs < 1500, `${loaderMedianMs}ms`);
          if (size === 10000) check("10,000 products loader reported", Number.isFinite(loaderMedianMs), `${loaderMedianMs}ms`);
          throw new RollbackError();
        },
        { maxWait: 20_000, timeout: 300_000 },
      );
    } catch (error) {
      if (error instanceof RollbackError) continue;
      check(`${size} products catalog`, false, error instanceof Error ? error.message : String(error));
      if (size === 10000) {
        check("10,000 products skipped after error", true, error instanceof Error ? error.message : String(error));
      }
    } finally {
      restoreClient();
    }
  }

  if (catalogTimings[100] && catalogTimings[5000]) {
    const grew = catalogTimings[5000].payloadBytes > catalogTimings[100].payloadBytes * 3;
    check("First-page item payload does not grow linearly", !grew, `100=${catalogTimings[100].payloadBytes}B 5000=${catalogTimings[5000].payloadBytes}B`);
    const summaryGrew = catalogTimings[5000].summaryBytes > catalogTimings[100].summaryBytes * 2;
    check("Summary payload does not grow linearly", !summaryGrew, `100=${catalogTimings[100].summaryBytes}B 5000=${catalogTimings[5000].summaryBytes}B`);
  }

  await client.$disconnect();
  const failed = results.filter((row) => !row.ok);
  console.log(`\nPERF-09B inventory summary: ${results.length - failed.length}/${results.length} PASS${failed.length ? ` (${failed.length} FAIL)` : ""}`);
  console.log(JSON.stringify({ catalogTimings }, null, 2));
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
