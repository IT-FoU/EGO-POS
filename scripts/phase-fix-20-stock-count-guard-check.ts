import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyDatabaseUrl, fingerprintDatabaseUrl, PRODUCTION_DB_FINGERPRINT } from "../lib/db/database-target";
import { createScriptPrismaClient } from "../lib/db/script-prisma";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";
import { canPerformStoreAction, STORE_ACTIONS, STORE_ROLES } from "../features/permissions/store-permissions";
import { parseStockCountInput } from "../features/inventory/dto";
import { applyAtomicStockDelta } from "../features/inventory/stock-concurrency";
import {
  InventoryCountConflictError,
  STOCK_COUNT_CHANGED_MESSAGE,
  STOCK_COUNT_LOT_UNSUPPORTED_MESSAGE,
} from "../features/inventory/stock-count-errors";
import { t } from "../lib/i18n/ui";

process.env.IGO_DEMO_MODE = "false";
loadProjectEnvFiles();
const url = resolveScriptDatabaseUrl("dev-write");
const target = classifyDatabaseUrl(url);
const fingerprint = fingerprintDatabaseUrl(url);
if (target !== "LOCAL" || fingerprint === PRODUCTION_DB_FINGERPRINT || String(url).includes(PRODUCTION_DB_FINGERPRINT)) {
  throw new Error("REFUSING FIX-20: expected LOCAL DEVELOPMENT database");
}
if (!String(url).includes("igo_pos") || String(url).includes("igo_pos_test")) {
  throw new Error("REFUSING FIX-20: expected igo_pos development database");
}

const prisma = createScriptPrismaClient("dev-write");
(globalThis as unknown as { prisma?: typeof prisma }).prisma = prisma;

const { createStockCount, createStockIn, getPrismaInventorySnapshot } = await import("../features/inventory/prisma-repository");

const COMPANY_ID = "gobox-company";
const BRANCH_ID = "gobox-main-branch";
const WAREHOUSE_ID = "gobox-default-warehouse";
const PREFIX = `fix20-${Date.now()}`;

type Tenant = { branchId: string; companyId: string; userId: string; warehouseId: string };
const results: Array<{ name: string; ok: boolean; detail: string }> = [];

function check(name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function expectConflict(name: string, fn: () => Promise<unknown>, code: string) {
  try {
    await fn();
    check(name, false, "expected conflict but none was thrown");
  } catch (error) {
    const ok =
      error instanceof InventoryCountConflictError &&
      error.code === code &&
      !/SELECT |FROM inventory_|PrismaClient/i.test(error.message);
    check(name, ok, error instanceof Error ? `${(error as InventoryCountConflictError).code ?? ""} ${error.message}` : String(error));
  }
}

async function expectThrow(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(name, false, "expected an error but none was thrown");
  } catch (error) {
    check(name, true, error instanceof Error ? error.message : String(error));
  }
}

async function stockOf(productId: string, warehouseId = WAREHOUSE_ID) {
  const row = await prisma.inventoryBalance.findUnique({
    where: { warehouseId_productId: { productId, warehouseId } },
  });
  return Number(row?.quantity ?? 0);
}

async function countMoves(productId: string, warehouseId = WAREHOUSE_ID) {
  return prisma.stockMovement.count({
    where: { productId, warehouseId, referenceType: "stock_count" },
  });
}

async function setBalance(productId: string, quantity: number, warehouseId = WAREHOUSE_ID) {
  await prisma.inventoryBalance.upsert({
    create: { companyId: COMPANY_ID, productId, quantity, warehouseId },
    update: { quantity },
    where: { warehouseId_productId: { productId, warehouseId } },
  });
}

async function makeProduct(name: string, suffix: string, cost = 1000) {
  return prisma.product.create({
    data: {
      barcode: `${PREFIX}-${suffix}-bc`,
      branchId: BRANCH_ID,
      companyId: COMPANY_ID,
      costPriceLak: cost,
      id: `${PREFIX}-${suffix}`,
      isActive: true,
      minStock: 0,
      nameEn: name,
      nameLo: name,
      productCode: `${PREFIX}-${suffix}-code`,
      sellingPriceLak: cost * 2,
      sku: `${PREFIX}-${suffix}-sku`,
      status: "active",
    },
  });
}

