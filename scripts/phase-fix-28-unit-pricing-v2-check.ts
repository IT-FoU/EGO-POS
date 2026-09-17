import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyHierarchyConversions,
  applyPersistedHierarchyCosts,
  hierarchyQtyEditor,
  hierarchyRelationText,
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
    costPriceLak: (extra.costPriceLak as number | undefined) ?? 0,
    id,
    markupPercent: (extra.markupPercent as number | undefined) ?? 0,
    pricingMode: (extra.pricingMode as "manual" | "cost_plus_percent" | "cost_plus_amount" | undefined) ?? "manual",
    roundingLak: (extra.roundingLak as number | undefined) ?? 0,
    sellingPriceLak: (extra.sellingPriceLak as number | undefined) ?? 0,
    status: (extra.status as "active" | "inactive" | undefined) ?? "active",
    unitName,
    barcode: (extra.barcode as string | undefined) ?? "",
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
const posCart = readFileSync(join(root, "features/pos/pos-cart.ts"), "utf8");
const posRepo = readFileSync(join(root, "features/pos/prisma-repository.ts"), "utf8");
const posClient = readFileSync(join(root, "features/pos/components/pos-page-client.tsx"), "utf8");

check("1. Piece locked to 1", () => {
  const units = hydrateHierarchyQty(trio());
  const pieceUnit = units.find((row) => row.id === "piece")!;
  assert(isHierarchyQtyLocked(pieceUnit, units), "piece not locked");
  assert(pieceUnit.conversionQty === 1 && pieceUnit.hierarchyQty === 1, "piece qty");
  const editor = hierarchyQtyEditor(pieceUnit, units);
  assert(editor.locked && editor.value === 1, JSON.stringify(editor));
  assert(productForm.includes("disabled") && productForm.includes("readOnly") && productForm.includes("value={1}"), "form lock");
  const patched = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { conversionQty: 5, hierarchyQty: 5 },
    shareStock: true,
    units,
  });
  assert(patched.find((row) => row.id === "piece")?.conversionQty === 1, "piece patch blocked");
});

check("2. Stale Piece qty normalized to 1", () => {
  const stored = hydrateHierarchyQty([piece(5), pack(6), box(60)]);
  assert(stored.find((row) => row.id === "piece")?.conversionQty === 1, "stale 5 → 1");
  assert(stored.find((row) => row.id === "piece")?.hierarchyQty === 1, "hierarchy 1");
});

check("3. Pack enabled → Box relation = Packs", () => {
  const units = hydrateHierarchyQty([piece(), pack(6), box(24)]);
  const boxUnit = units.find((row) => row.id === "box")!;
  assert(boxUnit.hierarchyQty === 4 && boxUnit.conversionQty === 24, JSON.stringify(boxUnit));
  assert(hierarchyRelationText(boxUnit, units) === "1 Box = 4 Packs", hierarchyRelationText(boxUnit, units));
  const editor = hierarchyQtyEditor(boxUnit, units);
  assert(editor.prefix === "1 Box =" && editor.suffix === "Packs" && editor.value === 4, JSON.stringify(editor));
  assert(productForm.includes('t("packsWord")') && productForm.includes('t("oneBoxEquals")'), "form labels");
});

check("4. Pack disabled → Box relation = Pieces", () => {
  const start = hydrateHierarchyQty([piece(), pack(6), box(24)]);
  const disabled = applyUnitPricingPatch({
    editedUnitId: "pack",
    patch: { status: "inactive" },
    shareStock: true,
    units: start,
  });
  const boxUnit = disabled.find((row) => row.id === "box")!;
  assert(boxUnit.conversionQty === 24, "stock pieces kept");
  assert(hierarchyRelationText(boxUnit, disabled) === "1 Box = 24 Pieces", hierarchyRelationText(boxUnit, disabled));
  const editor = hierarchyQtyEditor(boxUnit, disabled);
  assert(editor.suffix === "Pieces" && editor.value === 24, JSON.stringify(editor));
});

check("5. Hierarchy stock conversion remains correct", () => {
  const units = applyUnitPricingPatch({
    editedUnitId: "box",
    patch: { hierarchyQty: 4 },
    shareStock: true,
    units: hydrateHierarchyQty([piece(), pack(6), box(60)]),
  });
  assert(units.find((row) => row.id === "pack")?.conversionQty === 6, "pack pieces");
  assert(units.find((row) => row.id === "box")?.conversionQty === 24, "box = 4 packs * 6");
  assert(requiredBaseQty(1, 1) === 1, "piece base");
  assert(requiredBaseQty(1, 6) === 6, "pack base");
  assert(requiredBaseQty(1, 24) === 24, "box base");
  assert(requiredBaseQty(2, 24) === 48, "2 boxes");
  assert(posRepo.includes("baseQuantity: quantity * conversionQty"), "POS sale conversion");
});

