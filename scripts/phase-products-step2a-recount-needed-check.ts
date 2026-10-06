/**
 * STEP 2A recount-needed state.
 * Run: npx tsx scripts/phase-products-step2a-recount-needed-check.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STORE_ACTIONS, STORE_ROLES, hasStorePermission } from "../features/permissions/store-permissions";
import { inventoryCopyKeyParity, tInventory } from "../lib/i18n/inventory-copy";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed += 1;
    console.log(`PASS ${name}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const schema = read("prisma/schema.prisma");
const migration = read("prisma/migrations/20261006152000_inventory_balance_recount_needed/migration.sql");
const repo = read("features/inventory/prisma-repository.ts");
const actions = read("features/inventory/actions.ts");
const countRoute = read("app/api/inventory/count/route.ts");
const sale = read("features/pos/post-sale-repository.ts");
const stockIn = read("features/inventory/prisma-repository.ts").slice(0, repo.indexOf("export async function createStockAdjustment"));
const concurrency = read("features/inventory/stock-concurrency.ts");
const mapper = read("features/inventory/dto-mapper.ts");
const list = read("features/inventory/list-query.ts");
const table = read("features/inventory/components/stock-overview-table.tsx");
const page = read("features/inventory/components/inventory-page-client.tsx");

const balance = schema.slice(schema.indexOf("model InventoryBalance"), schema.indexOf("model ReorderManualItem"));
check("balance has recountNeeded default false", balance.includes("recountNeeded") && balance.includes("@default(false)") && balance.includes('recount_needed'));
check("flag is not on Product", !schema.slice(schema.indexOf("model Product "), schema.indexOf("model ProductUnit")).includes("recountNeeded"));
check("flag is not on StockMovement", !schema.slice(schema.indexOf("model StockMovement"), schema.indexOf("model StockAdjustment")).includes("recountNeeded"));

const sql = migration.replace(/--.*$/gm, "");
check("migration adds recount_needed", sql.includes("ADD COLUMN IF NOT EXISTS \"recount_needed\" BOOLEAN NOT NULL DEFAULT false"));
check("migration does not rewrite rows", !/UPDATE|DELETE|DROP/i.test(sql));

const quick = actions.slice(actions.indexOf("export async function quickStockFixAction"), actions.indexOf("export async function stockCountAction"));
const countAction = actions.slice(actions.indexOf("export async function stockCountAction"), actions.indexOf("export async function loadProductStockSnapshotAction"));
const adjustAction = actions.slice(actions.indexOf("export async function stockAdjustmentAction"), actions.indexOf("export async function quickStockFixAction"));
const productAdjust = actions.slice(actions.indexOf("export async function adjustProductStockAction"));

check("quick fix marks recount through createStockAdjustment", quick.includes("markRecountNeeded: true") && quick.includes("createStockAdjustment(") && !quick.includes("createStockIn("));
check("ordinary adjustment does not mark or clear recount", !adjustAction.includes("markRecountNeeded") && !adjustAction.includes("clearRecountNeeded"));
check("stock count clears recount", countAction.includes("clearRecountNeeded: true") && countAction.includes("INVENTORY_COUNT"));
check("product edit adjust does not clear recount", !productAdjust.includes("clearRecountNeeded"));
check("count API clears recount behind inventory.count", countRoute.includes("clearRecountNeeded: true") && countRoute.includes("inventoryCount"));

const adjustmentFn = repo.slice(repo.indexOf("export async function createStockAdjustment"), repo.indexOf("export async function createStockCount"));
const countFn = repo.slice(repo.indexOf("export async function createStockCount"), repo.indexOf("export async function adjustProductStockToActual"));
check("recount mark is inside the adjustment transaction", adjustmentFn.indexOf("applyAtomicStockDelta") < adjustmentFn.indexOf("recountNeeded: true"));
check("recount clear is inside the count transaction", countFn.includes("recountNeeded: false") && countFn.indexOf("setAtomicStockCount") < countFn.indexOf("recountNeeded: false"));
check("zero-delta count still clears before return", countFn.indexOf("recountNeeded: false") < countFn.indexOf("if (quantity === 0)"));
check("sale path does not touch recount", !sale.includes("recountNeeded"));
check("stock in path does not touch recount", !stockIn.includes("recountNeeded"));
check("quantity mutation does not reset recount", !concurrency.includes("recountNeeded"));
check("mapper reads the balance flag", mapper.includes("recountNeeded: Boolean(balance.recountNeeded)"));
check("list filter is warehouse-balance scoped", list.includes("recount_needed") && list.includes("recount_needed"));
check("inventory badge and filter are present", table.includes("RecountNeededBadge") && page.includes('setStockFilter("recount_needed")'));

check("cashier cannot adjust", !hasStorePermission(STORE_ROLES.CASHIER, STORE_ACTIONS.INVENTORY_ADJUST));
check("cashier cannot count", !hasStorePermission(STORE_ROLES.CASHIER, STORE_ACTIONS.INVENTORY_COUNT));
check("owner can adjust and count", hasStorePermission(STORE_ROLES.OWNER, STORE_ACTIONS.INVENTORY_ADJUST) && hasStorePermission(STORE_ROLES.OWNER, STORE_ACTIONS.INVENTORY_COUNT));
check("inventory copy parity", inventoryCopyKeyParity());
for (const key of ["recountNeeded", "needsStockCount", "stockCountCompleted", "recountStatus", "filterRecountNeeded"]) {
  const en = tInventory(key, "en");
  const lo = tInventory(key, "lo");
  check(`${key} en/lo`, en !== key && lo !== key && en !== lo && !/[A-Za-z]/.test(lo));
}

if (failed > 0) {
  console.error(`\nSTEP 2A recount: ${passed} passed, ${failed} failed`);
  process.exit(1);
}
console.log(`\nSTEP 2A recount: ${passed} passed, 0 failed`);