async function addPiece(productId: string, suffix: string, cost = 1000) {
  return prisma.productUnit.create({
    data: {
      conversionQty: 1,
      costPriceLak: cost,
      id: `${PREFIX}-${suffix}-piece`,
      isBaseUnit: true,
      isDefaultSaleUnit: true,
      isPurchaseUnit: true,
      productId,
      sellingPriceLak: cost * 2,
      status: "active",
      unitName: "Piece",
    },
  });
}

const owner = await prisma.user.findFirst({ where: { username: "igo-admin" } });
if (!owner) throw new Error("Missing igo-admin on local igo_pos");
const tenant: Tenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: owner.id, warehouseId: WAREHOUSE_ID };
const foreignTenant: Tenant = { ...tenant, companyId: "not-gobox-company" };

check("ENV local igo_pos", target === "LOCAL" && fingerprint === "localhost");

const formSrc = readFileSync(join(process.cwd(), "features/inventory/components/inventory-action-form.tsx"), "utf8");
const countSrc = readFileSync(join(process.cwd(), "features/inventory/stock-concurrency.ts"), "utf8");
check("UI submits displayed expectedSystemQuantity", formSrc.includes("expectedSystemQuantity: selectedItem.quantity"));
check("UI does not auto-resubmit", !formSrc.includes("stockCountAction") || formSrc.includes("router.refresh()"));
check("Stale check uses FOR UPDATE", countSrc.includes("FOR UPDATE") && countSrc.includes("INVENTORY_CHANGED"));
check("Lot block uses quantity > 0", countSrc.includes("quantity: { gt: 0 }"));

const salesBefore = await prisma.sale.count({ where: { companyId: COMPANY_ID } });
const cashBefore = await prisma.cashTransaction.count();

const water = await makeProduct("FIX20 COUNT WATER", "water");
await addPiece(water.id, "water");
await setBalance(water.id, 100);

await expectThrow("Missing expectedSystemQuantity rejected", () =>
  createStockCount({ countedQuantity: 100, productId: water.id, warehouseId: WAREHOUSE_ID } as never, tenant),
);

const exact = await createStockCount(
  { countedQuantity: 100, expectedSystemQuantity: 100, note: "exact", productId: water.id, warehouseId: WAREHOUSE_ID },
  tenant,
);
check("Exact no-variance 100→100", exact.beforeQty === 100 && exact.afterQty === 100 && (await stockOf(water.id)) === 100);
check("Exact no-variance movement 0", (await countMoves(water.id)) === 0);

await prisma.$transaction(async (tx) => {
  await applyAtomicStockDelta(tx, {
    companyId: COMPANY_ID,
    productId: water.id,
    quantityDelta: -2,
    warehouseId: WAREHOUSE_ID,
  });
});
check("Intervening -2 leaves 98", (await stockOf(water.id)) === 98);
const movesBeforeStale = await countMoves(water.id);
await expectConflict(
  "Stale 100/100 against 98 rejected",
  () =>
    createStockCount(
      { countedQuantity: 100, expectedSystemQuantity: 100, note: "stale", productId: water.id, warehouseId: WAREHOUSE_ID },
      tenant,
    ),
  "INVENTORY_CHANGED",
);
check("Stale reject stock stays 98", (await stockOf(water.id)) === 98);
check("Stale reject count movement 0", (await countMoves(water.id)) === movesBeforeStale);

const refreshExact = await createStockCount(
  { countedQuantity: 98, expectedSystemQuantity: 98, note: "refresh exact", productId: water.id, warehouseId: WAREHOUSE_ID },
  tenant,
);
check("Refresh then exact 98", refreshExact.beforeQty === 98 && refreshExact.afterQty === 98 && (await stockOf(water.id)) === 98);