check("6. Rounding = ROUND UP / CEILING (Owner-confirmed final rule)", () => {
  const ceil = (costPriceLak: number, roundingLak: number) => sellingPriceFromCost({
    costPriceLak,
    markupPercent: 0,
    pricingMode: "cost_plus_percent",
    roundingLak,
  });
  // Round up to 500
  assert(ceil(12000, 500) === 12000, "500: 12000 -> 12000");
  assert(ceil(12100, 500) === 12500, "500: 12100 -> 12500");
  assert(ceil(12500, 500) === 12500, "500: 12500 -> 12500");
  assert(ceil(12501, 500) === 13000, "500: 12501 -> 13000");
  // Round up to 1,000
  assert(ceil(12000, 1000) === 12000, "1000: 12000 -> 12000");
  assert(ceil(12100, 1000) === 13000, "1000: 12100 -> 13000");
  assert(ceil(12999, 1000) === 13000, "1000: 12999 -> 13000");
  assert(ceil(13000, 1000) === 13000, "1000: 13000 -> 13000");
});

check("6b. Rounding copy uses 'Round up' terminology, not 'nearest', in Product form", () => {
  assert(productForm.includes('t("noRounding")'), "None option present");
  assert(productForm.includes('t("roundUp500")'), "Round up 500 option present");
  assert(productForm.includes('t("roundUp1000")'), "Round up 1000 option present");
  assert(!productForm.includes('t("round500")') && !productForm.includes('t("round1000")'), "no 'nearest'-worded rounding keys used in Product form");
});

check("7. Disabled Pack/Box has no active pricing/cost controls", () => {
  assert(productForm.includes("disabled={!enabled}"), "enabled gate present");
  assert(productForm.includes('disabled={!enabled || (unit.pricingMode ?? "manual") !== "manual"}'), "selling gate");
  assert(productForm.includes('disabled={!enabled || (unit.pricingMode ?? "manual") !== "cost_plus_percent"}'), "markup gate");
  assert(productForm.includes('disabled={!enabled || (unit.pricingMode ?? "manual") !== "cost_plus_amount"}'), "amount gate");
  const disabled = applyUnitPricingPatch({
    editedUnitId: "box",
    patch: { status: "inactive" },
    shareStock: true,
    units: trio(),
  });
  assert(!isUnitEnabled(disabled.find((row) => row.id === "box")!), "box inactive");
  assert(posCart.includes('item.status !== "inactive"'), "pos-cart filters inactive");
  assert(posClient.includes('unit.status !== "inactive"'), "POS client filters inactive");
});

check("8. Re-enable unit restores safely without corrupting other units", () => {
  const disabled = applyUnitPricingPatch({
    editedUnitId: "box",
    patch: { status: "inactive" },
    shareStock: true,
    units: hydrateHierarchyQty(trio()),
  });
  const boxDisabled = disabled.find((row) => row.id === "box")!;
  assert(boxDisabled.conversionQty === 60 && boxDisabled.costPriceLak === 250000, "retained");
  const enabled = applyUnitPricingPatch({
    editedUnitId: "box",
    patch: { status: "active" },
    shareStock: true,
    units: disabled,
  });
  assert(enabled.find((row) => row.id === "box")?.conversionQty === 60, "restored qty");
  assert(enabled.find((row) => row.id === "pack")?.conversionQty === 6, "pack untouched");
  assert(enabled.find((row) => row.id === "piece")?.costPriceLak === 5000, "piece cost untouched");
});

check("9. Independent cost remains independent", () => {
  const next = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { costPriceLak: 8000 },
    shareStock: true,
    units: trio(),
  });
  assert(next.find((row) => row.id === "piece")?.costPriceLak === 8000, "piece cost");
  assert(next.find((row) => row.id === "pack")?.costPriceLak === 28000, "pack not overwritten");
  assert(next.find((row) => row.id === "box")?.costPriceLak === 250000, "box not overwritten");
  const qtyOnly = applyUnitPricingPatch({
    editedUnitId: "pack",
    patch: { hierarchyQty: 10 },
    shareStock: true,
    units: next,
  });
  assert(qtyOnly.find((row) => row.id === "pack")?.costPriceLak === 28000, "qty change keeps pack cost");
  assert(qtyOnly.find((row) => row.id === "piece")?.costPriceLak === 8000, "piece cost kept");
});

check("Pack editor: 1 Pack = N Pieces", () => {
  const units = hydrateHierarchyQty([piece(), pack(6)]);
  const packUnit = units.find((row) => row.id === "pack")!;
  assert(hierarchyRelationText(packUnit, units) === "1 Pack = 6 Pieces", hierarchyRelationText(packUnit, units));
  assert(hierarchyQtyEditor(packUnit, units).suffix === "Pieces", "pack suffix");
});

