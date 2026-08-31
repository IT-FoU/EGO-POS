import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getPrismaInventoryListPage, getPrismaInventorySnapshot } from "../features/inventory/prisma-repository";
import { getPrismaProductById, getPrismaProductListPage, getPrismaProducts } from "../features/products/prisma-repository";
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
    super("PERF-09 isolated fixture rollback");
    this.name = "RollbackError";
  }
}

const productRepo = readFileSync("features/products/prisma-repository.ts", "utf8");
const productList = readFileSync("features/products/list-query.ts", "utf8");
const productPage = readFileSync("app/(dashboard)/products/page.tsx", "utf8");
const inventoryRepo = readFileSync("features/inventory/prisma-repository.ts", "utf8");
const inventoryList = readFileSync("features/inventory/list-query.ts", "utf8");
const inventoryPage = readFileSync("app/(dashboard)/inventory/page.tsx", "utf8");
const dashboardPage = readFileSync("app/(dashboard)/dashboard/page.tsx", "utf8");
const prisma = readFileSync("lib/db/prisma.ts", "utf8");
const packageJson = readFileSync("package.json", "utf8");

check("Products list uses server pagination helper", productPage.includes("getProductListPage") && productList.includes("getPrismaProductListPage"));
check("Products list include has no priceHistory", !productList.includes("priceHistory"));
check("Products list include has no barcodeHistory", !productList.includes("barcodeHistory"));
check("Edit loader still loads price history", productRepo.includes("priceHistory: { orderBy: { createdAt: \"desc\" }, take: 50 }"));
check("Inventory last-sale uses DISTINCT ON", inventoryList.includes("DISTINCT ON (si.product_id)"));
check("Inventory snapshot does not unbounded-find sale items", !inventoryRepo.includes("saleItem.findMany"));
check("Inventory snapshot dropped lifetime saleItem count", !inventoryRepo.includes("_count: { select: { saleItems: true } }"));
check("Inventory list page is paginated", inventoryPage.includes("getInventoryListPage") && inventoryList.includes("skip"));
check("Dashboard page was not changed", dashboardPage.includes("getMiniMartDashboardCriticalSnapshot") && dashboardPage.includes("Suspense"));
check("PrismaPg max/maxUses unchanged", prisma.includes("max: 1") && prisma.includes("maxUses: 1"));
const pkg = JSON.parse(packageJson) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
const depNames = { ...pkg.dependencies, ...pkg.devDependencies };
check("No new cache/websocket dependency", !depNames.ioredis && !depNames.ws && !depNames.redis && !depNames.websocket);
check("PERF-08 loading files remain", existsSync("app/(dashboard)/products/loading.tsx") && existsSync("app/(dashboard)/inventory/loading.tsx"));

type Tx = any;