const plusAfterRefresh = await createStockCount(
  { countedQuantity: 100, expectedSystemQuantity: 98, note: "+2 after refresh", productId: water.id, warehouseId: WAREHOUSE_ID },
  tenant,
);
check("Variance after refresh 98→100", plusAfterRefresh.beforeQty === 98 && plusAfterRefresh.afterQty === 100 && (await stockOf(water.id)) === 100);
check("Variance after refresh one +2 movement", Number((await prisma.stockMovement.findFirst({
  where: { productId: water.id, referenceType: "stock_count" },
  orderBy: { createdAt: "desc" },
}))?.quantity) === 2);

await setBalance(water.id, 100);
const negative = await createStockCount(
  { countedQuantity: 97, expectedSystemQuantity: 100, note: "-3", productId: water.id, warehouseId: WAREHOUSE_ID },
  tenant,
);
check("Negative variance 100→97", negative.beforeQty === 100 && negative.afterQty === 97 && (await stockOf(water.id)) === 97);

await setBalance(water.id, 10);
const toZero = await createStockCount(
  { countedQuantity: 0, expectedSystemQuantity: 10, note: "zero", productId: water.id, warehouseId: WAREHOUSE_ID },
  tenant,
);
check("Zero physical 10→0", toZero.afterQty === 0 && (await stockOf(water.id)) === 0);
await expectThrow("Invalid negative blocked", () =>
  createStockCount(
    { countedQuantity: -1, expectedSystemQuantity: 0, note: "bad", productId: water.id, warehouseId: WAREHOUSE_ID },
    tenant,
  ),
);

await setBalance(water.id, 100);
const firstPlus = await createStockCount(
  { countedQuantity: 105, expectedSystemQuantity: 100, note: "first 105", productId: water.id, warehouseId: WAREHOUSE_ID },
  tenant,
);
const movesAfterFirst = await countMoves(water.id);
await expectConflict(
  "Duplicate submit with stale expected 100 rejected",
  () =>
    createStockCount(
      { countedQuantity: 105, expectedSystemQuantity: 100, note: "dup", productId: water.id, warehouseId: WAREHOUSE_ID },
      tenant,
    ),
  "INVENTORY_CHANGED",
);
check("Duplicate stays 105 with one adjustment", firstPlus.afterQty === 105 && (await stockOf(water.id)) === 105 && (await countMoves(water.id)) === movesAfterFirst);

await setBalance(water.id, 100);
const saleVsCount = await Promise.allSettled([
  prisma.$transaction((tx) =>
    applyAtomicStockDelta(tx, { companyId: COMPANY_ID, productId: water.id, quantityDelta: -1, warehouseId: WAREHOUSE_ID }),
  ),
  createStockCount(
    { countedQuantity: 100, expectedSystemQuantity: 100, note: "vs sale", productId: water.id, warehouseId: WAREHOUSE_ID },
    tenant,
  ),
]);
const afterSaleRace = await stockOf(water.id);
const saleWon = saleVsCount[0].status === "fulfilled";
const countWon = saleVsCount[1].status === "fulfilled";
const countStale =
  saleVsCount[1].status === "rejected" &&
  saleVsCount[1].reason instanceof InventoryCountConflictError &&
  saleVsCount[1].reason.code === "INVENTORY_CHANGED";
check(
  "Sale vs Count serializes; final never 100 if sale committed",
  saleWon && ((countWon && afterSaleRace === 99) || (countStale && afterSaleRace === 99)),
  `sale=${saleVsCount[0].status} count=${saleVsCount[1].status} final=${afterSaleRace}`,
);

await setBalance(water.id, 100);
const inVsCount = await Promise.allSettled([
  prisma.$transaction((tx) =>
    applyAtomicStockDelta(tx, { companyId: COMPANY_ID, productId: water.id, quantityDelta: 5, warehouseId: WAREHOUSE_ID }),
  ),
  createStockCount(
    { countedQuantity: 100, expectedSystemQuantity: 100, note: "vs stock in", productId: water.id, warehouseId: WAREHOUSE_ID },
    tenant,
  ),
]);
const afterInRace = await stockOf(water.id);
const inWon = inVsCount[0].status === "fulfilled";
const countInWon = inVsCount[1].status === "fulfilled";
const countInStale =
  inVsCount[1].status === "rejected" &&
  inVsCount[1].reason instanceof InventoryCountConflictError;
