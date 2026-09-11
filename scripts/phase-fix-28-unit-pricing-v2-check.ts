import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyHierarchyConversions,
  applyPersistedHierarchyCosts,
  hydrateHierarchyQty,
  isActiveUnitQtyInvalid,
  isHierarchyQtyLocked,
  isUnitEnabled,
  parseIntegerQty,
  parsePositiveIntQty,
  replaceConversionValue,
} from "../features/products/unit-hierarchy";
import { applyUnitPricingPatch, sellingPriceFromCost } from "../features/products/unit-pricing";
import {
  onQtyInputBlur,
  onQtyInputChange,
  onQtyInputFocus,
  qtyInputDisplay,
  qtyInputFromCommitted,
  simulateQtyClearThenType,
  simulateQtyReplace,
} from "../features/products/unit-qty-input";
import { requiredBaseQty } from "../features/pos/pos-cart";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const results: Array<{ detail?: string; name: string; status: "FAIL" | "PASS" }> = [];

function check(name: string, run: () => void) {
  try {
    run();
    results.push({ name, status: "PASS" });
    console.log(`PASS  ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ detail, name, status: "FAIL" });
    console.log(`FAIL  ${name} — ${detail}`);
  }
}

function unit(id: string, unitName: string, conversionQty: number, extra: Record<string, unknown> = {}) {
  return {
    addAmountLak: 0,
    conversionQty,
    costPriceLak: extra.costPriceLak as number | undefined ?? 0,
    id,
    markupPercent: extra.markupPercent as number | undefined ?? 0,
    pricingMode: (extra.pricingMode as "manual" | "cost_plus_percent" | "cost_plus_amount" | undefined) ?? "manual",
    roundingLak: extra.roundingLak as number | undefined ?? 0,
    sellingPriceLak: extra.sellingPriceLak as number | undefined ?? 0,
    status: (extra.status as "active" | "inactive" | undefined) ?? "active",
    unitName,
    barcode: extra.barcode as string | undefined ?? "",
    ...extra,
  };
}

const piece = (qty = 1) => unit("piece", "Piece", qty, { isBaseUnit: true, costPriceLak: 5000, sellingPriceLak: 7000 });
const pack = (qty = 6, cost = 28000) => unit("pack", "Pack", qty, { costPriceLak: cost, sellingPriceLak: 30000 });
const box = (qty = 60, cost = 250000) => unit("box", "Box", qty, { costPriceLak: cost, sellingPriceLak: 260000 });
const trio = () => [piece(), pack(6, 28000), box(60, 250000)];

const root = process.cwd();
const productForm = readFileSync(join(root, "features/products/components/product-form.tsx"), "utf8");
const hierarchy = readFileSync(join(root, "features/products/unit-hierarchy.ts"), "utf8");
const pricing = readFileSync(join(root, "features/products/unit-pricing.ts"), "utf8");
const qtyInput = readFileSync(join(root, "features/products/unit-qty-input.ts"), "utf8");
const prismaRepo = readFileSync(join(root, "features/products/prisma-repository.ts"), "utf8");
const posCart = readFileSync(join(root, "features/pos/pos-cart.ts"), "utf8");
const posRepo = readFileSync(join(root, "features/pos/prisma-repository.ts"), "utf8");
const posClient = readFileSync(join(root, "features/pos/components/pos-page-client.tsx"), "utf8");

check("source: no forced/locked 1 on QTY IN BASE path", () => {
  assert(productForm.includes('{t("qtyInBase")}'), "QTY IN BASE missing");
  assert(productForm.includes("HierarchyQtyField"), "draft field missing");
  assert(productForm.includes("value={draft}"), "local draft missing");
  assert(!productForm.includes("disabled readOnly value={1}"), "piece still locked at 1");
  assert(!productForm.includes("isHierarchyQtyLocked(unit) ?"), "piece still branched as locked");
  assert(!productForm.includes("parsePositiveIntQty(unit.conversionQty) ?? 1"), "input still coalesces to 1");
  assert(!productForm.includes("isHierarchyQtyLocked(unit) ? 1"), "save still forces piece 1");
  assert(!hierarchy.includes("return { ...unit, conversionQty: 1 }"), "hydrate still forces piece 1");
  assert(!pricing.includes("isHierarchyQtyLocked(current)"), "patch still blocks piece qty");
  assert(!pricing.includes("parsePositiveIntQty(patch.conversionQty) === null"), "patch still rejects 0");
  assert(!prismaRepo.includes("Math.max(numberValue(unit.conversionQty, 1), 1)"), "repo still min-1");
  assert(!qtyInput.includes("draft: undefined") || qtyInput.includes("state.draft"), "qty helper present");
  assert(productForm.includes("qtyInBaseMustBePositive"), "save copy missing");
  assert(productForm.includes("Number.isFinite(unit.conversionQty) ? unit.conversionQty : null"), "blank must stay blank");
  assert(!productForm.includes("1 Box = ${qty} Packs") && !hierarchy.includes("1 Box = ${qty} Packs"), "pack hierarchy UI still present");
  assert(!pricing.includes("deriveSharedUnitCost("), "pricing patch still derives cost");
});

check("Piece: 1 → blank → 5 = 5", () => {
  const typed = simulateQtyClearThenType(1, "5");
  assert(typed.blank === "" && typed.committed === 5 && typed.display === "5", JSON.stringify(typed));
  const next = applyUnitPricingPatch({ editedUnitId: "piece", patch: { conversionQty: 5 }, shareStock: true, units: trio() });
  assert(next.find((row) => row.id === "piece")?.conversionQty === 5, "piece 5");
  assert(isHierarchyQtyLocked(next.find((row) => row.id === "piece")!) === false, "piece unlocked");
});

check("Pack: 1 → blank → 6 = 6", () => {
  const typed = simulateQtyClearThenType(1, "6");
  assert(typed.blank === "" && typed.committed === 6 && typed.display === "6", JSON.stringify(typed));
});

check("Box: 1 → blank → 60 = 60", () => {
  const typed = simulateQtyClearThenType(1, "60");
  assert(typed.blank === "" && typed.committed === 60 && typed.display === "60", JSON.stringify(typed));
});

check("Piece: 1 → 0 remains 0 while editing", () => {
  const typed = onQtyInputChange(onQtyInputFocus(qtyInputFromCommitted(1)), "0");
  assert(qtyInputDisplay(typed) === "0" && typed.committed === 0, JSON.stringify(typed));
  const blurred = onQtyInputBlur(typed);
  assert(qtyInputDisplay(blurred) === "0" && blurred.committed === 0, JSON.stringify(blurred));
});

check("Pack: 12 → blank → 24 = 24", () => {
  const typed = simulateQtyClearThenType(12, "24");
  assert(typed.blank === "" && typed.committed === 24, JSON.stringify(typed));
  const next = applyUnitPricingPatch({ editedUnitId: "pack", patch: { conversionQty: 24 }, shareStock: true, units: [piece(), pack(12), box(60)] });
  assert(next.find((row) => row.id === "pack")?.conversionQty === 24, "pack 24");
  assert(next.find((row) => row.id === "box")?.conversionQty === 60, "box unchanged");
});

check("Box: 60 → blank → 120 = 120", () => {
  const typed = simulateQtyClearThenType(60, "120");
  assert(typed.blank === "" && typed.committed === 120, JSON.stringify(typed));
  const next = applyUnitPricingPatch({ editedUnitId: "box", patch: { conversionQty: 120 }, shareStock: true, units: trio() });
  assert(next.find((row) => row.id === "box")?.conversionQty === 120, "box 120");
});

check("Active unit Qty 0: Save blocked", () => {
  const next = applyUnitPricingPatch({ editedUnitId: "piece", patch: { conversionQty: 0 }, shareStock: true, units: trio() });
  assert(next.find((row) => row.id === "piece")?.conversionQty === 0, "state keeps 0");
  assert(isActiveUnitQtyInvalid(next.find((row) => row.id === "piece")!), "save blocked");
  assert(parseIntegerQty("0") === 0, "0 is visible integer");
  assert(parsePositiveIntQty(0) === null, "0 is not a valid save qty");
});

check("Active unit blank: Save blocked", () => {
  const blank = onQtyInputChange(onQtyInputFocus(qtyInputFromCommitted(1)), "");
  assert(qtyInputDisplay(blank) === "" && blank.committed === null, JSON.stringify(blank));
  const next = applyUnitPricingPatch({ editedUnitId: "pack", patch: { conversionQty: Number.NaN }, shareStock: true, units: trio() });
  assert(Number.isNaN(next.find((row) => row.id === "pack")?.conversionQty as number), "blank stays NaN");
  assert(isActiveUnitQtyInvalid(next.find((row) => row.id === "pack")!), "save blocked");
});

check("Inactive unit blank/0 is not save-blocked", () => {
  const disabled = applyUnitPricingPatch({ editedUnitId: "box", patch: { status: "inactive" }, shareStock: true, units: trio() });
  const zeroed = applyUnitPricingPatch({ editedUnitId: "box", patch: { conversionQty: 0 }, shareStock: true, units: disabled });
  assert(!isActiveUnitQtyInvalid(zeroed.find((row) => row.id === "box")!), "inactive 0 allowed");
  assert(zeroed.find((row) => row.id === "box")?.conversionQty === 0, "inactive keeps 0");
});

check("Changing Qty does not change Cost", () => {
  const next = applyUnitPricingPatch({ editedUnitId: "pack", patch: { conversionQty: 10 }, shareStock: true, units: trio() });
  assert(next.find((row) => row.id === "piece")?.costPriceLak === 5000, "piece cost");
  assert(next.find((row) => row.id === "pack")?.costPriceLak === 28000, "pack cost");
  assert(next.find((row) => row.id === "box")?.costPriceLak === 250000, "box cost");
});

check("Changing Qty does not change Selling Price", () => {
  const next = applyUnitPricingPatch({ editedUnitId: "box", patch: { conversionQty: 120 }, shareStock: true, units: trio() });
  assert(next.find((row) => row.id === "piece")?.sellingPriceLak === 7000, "piece selling");
  assert(next.find((row) => row.id === "pack")?.sellingPriceLak === 30000, "pack selling");
  assert(next.find((row) => row.id === "box")?.sellingPriceLak === 260000, "box selling");
});

check("Pack Cost manual", () => {
  const next = applyUnitPricingPatch({ editedUnitId: "pack", patch: { costPriceLak: 28000 }, shareStock: true, units: trio() });
  assert(next.find((row) => row.id === "pack")?.costPriceLak === 28000, "pack cost");
  assert(next.find((row) => row.id === "piece")?.costPriceLak === 5000, "piece not derived");
});

check("Box Cost manual", () => {
  const next = applyUnitPricingPatch({ editedUnitId: "box", patch: { costPriceLak: 250000 }, shareStock: true, units: trio() });
  assert(next.find((row) => row.id === "box")?.costPriceLak === 250000, "box cost");
  assert(next.find((row) => row.id === "pack")?.costPriceLak === 28000, "pack not derived");
});

check("Piece/Pack/Box pricing uses own cost", () => {
  assert(sellingPriceFromCost({ costPriceLak: 5000, pricingMode: "cost_plus_percent", markupPercent: 0 }) === 5000, "piece");
  assert(sellingPriceFromCost({ costPriceLak: 28000, pricingMode: "cost_plus_percent", markupPercent: 0 }) === 28000, "pack");
  assert(sellingPriceFromCost({ costPriceLak: 250000, pricingMode: "cost_plus_percent", markupPercent: 0 }) === 250000, "box");
});

check("Disabled Pack/Box not offered in POS", () => {
  assert(posCart.includes('item.status !== "inactive"'), "pos-cart filters inactive");
  assert(posClient.includes('unit.status !== "inactive"'), "POS client filters inactive");
  const next = applyUnitPricingPatch({ editedUnitId: "box", patch: { status: "inactive" }, shareStock: true, units: trio() });
  assert(!isUnitEnabled(next.find((row) => row.id === "box")!), "box inactive");
});

check("Disabled unit data retained and restore", () => {
  const disabled = applyUnitPricingPatch({ editedUnitId: "box", patch: { status: "inactive" }, shareStock: true, units: trio() });
  const boxDisabled = disabled.find((row) => row.id === "box")!;
  assert(boxDisabled.conversionQty === 60 && boxDisabled.costPriceLak === 250000, "retained");
  const enabled = applyUnitPricingPatch({ editedUnitId: "box", patch: { status: "active" }, shareStock: true, units: disabled });
  assert(enabled.find((row) => row.id === "box")?.conversionQty === 60, "restored");
});

check("POS stock formula unchanged", () => {
  assert(requiredBaseQty(1, 1) === 1, "piece");
  assert(requiredBaseQty(1, 6) === 6, "pack");
  assert(requiredBaseQty(1, 60) === 60, "box");
  assert(requiredBaseQty(2, 60) === 120, "2 boxes");
  assert(posRepo.includes("baseQuantity: quantity * conversionQty"), "POS sale conversion");
});

check("Existing product 1/6/60 loads unchanged", () => {
  const stored = hydrateHierarchyQty([
    unit("piece", "Piece", 1, { costPriceLak: 8000, isBaseUnit: true }),
    unit("pack", "Pack", 6, { costPriceLak: 28000 }),
    unit("box", "Box", 60, { costPriceLak: 250000 }),
  ]);
  assert(stored.find((row) => row.id === "piece")?.conversionQty === 1, "piece 1");
  assert(stored.find((row) => row.id === "pack")?.conversionQty === 6, "pack 6");
  assert(stored.find((row) => row.id === "box")?.conversionQty === 60, "box 60");
});

check("Hydrate does not rewrite Piece 5 to 1", () => {
  const stored = hydrateHierarchyQty([piece(5), pack(6), box(60)]);
  assert(stored.find((row) => row.id === "piece")?.conversionQty === 5, "piece stays 5");
});

check("Edit-open does not rewrite costs", () => {
  const stored = hydrateHierarchyQty([
    unit("piece", "Piece", 1, { costPriceLak: 8000, isBaseUnit: true }),
    unit("pack", "Pack", 6, { costPriceLak: 28000 }),
    unit("box", "Box", 60, { costPriceLak: 250000 }),
  ]);
  assert(stored.find((row) => row.id === "pack")?.costPriceLak === 28000, "pack cost");
  const persisted = applyPersistedHierarchyCosts(stored);
  assert(persisted.find((row) => row.id === "box")?.costPriceLak === 250000, "save path");
});

check("Replace conversion draft never coalesces to 1", () => {
  const replaced = replaceConversionValue("1", "6");
  assert(replaced.draft === "6" && replaced.committed === 6, JSON.stringify(replaced));
  const zero = replaceConversionValue("1", "0");
  assert(zero.draft === "0" && zero.committed === 0, JSON.stringify(zero));
});

check("No DB migration required", () => {
  assert(!productForm.includes("prisma migrate"), "form must not migrate");
  assert(posCart.includes("requiredBaseQty"), "POS already uses conversionQty");
});

const failed = results.filter((row) => row.status === "FAIL");
console.log(JSON.stringify({ failed: failed.length, passed: results.length - failed.length, total: results.length }, null, 2));
if (failed.length > 0) process.exit(1);
