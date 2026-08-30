import { existsSync, readFileSync } from "node:fs";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";

loadProjectEnvFiles();
const SCRIPT_DATABASE_URL = resolveScriptDatabaseUrl("test-write");

// Force production reads BEFORE loading env files (loader only sets unset keys).
process.env.IGO_DEMO_MODE = "false";

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
    if (key === "IGO_DEMO_MODE") continue;
    if (!process.env[key]) process.env[key] = value;
  }
}

const { PrismaClient } = await import("@prisma/client");
const { PrismaPg } = await import("@prisma/adapter-pg");
const { isDemoMode } = await import("../lib/demo-mode");
const { getPrismaPurchasingSnapshot } = await import("../features/purchasing/prisma-repository");
const { getPrismaInventorySnapshot } = await import("../features/inventory/prisma-repository");
const { mockSuppliers, mockPurchaseOrders, mockSupplierPayables } = await import("../features/purchasing/mock-data");
const { mockWarehouses, mockInventoryItems, mockStockMovements } = await import("../features/inventory/mock-data");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: SCRIPT_DATABASE_URL }) });

const COMPANY_ID = "gobox-company";
const WAREHOUSE_ID = "gobox-default-warehouse";
const BRANCH_ID = "gobox-main-branch";

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

// ---- 1. Static source checks: services must not import mock data or branch on demo mode ----
const purchasingServiceSrc = readFileSync("features/purchasing/purchasing-service.ts", "utf8");
const inventoryServiceSrc = readFileSync("features/inventory/inventory-service.ts", "utf8");

check("purchasing-service has no mock-data import", !/mock-data/.test(purchasingServiceSrc));
check("purchasing-service has no isDemoMode branch", !/isDemoMode/.test(purchasingServiceSrc));
check("purchasing-service calls getPrismaPurchasingSnapshot", /getPrismaPurchasingSnapshot/.test(purchasingServiceSrc));
check("inventory-service has no mock-data import", !/mock-data/.test(inventoryServiceSrc));
check("inventory-service has no isDemoMode branch", !/isDemoMode/.test(inventoryServiceSrc));
check("inventory-service calls getPrismaInventorySnapshot", /getPrismaInventorySnapshot/.test(inventoryServiceSrc));

// ---- 2. isDemoMode fail-safe default ----
const original = process.env.IGO_DEMO_MODE;
delete process.env.IGO_DEMO_MODE;
check("isDemoMode() defaults to false when unset", isDemoMode() === false, `value=${isDemoMode()}`);
process.env.IGO_DEMO_MODE = "true";
check('isDemoMode() === true only when "true"', isDemoMode() === true);
process.env.IGO_DEMO_MODE = "false";
check('isDemoMode() === false when "false"', isDemoMode() === false);
process.env.IGO_DEMO_MODE = original ?? "false";

// ---- 3. Runtime snapshots read live DB and never serve mock sentinels ----
const user = await prisma.user.findFirst({ where: { username: "igo-admin" } });
if (!user) {
  console.error("Missing seed data (user). Run: npm run db:seed:demo");
  process.exit(1);
}
const tenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: user.id, warehouseId: WAREHOUSE_ID };

const purchasing: any = await getPrismaPurchasingSnapshot(tenant);
const inventory: any = await getPrismaInventorySnapshot(tenant);

check("purchasing snapshot returned object", Boolean(purchasing) && Array.isArray(purchasing.purchaseOrders));
check("inventory snapshot returned object", Boolean(inventory) && Array.isArray(inventory.warehouses));

// NOTE: seed-demo.ts intentionally reuses the same canonical ids as the mock
// fixtures (e.g. sup-lao-bev, wh-main), so id-overlap does NOT indicate a mock
// fallback. The static checks above already prove the services cannot return
// the mock arrays. Here we prove the snapshots are a LIVE DB superset that
// includes rows the static mock fixtures do not contain (harness-created POs,
// the gobox-default-warehouse, etc.).
const mockPurchasingIds = new Set<string>([
  ...mockSuppliers.map((s: any) => s.id),
  ...mockPurchaseOrders.map((p: any) => p.id),
  ...mockSupplierPayables.map((p: any) => p.id),
]);
const livePurchaseOrderIds: string[] = purchasing.purchaseOrders.map((p: any) => p.id);
const dbOnlyPurchaseOrders = livePurchaseOrderIds.filter((id) => !mockPurchasingIds.has(id));
check(
  "purchasing snapshot is live DB (contains POs absent from mock fixtures)",
  dbOnlyPurchaseOrders.length > 0,
  `dbOnlyPOs=${dbOnlyPurchaseOrders.length}/${livePurchaseOrderIds.length}`,
);

const mockWarehouseIds = new Set<string>(mockWarehouses.map((w: any) => w.id));
check(
  "inventory snapshot is live DB (contains gobox-default-warehouse not in mock)",
  inventory.warehouses.some((w: any) => w.id === WAREHOUSE_ID) && !mockWarehouseIds.has(WAREHOUSE_ID),
  `warehouses=${inventory.warehouses.length}`,
);
// Inventory items/movements are returned with DB primary keys (cuid), not the
// mock fixture ids — confirm no mock item/movement id is being served.
const mockItemMovementIds = new Set<string>([
  ...mockInventoryItems.map((i: any) => i.id),
  ...mockStockMovements.map((m: any) => m.id),
]);
const itemMovementLeak = [
  ...inventory.items.map((i: any) => i.id),
  ...inventory.movements.map((m: any) => m.id),
].filter((id) => mockItemMovementIds.has(id));
check("inventory items/movements contain no mock fixture ids", itemMovementLeak.length === 0, `leaked=${itemMovementLeak.join(",") || "none"}`);

const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
console.log(`\nB7-4 demo-fallback: ${passed}/${results.length} PASS, ${failed} FAIL`);

await prisma.$disconnect();
process.exit(failed === 0 ? 0 : 1);