check(
  "Stock In vs Count serializes; final never 100 if stock-in committed",
  inWon && ((countInWon && afterInRace === 105) || (countInStale && afterInRace === 105)),
  `in=${inVsCount[0].status} count=${inVsCount[1].status} final=${afterInRace}`,
);

await setBalance(water.id, 100);
const twoCounts = await Promise.allSettled([
  createStockCount(
    { countedQuantity: 105, expectedSystemQuantity: 100, note: "A", productId: water.id, warehouseId: WAREHOUSE_ID },
    tenant,
  ),
  createStockCount(
    { countedQuantity: 110, expectedSystemQuantity: 100, note: "B", productId: water.id, warehouseId: WAREHOUSE_ID },
    tenant,
  ),
]);
const afterTwo = await stockOf(water.id);
const fulfilled = twoCounts.filter((row) => row.status === "fulfilled").length;
const rejectedStale = twoCounts.filter(
  (row) => row.status === "rejected" && row.reason instanceof InventoryCountConflictError && row.reason.code === "INVENTORY_CHANGED",
).length;
check(
  "Two counts: one succeeds, second stale, no silent last-write-wins",
  fulfilled === 1 && rejectedStale === 1 && (afterTwo === 105 || afterTwo === 110),
  `fulfilled=${fulfilled} stale=${rejectedStale} final=${afterTwo}`,
);

const lotProduct = await makeProduct("FIX20 LOT", "lot", 1500);
const lotPiece = await addPiece(lotProduct.id, "lot", 1500);
await createStockIn(
  {
    expiryDate: new Date("2027-12-31T00:00:00.000Z").toISOString(),
    lotNumber: `${PREFIX}-A`,
    productId: lotProduct.id,
    quantity: 12,
    unitCostLak: 1500,
    unitId: lotPiece.id,
    warehouseId: WAREHOUSE_ID,
  },
  tenant,
);
await createStockIn(
  {
    expiryDate: new Date("2027-11-30T00:00:00.000Z").toISOString(),
    lotNumber: `${PREFIX}-B`,
    productId: lotProduct.id,
    quantity: 8,
    unitCostLak: 1500,
    unitId: lotPiece.id,
    warehouseId: WAREHOUSE_ID,
  },
  tenant,
);
check("Lot product aggregate 20", (await stockOf(lotProduct.id)) === 20);
const lotMovesBefore = await countMoves(lotProduct.id);
await expectConflict(
  "Lot product count blocked",
  () =>
    createStockCount(
      { countedQuantity: 18, expectedSystemQuantity: 20, note: "lot block", productId: lotProduct.id, warehouseId: WAREHOUSE_ID },
      tenant,
    ),
  "INVENTORY_LOT_COUNT_UNSUPPORTED",
);
const lotsAfter = await prisma.inventoryLot.findMany({ where: { productId: lotProduct.id } });
check("Lot count did not change aggregate", (await stockOf(lotProduct.id)) === 20);
check(
  "Lot quantities unchanged",
  lotsAfter.some((row) => row.lotNumber === `${PREFIX}-A` && Number(row.quantity) === 12) &&
    lotsAfter.some((row) => row.lotNumber === `${PREFIX}-B` && Number(row.quantity) === 8),
);
check("Lot reject movement 0", (await countMoves(lotProduct.id)) === lotMovesBefore);

const exhausted = await makeProduct("FIX20 EXHAUSTED LOT", "exh");
await addPiece(exhausted.id, "exh");
await setBalance(exhausted.id, 20);
await prisma.inventoryLot.create({
  data: {
    companyId: COMPANY_ID,
    lotNumber: `${PREFIX}-ZERO`,
    productId: exhausted.id,
    quantity: 0,
    warehouseId: WAREHOUSE_ID,
  },
});
const exhaustedCount = await createStockCount(
  { countedQuantity: 18, expectedSystemQuantity: 20, note: "zero lot allowed", productId: exhausted.id, warehouseId: WAREHOUSE_ID },
  tenant,
);
check("Zero-qty historical lot does not block", exhaustedCount.afterQty === 18 && (await stockOf(exhausted.id)) === 18);

