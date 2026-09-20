import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyDatabaseUrl, fingerprintDatabaseUrl, PRODUCTION_DB_FINGERPRINT } from "../lib/db/database-target";
import { createScriptPrismaClient } from "../lib/db/script-prisma";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";
import { canPerformStoreAction, STORE_ACTIONS, STORE_ROLES } from "../features/permissions/store-permissions";
import {
  InventoryCountConflictError,
  STOCK_COUNT_LOT_UNSUPPORTED_MESSAGE,
  STOCK_RESERVED_FLOOR_MESSAGE,
} from "../features/inventory/stock-count-errors";
import { inventoryCopyKeyParity } from "../lib/i18n/inventory-copy";
import { productsCopyKeyParity } from "../lib/i18n/products-copy";

process.env.IGO_DEMO_MODE = "false";
loadProjectEnvFiles();
const url = resolveScriptDatabaseUrl("dev-write");
const target = classifyDatabaseUrl(url);
const fingerprint = fingerprintDatabaseUrl(url);
if (target !== "LOCAL" || fingerprint === PRODUCTION_DB_FINGERPRINT || String(url).includes(PRODUCTION_DB_FINGERPRINT)) {
  throw new Error("REFUSING edit-product stock tests: expected LOCAL DEVELOPMENT database.");
}

const prisma = createScriptPrismaClient("dev-write");
(globalThis as unknown as { prisma?: typeof prisma }).prisma = prisma;

const { createPrismaProduct, updatePrismaProduct } = await import("../features/products/prisma-repository");
const {
  adjustProductStockToActual,
  createStockIn,
  getPrismaProductStockSnapshot,
} = await import("../features/inventory/prisma-repository");
const { listSellablePosProducts } = await import("../features/pos/prisma-repository");

const COMPANY_ID = "gobox-company";
const BRANCH_ID = "gobox-main-branch";
const WAREHOUSE_ID = "gobox-default-warehouse";
const PREFIX = `edit-stock-${Date.now().toString(36)}`;

type Tenant = { branchId: string; companyId: string; userId: string; warehouseId: string };
const results: Array<{ detail?: string; name: string; ok: boolean }> = [];