async function createIsolatedTenant(tx: Tx, label: string) {
  const token = randomBytes(6).toString("hex");
  const user = await tx.user.create({
    data: { fullName: `PERF-09 ${label}`, passwordHash: "isolated-fixture", username: `p9u${token}` },
  });
  const company = await tx.company.create({
    data: { businessTemplateKey: "mini-mart", name: `PERF-09 ${label}`, ownerUserId: user.id, storeCode: `p9${token}` },
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
  return { tenant, warehouseId: warehouse.id };
}

async function seedCatalog(tx: Tx, tenant: TenantContext, warehouseId: string, count: number) {
  const products = Array.from({ length: count }, (_, index) => ({
    barcode: `P09${String(index).padStart(10, "0")}`,
    branchId: tenant.branchId!,
    companyId: tenant.companyId,
    costPriceLak: 1000,
    nameEn: `Scale Product ${index}`,
    nameLo: `Scale Product ${index}`,
    sellingPriceLak: 1500,
    sku: `PERF09-${String(index).padStart(4, "0")}`,
    status: "active" as const,
  }));
  const created = [];
  const chunk = 500;
  for (let offset = 0; offset < products.length; offset += chunk) {
    created.push(...(await tx.product.createManyAndReturn({ data: products.slice(offset, offset + chunk) })));
  }
  const units = created.map((product: { id: string; barcode: string }) => ({
    barcode: product.barcode,
    conversionQty: 1,
    costPriceLak: 1000,
    isBaseUnit: true,
    productId: product.id,
    sellingPriceLak: 1500,
    unitName: "Piece",
  }));
  for (let offset = 0; offset < units.length; offset += chunk) {
    await tx.productUnit.createMany({ data: units.slice(offset, offset + chunk) });
  }
  const balances = created.map((product: { id: string }) => ({
    companyId: tenant.companyId,
    productId: product.id,
    quantity: 2,
    warehouseId,
  }));
  for (let offset = 0; offset < balances.length; offset += chunk) {
    await tx.inventoryBalance.createMany({ data: balances.slice(offset, offset + chunk) });
  }
  return created as Array<{ barcode: string; id: string; sku: string }>;
}

function payloadBytes(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

async function main() {
  const url = resolveScriptDatabaseUrl("test-write");
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const catalogSizes = [100, 1000, 5000];
  const catalogResults: Record<number, { inventoryBytes: number; productBytes: number; productRows: number }> = {};

  try {
    await client.$transaction(
      async (tx) => {
        const { tenant, warehouseId } = await createIsolatedTenant(tx, "scale");
        const created = await seedCatalog(tx, tenant, warehouseId, 120);
        const page = await getPrismaProductListPage(tenant, { page: 1, pageSize: 100 }, tx);
        check("First product page returns page size", page.products.length === 100, `rows=${page.products.length}`);
        check("Product total count is catalog-wide", page.totalCount === 120, `total=${page.totalCount}`);
        check("Product list has no price history payload", page.products.every((row) => !row.priceHistory?.length));
        check("Product list has no barcode history payload", page.products.every((row) => !row.barcodeHistory?.length));
        const pageIds = new Set(page.products.map((row) => row.id));
        const page2 = await getPrismaProductListPage(tenant, { page: 2, pageSize: 100 }, tx);
        check("Second page has no duplicate ids", page2.products.every((row) => !pageIds.has(row.id)));
        check("Pages cover the catalog", page.products.length + page2.products.length === 120, `sum=${page.products.length + page2.products.length}`);
        const page2Ids = new Set(page2.products.map((row) => row.id));
        check("Last product page has remaining rows only", page2.products.length === 20, `rows=${page2.products.length}`);
        check("No product id appears on both pages", [...pageIds].every((id) => !page2Ids.has(id)));
        const draftPage = await getPrismaProductListPage(tenant, { page: 1, pageSize: 100, status: "draft" }, tx);
        check("Status filter is server-wide", draftPage.totalCount === 0, `total=${draftPage.totalCount}`);
        const target = created[85];
        const barcodeHit = await getPrismaProductListPage(tenant, { page: 1, pageSize: 25, search: target.barcode }, tx);
        check("Barcode search finds the product across pages", barcodeHit.products.some((row) => row.id === target.id) && barcodeHit.totalCount === 1);
        const nameHit = await getPrismaProductListPage(tenant, { page: 1, pageSize: 25, search: "Scale Product 85" }, tx);
        check("Name search finds the product", nameHit.products.some((row) => row.id === target.id));
        const skuHit = await getPrismaProductListPage(tenant, { page: 1, pageSize: 25, search: target.sku }, tx);
        check("SKU search finds the product", skuHit.products.some((row) => row.id === target.id));
        const category = await tx.category.create({
          data: { branchId: tenant.branchId, companyId: tenant.companyId, nameEn: "Drinks", nameLo: "Drinks" },
        });
        await tx.product.update({ data: { categoryId: category.id }, where: { id: created[0].id } });
        const categoryHit = await getPrismaProductListPage(tenant, { categoryId: category.id, page: 1, pageSize: 25 }, tx);
        check("Category filter is server-wide", categoryHit.totalCount === 1 && categoryHit.products[0]?.id === created[0].id, `total=${categoryHit.totalCount}`);
        const fullList = await getPrismaProducts(tenant, tx);
        check("Non-paginated helper still returns all rows for other modules", fullList.length === 120, `rows=${fullList.length}`);
        const detail = await getPrismaProductById(created[0].id, tenant, tx);
        check("Focused detail loader still returns the product", Boolean(detail?.id === created[0].id));

        const inventoryPage = await getPrismaInventoryListPage(tenant, { page: 1, pageSize: 100 }, tx);
        check("Inventory first page is bounded", inventoryPage.items.length === 100, `rows=${inventoryPage.items.length}`);
        check("Inventory total count is catalog-wide", inventoryPage.totalCount === 120, `total=${inventoryPage.totalCount}`);
        const inventoryPage2 = await getPrismaInventoryListPage(tenant, { page: 2, pageSize: 100 }, tx);
        const inventoryPageIds = new Set(inventoryPage.items.map((row) => row.id));
        check("Inventory second page has no duplicate ids", inventoryPage2.items.every((row) => !inventoryPageIds.has(row.id)));
        check("Inventory pages cover the catalog", inventoryPage.items.length + inventoryPage2.items.length === 120, `sum=${inventoryPage.items.length + inventoryPage2.items.length}`);
        const snapshot = await getPrismaInventorySnapshot(tenant, tx);
        check("Stock Count snapshot still sees all slim rows", snapshot.items.length === 120, `rows=${snapshot.items.length}`);

        const foreign = await createIsolatedTenant(tx, "foreign");
        const foreignPage = await getPrismaProductListPage(foreign.tenant, { page: 1, pageSize: 100 }, tx);
        check("Tenant isolation: foreign company does not see scale catalog", foreignPage.totalCount === 0, `total=${foreignPage.totalCount}`);
        throw new RollbackError();
      },
      { maxWait: 20_000, timeout: 120_000 },
    );
  } catch (error) {
    if (!(error instanceof RollbackError)) {
      check("Isolated 120-row catalog transaction", false, error instanceof Error ? error.message : String(error));
    }
  }

  for (const size of catalogSizes) {
    try {
      await client.$transaction(
        async (tx) => {
          const { tenant, warehouseId } = await createIsolatedTenant(tx, `n${size}`);
          await seedCatalog(tx, tenant, warehouseId, size);
          const started = Date.now();
          const productPage = await getPrismaProductListPage(tenant, { page: 1, pageSize: 100 }, tx);
          const inventoryPage = await getPrismaInventoryListPage(tenant, { page: 1, pageSize: 100 }, tx);
          const elapsed = Date.now() - started;
          catalogResults[size] = {
            inventoryBytes: payloadBytes(inventoryPage.items),
            productBytes: payloadBytes(productPage.products),
            productRows: productPage.products.length,
          };
          check(`${size} products: first page stays at 100 rows`, productPage.products.length === 100 && inventoryPage.items.length === 100, `product=${productPage.products.length} inventory=${inventoryPage.items.length} ${elapsed}ms`);
          check(`${size} products: total count is ${size}`, productPage.totalCount === size && inventoryPage.totalCount === size, `productTotal=${productPage.totalCount} inventoryTotal=${inventoryPage.totalCount}`);
          throw new RollbackError();
        },
        { maxWait: 20_000, timeout: 180_000 },
      );
    } catch (error) {
      if (error instanceof RollbackError) continue;
      check(`${size} products catalog`, false, error instanceof Error ? error.message : String(error));
    }
  }

  if (catalogResults[100] && catalogResults[1000]) {
    const grew = catalogResults[1000].productBytes > catalogResults[100].productBytes * 3;
    check("First-page product payload does not grow linearly with catalog", !grew, `100=${catalogResults[100].productBytes}B 1000=${catalogResults[1000].productBytes}B`);
  }
  if (catalogResults[1000] && catalogResults[5000]) {
    const grew = catalogResults[5000].productBytes > catalogResults[1000].productBytes * 2;
    check("First-page product payload stays bounded at 5000", !grew, `1000=${catalogResults[1000].productBytes}B 5000=${catalogResults[5000].productBytes}B`);
  }

  await client.$disconnect();
  const failed = results.filter((row) => !row.ok);
  console.log(`\nPERF-09 list query: ${results.length - failed.length}/${results.length} PASS${failed.length ? ` (${failed.length} FAIL)` : ""}`);
  console.log(JSON.stringify({ catalogResults }, null, 2));
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
