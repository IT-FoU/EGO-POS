/**
 * STEP 2 Quick Stock Fix — shortage math, permissions, and adjustment path.
 * Run: npx tsx scripts/phase-products-step2-quick-stock-fix-check.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STORE_ACTIONS, hasStorePermission } from "../features/permissions/store-permissions";
import { inventoryMovementLabel } from "../lib/i18n/inventory-copy";
import { posCopyKeyParity, tPos } from "../lib/i18n/pos-copy";
import {
  buildQuickStockFixRequest,
  parseQuickStockFixQuantity,
  QUICK_STOCK_FIX_QUANTITY_ERROR,
  QUICK_STOCK_FIX_REASON,
  quickStockFixNote,
  quickStockFixShortage,
} from "../features/pos/quick-stock-fix";
import type { PosProduct, PosProductUnit } from "../features/pos/types";

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
const actions = read("features/inventory/actions.ts");
const repo = read("features/inventory/prisma-repository.ts");
const page = read("features/pos/components/pos-page-client.tsx");
const schema = read("prisma/schema.prisma");
const mapper = read("features/inventory/dto-mapper.ts");

const zero = quickStockFixShortage({ availableBase: 0, cartBaseQty: 0, conversionQty: 1 });
check("zero stock piece is short by 1", zero.shortBase === 1 && zero.requiredBase === 1);

const low = quickStockFixShortage({ availableBase: 2, cartBaseQty: 2, conversionQty: 1 });
check("stock 2 with 2 in cart is short by 1", low.availableBase === 2 && low.requiredBase === 3 && low.shortBase === 1);

const pack = quickStockFixShortage({ availableBase: 5, cartBaseQty: 0, conversionQty: 6 });
check("1 pack of 6 against 5 piece is short by 1", pack.shortBase === 1 && pack.requiredBase === 6);

const box = quickStockFixShortage({ availableBase: 5, cartBaseQty: 0, conversionQty: 24 });
check("1 box of 24 against 5 piece is short by 19", box.shortBase === 19 && box.requiredBase === 24);

check("enough stock has no shortage", quickStockFixShortage({ availableBase: 10, cartBaseQty: 0, conversionQty: 1 }).shortBase === 0);

for (const bad of [0, -1, Number.NaN, "nope", "", "1.5"]) {
  let threw = false;
  try {
    parseQuickStockFixQuantity(bad);
  } catch (error) {
    threw = error instanceof Error && error.message === QUICK_STOCK_FIX_QUANTITY_ERROR;
  }
  check(`rejects ${String(bad)}`, threw);
}

check("accepts 7", parseQuickStockFixQuantity("7") === 7 && parseQuickStockFixQuantity(5) === 5);

const note = quickStockFixNote({ conversionQty: 24, saleUnitName: "Box", terminalCode: "T-1" });
check("note marks POS Quick Stock Fix and conversion", note.includes("POS Quick Stock Fix") && note.includes("Box x24") && note.includes("terminal T-1"));
check("note does not use supplier receiving", !/supplier|stock in|goods receipt/i.test(note) && !/supplier/i.test(QUICK_STOCK_FIX_REASON));

const unit = (name: string, conversion: number, base = false): PosProductUnit => ({
  allowManualUnitSelect: true,
  barcode: "",
  conversionQty: conversion,
  costPriceLak: 0,
  id: name,
  isBaseUnit: base,
  isDefaultSaleUnit: base,
  isPurchaseUnit: base,
  sellingPriceLak: 0,
  sortOrder: 0,
  status: "active",
  unitName: name,
});
const product = {
  barcode: "QA",
  categoryName: "Drinks",
  id: "p1",
  imageKey: "",
  nameEn: "QA",
  nameLo: "QA",
  priceLak: 0,
  sku: "QA",
  stockQty: 5,
  unitName: "Piece",
  units: [unit("Piece", 1, true), unit("Box", 24)],
} as PosProduct;
const request = buildQuickStockFixRequest({
  availableBase: 5,
  cart: [],
  product,
  productName: "QA",
  saleUnit: unit("Box", 24),
});
check("box request keeps base conversion", request?.shortBase === 19 && request.conversionQty === 24 && request.baseUnitName === "Piece");

check("cashier cannot adjust stock", hasStorePermission("cashier", STORE_ACTIONS.INVENTORY_ADJUST) === false);
check("owner can adjust stock", hasStorePermission("owner", STORE_ACTIONS.INVENTORY_ADJUST) === true);
check("manager can adjust stock", hasStorePermission("manager", STORE_ACTIONS.INVENTORY_ADJUST) === true);

const quickAction = actions.slice(actions.indexOf("export async function quickStockFixAction"), actions.indexOf("export async function stockCountAction"));
check("quick fix uses stock adjustment permission", quickAction.includes("WRITE_PERMISSIONS.inventoryAdjust") && quickAction.includes("STORE_ACTIONS.INVENTORY_ADJUST"));
check("quick fix calls createStockAdjustment", quickAction.includes("createStockAdjustment(") && !quickAction.includes("createStockIn("));
check("quick fix forces the predefined reason", quickAction.includes("reason: QUICK_STOCK_FIX_REASON"));
check("adjustment movement is not stock in", repo.includes('movementType: "adjustment"') && repo.includes('referenceType: "stock_adjustment"'));
check("history maps adjustment separately from stock in", mapper.includes('referenceType === "quick_stock_in"') && mapper.includes('movementType === "purchase"') && mapper.includes('return "adjustment"'));
check("adjustment label is not stock in", inventoryMovementLabel("adjustment", "en") !== inventoryMovementLabel("stock_in", "en") && inventoryMovementLabel("adjustment", "en") !== inventoryMovementLabel("quick_stock_in", "en"));

check("POS opens quick fix from the add path", page.includes("buildQuickStockFixRequest") && page.includes("showQuickStockFix") && page.includes("quickStockFixAction"));
check("POS continues the original add once", page.includes("afterQuickFix: true") && page.includes("addToCart(updatedProduct, pending.saleUnit"));
check("in-flight guard blocks a second adjustment", page.includes("quickFixInFlightRef.current"));
check("cancel does not call the action", page.includes("setQuickFix(null)") && !page.includes("onCancel={() => { void confirmQuickStockFix"));

check("no recount column was added", !/recount|needs_count|count_required|pending_recount/i.test(schema));
check("POS copy parity", posCopyKeyParity());
for (const key of [
  "ui.quick.stock.out",
  "ui.quick.stock.insufficient",
  "ui.quick.stock.fix",
  "ui.quick.stock.current",
  "ui.quick.stock.requested",
  "ui.quick.stock.short",
  "ui.quick.stock.add.temporary",
  "ui.quick.stock.custom",
  "ui.quick.stock.reason",
  "ui.quick.stock.reason.value",
  "ui.quick.stock.continue",
  "ui.quick.stock.recount",
  "ui.quick.stock.permission",
]) {
  const en = tPos(key, "en");
  const lo = tPos(key, "lo");
  check(`${key} en/lo`, en !== key && lo !== key && en !== lo);
}

if (failed > 0) {
  console.error(`\nSTEP 2 quick stock fix: ${passed} passed, ${failed} failed`);
  process.exit(1);
}
console.log(`\nSTEP 2 quick stock fix: ${passed} passed, 0 failed`);