function check(name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function qty(value: unknown) {
  return Math.round(Number(value ?? 0) * 1000) / 1000;
}

function assertClose(actual: unknown, expected: number, message: string) {
  if (Math.abs(qty(actual) - expected) > 1e-9) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

async function expectThrow(name: string, fn: () => Promise<unknown>, includes?: string) {
  try {
    await fn();
    check(name, false, "expected an error but none was thrown");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const ok = includes ? message.toLowerCase().includes(includes.toLowerCase()) : true;
    check(name, ok, message);
  }
}

async function stockOf(productId: string) {
  const row = await prisma.inventoryBalance.findUnique({
    where: { warehouseId_productId: { productId, warehouseId: WAREHOUSE_ID } },
  });
  return qty(row?.quantity);
}

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const form = read("features/products/components/product-form.tsx");
const editPage = read("app/(dashboard)/products/[productId]/edit/page.tsx");
const panel = read("features/products/components/product-stock-lot-panel.tsx");
const productRepo = read("features/products/prisma-repository.ts");
const inventoryRepo = read("features/inventory/prisma-repository.ts");
const inventoryActions = read("features/inventory/actions.ts");

check("1. Edit Product shows Stock & Lot Tracking", form.includes("<ProductStockLotPanel") && form.includes('t("stockLotTracking")') === false && panel.includes('t("stockLotTracking")') && editPage.includes("stockSnapshot") && form.includes("InitialStockPreview") && form.includes('mode === "create" && openingQuantity > 0'));
check("Create keeps Initial Stock & Lot Tracking", form.includes("<InitialStockPreview") && form.includes('t("initialStockLot")'));
check("Product Save payload does not send initialStock on edit", form.includes('initialStock: mode === "create" && openingQuantity > 0'));
check("Product update does not call writeStockIn", !/async function writePrismaProductUpdate[\s\S]*writeStockIn/.test(productRepo));
check("Add Stock reuses writeStockIn / stockInAction", panel.includes("stockInAction") && inventoryRepo.includes("export async function writeStockIn"));
check("Adjust Stock reuses createStockCount via adjustProductStockToActual", panel.includes("adjustProductStockAction") && inventoryActions.includes("adjustProductStockToActual") && inventoryRepo.includes("return createStockCount("));
check("Adjust requires reason server-side", inventoryRepo.includes('throw new Error("Stock adjustment reason is required.")'));
check("Reservation floor is in count and adjustment engines", inventoryRepo.includes("assertNotBelowReserved") && inventoryRepo.includes("STOCK_RESERVED_FLOOR_MESSAGE"));
check("Owner/Manager/Cashier permission wiring", inventoryActions.includes("STORE_ACTIONS.INVENTORY_STOCK_IN") && inventoryActions.includes("STORE_ACTIONS.INVENTORY_ADJUST") && canPerformStoreAction({ role: STORE_ROLES.OWNER }, STORE_ACTIONS.INVENTORY_ADJUST) && canPerformStoreAction({ role: STORE_ROLES.MANAGER }, STORE_ACTIONS.INVENTORY_ADJUST) && !canPerformStoreAction({ role: STORE_ROLES.CASHIER }, STORE_ACTIONS.INVENTORY_ADJUST) && !canPerformStoreAction({ role: STORE_ROLES.CASHIER }, STORE_ACTIONS.INVENTORY_STOCK_IN));
check("i18n key parity", productsCopyKeyParity() && inventoryCopyKeyParity());

if (!existsSync(join(process.cwd(), "features/products/components/product-stock-lot-panel.tsx"))) {
  throw new Error("missing product-stock-lot-panel");
}

const ownerUser = await prisma.user.findFirst({ where: { username: "igo-admin" } });
if (!ownerUser) {
  throw new Error("igo-admin was not found");
}
const ownerTenant: Tenant = {
  branchId: BRANCH_ID,
  companyId: COMPANY_ID,
  userId: ownerUser.id,
  warehouseId: WAREHOUSE_ID,
};

const units = [
  {
    conversionQty: 1,
    costPriceLak: 1000,
    isBaseUnit: true,
    isDefaultSaleUnit: true,
    isPurchaseUnit: true,
    sellingPriceLak: 1500,
    sortOrder: 0,
    unitName: "Piece",
  },
  {
    conversionQty: 10,
    costPriceLak: 10000,
    isPurchaseUnit: true,
    sellingPriceLak: 14000,
    sortOrder: 1,
    unitName: "Pack",
  },
  {
    conversionQty: 60,
    costPriceLak: 60000,
    isPurchaseUnit: true,
    sellingPriceLak: 80000,
    sortOrder: 2,
    unitName: "Box",
  },
];

const plain = await createPrismaProduct(
  {
    nameLo: `${PREFIX} plain`,
    nameEn: `${PREFIX} plain`,
    sku: `${PREFIX}-plain`,
    sellingPriceLak: 1500,
    costPriceLak: 1000,
    units,
    initialStock: { quantity: 24, unitName: "Piece", note: "Opening stock from product create" },
  },
  ownerTenant,
);
const lotProduct = await createPrismaProduct(
  {
    nameLo: `${PREFIX} lot`,
    nameEn: `${PREFIX} lot`,
    sku: `${PREFIX}-lot`,
    sellingPriceLak: 1500,
    costPriceLak: 1000,
    units,
    initialStock: {
      expiryDate: "2027-01-01",
      lotNumber: "LOT-A",
      note: "Opening stock from product create",
      quantity: 12,
      unitName: "Piece",
    },
  },
  ownerTenant,
);

const plainPiece = plain.units.find((unit) => unit.unitName === "Piece")!;
const plainPack = plain.units.find((unit) => unit.unitName === "Pack")!;
const plainBox = plain.units.find((unit) => unit.unitName === "Box")!;

let snap = await getPrismaProductStockSnapshot(plain.id, ownerTenant);
const row = snap.warehouses.find((item) => item.warehouseId === WAREHOUSE_ID);
check("2. correct On Hand", Boolean(row) && qty(row?.onHand) === 24, `onHand=${row?.onHand}`);
check("3. correct Reserved", Boolean(row) && qty(row?.reserved) === 0, `reserved=${row?.reserved}`);
check("4. correct Available", Boolean(row) && qty(row?.available) === 24, `available=${row?.available}`);

const beforeMoves = await prisma.stockMovement.count({ where: { productId: plain.id } });
const beforeQty = await stockOf(plain.id);
await createStockIn(
  { note: "edit product add stock", productId: plain.id, quantity: 1, unitId: plainPiece.id, warehouseId: WAREHOUSE_ID },
  ownerTenant,
);
check("5. Add Stock increases stock once", (await stockOf(plain.id)) === beforeQty + 1);
check("6. stock history records movement", (await prisma.stockMovement.count({ where: { productId: plain.id } })) === beforeMoves + 1);

await expectThrow("10. invalid negative stock blocked", () =>
  adjustProductStockToActual(
    { countedQuantity: -1, expectedSystemQuantity: beforeQty + 1, productId: plain.id, reason: "negative", warehouseId: WAREHOUSE_ID },
    ownerTenant,
  ),
);

const onHandBeforeDown = await stockOf(plain.id);
await adjustProductStockToActual(
  {
    countedQuantity: onHandBeforeDown - 2,
    expectedSystemQuantity: onHandBeforeDown,
    productId: plain.id,
    reason: "cycle count down",
    unitId: plainPiece.id,
    warehouseId: WAREHOUSE_ID,
  },
  ownerTenant,
);
check("7. Adjust downward works", (await stockOf(plain.id)) === onHandBeforeDown - 2);

const onHandBeforeUp = await stockOf(plain.id);
await adjustProductStockToActual(
  {
    countedQuantity: onHandBeforeUp + 3,
    expectedSystemQuantity: onHandBeforeUp,
    productId: plain.id,
    reason: "cycle count up",
    unitId: plainPiece.id,
    warehouseId: WAREHOUSE_ID,
  },
  ownerTenant,
);
check("8. Adjust upward works", (await stockOf(plain.id)) === onHandBeforeUp + 3);

const onHandBeforeReason = await stockOf(plain.id);
await expectThrow(
  "9. required reason works",
  () =>
    adjustProductStockToActual(
      {
        countedQuantity: onHandBeforeReason,
        expectedSystemQuantity: onHandBeforeReason,
        productId: plain.id,
        reason: "   ",
        warehouseId: WAREHOUSE_ID,
      },
      ownerTenant,
    ),
  "reason",
);

const hold = await prisma.holdBill.create({
  data: {
    branchId: BRANCH_ID,
    cashierId: ownerUser.id,
    companyId: COMPANY_ID,
    holdNo: `${PREFIX}-hold`,
    status: "held",
    warehouseId: WAREHOUSE_ID,
    items: {
      create: {
        lineTotal: 9000,
        productId: plain.id,
        quantity: 6,
        sellingPrice: 1500,
      },
    },
  },
  include: { items: true },
});
await prisma.stockReservation.create({
  data: {
    baseQuantity: 6,
    branchId: BRANCH_ID,
    companyId: COMPANY_ID,
    holdBillId: hold.id,
    holdBillItemId: hold.items[0].id,
    productId: plain.id,
    status: "ACTIVE",
    warehouseId: WAREHOUSE_ID,
  },
});

snap = await getPrismaProductStockSnapshot(plain.id, ownerTenant);
const reservedRow = snap.warehouses.find((item) => item.warehouseId === WAREHOUSE_ID);
check("Reserved snapshot after hold", Boolean(reservedRow) && qty(reservedRow?.reserved) === 6 && qty(reservedRow?.available) === Math.max(0, qty(reservedRow?.onHand) - 6), `onHand=${reservedRow?.onHand} reserved=${reservedRow?.reserved} available=${reservedRow?.available}`);

try {
  await adjustProductStockToActual(
    {
      countedQuantity: 5,
      expectedSystemQuantity: reservedRow?.onHand ?? 0,
      productId: plain.id,
      reason: "below reserved",
      warehouseId: WAREHOUSE_ID,
    },
    ownerTenant,
  );
  check("11. reservation safety", false, "expected reserved-floor error");
} catch (error) {
  const ok =
    error instanceof InventoryCountConflictError &&
    error.code === "INVENTORY_RESERVED_FLOOR" &&
    error.message === STOCK_RESERVED_FLOOR_MESSAGE;
  check("11. reservation safety", ok, error instanceof Error ? error.message : String(error));
}

const onHandForUnits = await stockOf(plain.id);
await createStockIn({ productId: plain.id, quantity: 2, unitId: plainPiece.id, warehouseId: WAREHOUSE_ID }, ownerTenant);
check("12. Piece conversion", (await stockOf(plain.id)) === onHandForUnits + 2);
const afterPiece = await stockOf(plain.id);
await createStockIn({ productId: plain.id, quantity: 1, unitId: plainPack.id, warehouseId: WAREHOUSE_ID }, ownerTenant);
check("13. Pack conversion", (await stockOf(plain.id)) === afterPiece + 10);
const afterPack = await stockOf(plain.id);
await createStockIn({ productId: plain.id, quantity: 1, unitId: plainBox.id, warehouseId: WAREHOUSE_ID }, ownerTenant);
check("14. Box conversion", (await stockOf(plain.id)) === afterPack + 60);

const lotSnap = await getPrismaProductStockSnapshot(lotProduct.id, ownerTenant);
const lotRow = lotSnap.warehouses.find((item) => item.warehouseId === WAREHOUSE_ID);
check("15. lot-enabled product", Boolean(lotRow && lotRow.lots.length > 0 && lotRow.lots[0].lotNumber === "LOT-A"));
try {
  await adjustProductStockToActual(
    {
      countedQuantity: qty(lotRow?.onHand) + 1,
      expectedSystemQuantity: qty(lotRow?.onHand),
      productId: lotProduct.id,
      reason: "lot adjust",
      warehouseId: WAREHOUSE_ID,
    },
    ownerTenant,
  );
  check("15b. lot adjust blocked", false, "expected lot unsupported");
} catch (error) {
  const ok =
    error instanceof InventoryCountConflictError &&
    error.message === STOCK_COUNT_LOT_UNSUPPORTED_MESSAGE;
  check("15b. lot adjust blocked", ok, error instanceof Error ? error.message : String(error));
}

const plainLots = (await getPrismaProductStockSnapshot(plain.id, ownerTenant)).warehouses.find((item) => item.warehouseId === WAREHOUSE_ID)?.lots ?? [];
check("16. non-lot product", plainLots.length === 0);

check(
  "17. Owner permission",
  canPerformStoreAction({ role: STORE_ROLES.OWNER }, STORE_ACTIONS.INVENTORY_ADJUST) &&
    canPerformStoreAction({ role: STORE_ROLES.OWNER }, STORE_ACTIONS.INVENTORY_STOCK_IN),
);
check(
  "18. unauthorized role rejected",
  !canPerformStoreAction({ role: STORE_ROLES.CASHIER }, STORE_ACTIONS.INVENTORY_ADJUST) &&
    !canPerformStoreAction({ role: STORE_ROLES.CASHIER }, STORE_ACTIONS.INVENTORY_STOCK_IN) &&
    !canPerformStoreAction({ role: STORE_ROLES.CASHIER }, STORE_ACTIONS.INVENTORY_COUNT) &&
    inventoryActions.includes("await tenant(WRITE_PERMISSIONS.inventoryAdjust, STORE_ACTIONS.INVENTORY_ADJUST)"),
);

const beforeSave = await stockOf(plain.id);
await updatePrismaProduct(
  plain.id,
  {
    initialStock: { quantity: 999, unitName: "Piece" },
    nameLo: plain.nameLo,
    sellingPriceLak: plain.sellingPriceLak,
  } as never,
  ownerTenant,
);
check("19. Product Save does not silently overwrite stock", (await stockOf(plain.id)) === beforeSave, `before=${beforeSave} after=${await stockOf(plain.id)}`);

const posProducts = await listSellablePosProducts(ownerTenant, prisma);
const posProduct = posProducts.find((item: { id: string }) => item.id === plain.id);
const latest = (await getPrismaProductStockSnapshot(plain.id, ownerTenant)).warehouses.find((item) => item.warehouseId === WAREHOUSE_ID);
check(
  "20. POS sees updated Available stock",
  Boolean(posProduct) && qty(posProduct?.stockQty) === qty(latest?.available),
  `pos=${posProduct?.stockQty} available=${latest?.available}`,
);

await prisma.product.updateMany({
  data: { isActive: false, status: "inactive" },
  where: { id: { in: [plain.id, lotProduct.id] } },
});

const failed = results.filter((row) => !row.ok);
console.log(`\nEdit product stock & lot: ${results.filter((row) => row.ok).length}/${results.length} PASS${failed.length ? ` (${failed.length} FAIL)` : ""}`);
await prisma.$disconnect();
process.exit(failed.length ? 1 : 0);