const warehouseB = await prisma.warehouse.create({
  data: { branchId: BRANCH_ID, companyId: COMPANY_ID, id: `${PREFIX}-wh-b`, name: "FIX20 WH B", type: "store" },
});
const iso = await makeProduct("FIX20 ISO", "iso");
await addPiece(iso.id, "iso");
await setBalance(iso.id, 100, WAREHOUSE_ID);
await setBalance(iso.id, 50, warehouseB.id);
await prisma.$transaction((tx) =>
  applyAtomicStockDelta(tx, { companyId: COMPANY_ID, productId: iso.id, quantityDelta: -5, warehouseId: WAREHOUSE_ID }),
);
const isoB = await createStockCount(
  { countedQuantity: 48, expectedSystemQuantity: 50, note: "B count", productId: iso.id, warehouseId: warehouseB.id },
  tenant,
);
check("Warehouse A movement does not stale Warehouse B", isoB.afterQty === 48 && (await stockOf(iso.id, warehouseB.id)) === 48);
check("Warehouse A remains 95", (await stockOf(iso.id, WAREHOUSE_ID)) === 95);

await expectThrow("Wrong tenant blocked", () =>
  createStockCount(
    { countedQuantity: 1, expectedSystemQuantity: 0, productId: water.id, warehouseId: WAREHOUSE_ID },
    foreignTenant,
  ),
);

check("Owner allowed", canPerformStoreAction({ role: STORE_ROLES.OWNER }, STORE_ACTIONS.INVENTORY_COUNT));
check("Manager allowed", canPerformStoreAction({ role: STORE_ROLES.MANAGER }, STORE_ACTIONS.INVENTORY_COUNT));
check("Cashier blocked", !canPerformStoreAction({ role: STORE_ROLES.CASHIER }, STORE_ACTIONS.INVENTORY_COUNT));

const cost = Number((await prisma.product.findUniqueOrThrow({ where: { id: water.id } })).costPriceLak);
check("Product cost unchanged", cost === 1000);
check("No sale created", (await prisma.sale.count({ where: { companyId: COMPANY_ID } })) === salesBefore);
check("No cash created", (await prisma.cashTransaction.count()) === cashBefore);

const snap = (await getPrismaInventorySnapshot(tenant)).items.find((item) => item.productId === water.id && item.warehouseId === WAREHOUSE_ID);
check("Snapshot matches warehouse", Number(snap?.quantity) === (await stockOf(water.id)));

check("EN locale stale", t("ui.stock.count.changed", "en") === STOCK_COUNT_CHANGED_MESSAGE);
check("Legacy th stale stays English", t("ui.stock.count.changed", "th") === STOCK_COUNT_CHANGED_MESSAGE);
check("EN locale lot", t("ui.stock.count.lot.unsupported", "en") === STOCK_COUNT_LOT_UNSUPPORTED_MESSAGE);
const lo = JSON.parse(readFileSync(join(process.cwd(), "locales/ui/lo.json"), "utf8")) as Record<string, string>;
check("Lao source stale present", Boolean(lo["ui.stock.count.changed"]) && !lo["ui.stock.count.changed"].includes("\uFFFD"));
check("Lao source lot present", Boolean(lo["ui.stock.count.lot.unsupported"]) && !lo["ui.stock.count.lot.unsupported"].includes("\uFFFD"));

const failed = results.filter((row) => !row.ok);
console.log(
  JSON.stringify(
    {
      db: "igo_pos",
      target,
      prefix: PREFIX,
      saleVsCount: { sale: saleVsCount[0].status, count: saleVsCount[1].status, final: afterSaleRace },
      stockInVsCount: { stockIn: inVsCount[0].status, count: inVsCount[1].status, final: afterInRace },
      twoCounts: { fulfilled, rejectedStale, final: afterTwo },
      failed: failed.map((row) => row.name),
      passed: results.filter((row) => row.ok).length,
      total: results.length,
    },
    null,
    2,
  ),
);

await prisma.$disconnect();
process.exit(failed.length ? 1 : 0);