check("Toggle Pack updates Box relationship", () => {
  const withPack = hydrateHierarchyQty([piece(), pack(6), box(24)]);
  assert(hierarchyRelationText(withPack.find((row) => row.id === "box")!, withPack) === "1 Box = 4 Packs", "with pack");
  const noPack = applyUnitPricingPatch({
    editedUnitId: "pack",
    patch: { status: "inactive" },
    shareStock: true,
    units: withPack,
  });
  assert(hierarchyRelationText(noPack.find((row) => row.id === "box")!, noPack) === "1 Box = 24 Pieces", "without pack");
  const restored = applyUnitPricingPatch({
    editedUnitId: "pack",
    patch: { status: "active" },
    shareStock: true,
    units: noPack,
  });
  assert(hierarchyRelationText(restored.find((row) => row.id === "box")!, restored) === "1 Box = 4 Packs", "pack restored");
  assert(restored.find((row) => row.id === "box")?.conversionQty === 24, "stock unchanged across toggle");
});

check("Changing Qty does not change Selling Price", () => {
  const next = applyUnitPricingPatch({
    editedUnitId: "box",
    patch: { hierarchyQty: 5 },
    shareStock: true,
    units: hydrateHierarchyQty(trio()),
  });
  assert(next.find((row) => row.id === "piece")?.sellingPriceLak === 7000, "piece selling");
  assert(next.find((row) => row.id === "pack")?.sellingPriceLak === 30000, "pack selling");
  assert(next.find((row) => row.id === "box")?.sellingPriceLak === 260000, "box selling");
});

check("Pack/Box Cost manual", () => {
  const next = applyUnitPricingPatch({
    editedUnitId: "pack",
    patch: { costPriceLak: 28000 },
    shareStock: true,
    units: trio(),
  });
  assert(next.find((row) => row.id === "pack")?.costPriceLak === 28000, "pack cost");
  assert(next.find((row) => row.id === "piece")?.costPriceLak === 5000, "piece not derived");
});

check("Piece/Pack/Box pricing uses own cost", () => {
  assert(sellingPriceFromCost({ costPriceLak: 5000, pricingMode: "cost_plus_percent", markupPercent: 0 }) === 5000, "piece");
  assert(sellingPriceFromCost({ costPriceLak: 28000, pricingMode: "cost_plus_percent", markupPercent: 0 }) === 28000, "pack");
  assert(sellingPriceFromCost({ costPriceLak: 250000, pricingMode: "cost_plus_percent", markupPercent: 0 }) === 250000, "box");
});

check("Active Pack blank/0 blocked; inactive allowed", () => {
  const blank = onQtyInputChange(onQtyInputFocus(qtyInputFromCommitted(6)), "");
  assert(qtyInputDisplay(blank) === "" && blank.committed === null, JSON.stringify(blank));
  const zeroPack = applyUnitPricingPatch({
    editedUnitId: "pack",
    patch: { hierarchyQty: 0 },
    shareStock: true,
    units: trio(),
  });
  assert(isActiveUnitQtyInvalid(zeroPack.find((row) => row.id === "pack")!), "pack 0 blocked");
  const disabled = applyUnitPricingPatch({
    editedUnitId: "box",
    patch: { status: "inactive" },
    shareStock: true,
    units: trio(),
  });
  const zeroed = applyUnitPricingPatch({
    editedUnitId: "box",
    patch: { conversionQty: 0 },
    shareStock: true,
    units: disabled,
  });
  assert(!isActiveUnitQtyInvalid(zeroed.find((row) => row.id === "box")!), "inactive 0 allowed");
});

check("Existing product 1/6/60 loads with Pack-aware Box editor", () => {
  const stored = hydrateHierarchyQty([
    unit("piece", "Piece", 1, { costPriceLak: 8000, isBaseUnit: true }),
    unit("pack", "Pack", 6, { costPriceLak: 28000 }),
    unit("box", "Box", 60, { costPriceLak: 250000 }),
  ]);
  assert(stored.find((row) => row.id === "piece")?.conversionQty === 1, "piece 1");
  assert(stored.find((row) => row.id === "pack")?.conversionQty === 6, "pack 6");
  assert(stored.find((row) => row.id === "box")?.conversionQty === 60, "box 60");
  assert(stored.find((row) => row.id === "box")?.hierarchyQty === 10, "box 10 packs");
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

check("No DB migration / no legacy 12/24 reseed", () => {
  assert(!productForm.includes("prisma migrate"), "form must not migrate");
  assert(!hierarchy.includes("conversionQty: 12") && !hierarchy.includes("conversionQty: 24"), "no 12/24 force");
  assert(productForm.includes("conversionQty: 6") && productForm.includes("conversionQty: 60"), "defaults 6/60");
});

check("Cost + Amount still present", () => {
  assert(productForm.includes('value="cost_plus_amount"'), "cost_plus_amount option");
  assert(productForm.includes('t("costPlusAmount")'), "copy key");
});

const failed = results.filter((row) => row.status === "FAIL");
console.log(JSON.stringify({ failed: failed.length, passed: results.length - failed.length, total: results.length }, null, 2));
if (failed.length > 0) process.exit(1);
