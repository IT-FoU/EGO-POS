import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyHierarchyConversions,
  applyPersistedHierarchyCosts,
  hydrateHierarchyQty,
  isHierarchyQtyLocked,
  isUnitEnabled,
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

const piece = () => unit("piece", "Piece", 1, { isBaseUnit: true, costPriceLak: 5000, sellingPriceLak: 7000 });
const pack = (qty = 6, cost = 28000) => unit("pack", "Pack", qty, { costPriceLak: cost, sellingPriceLak: 30000 });
const box = (qty = 60, cost = 250000) => unit("box", "Box", qty, { costPriceLak: cost, sellingPriceLak: 260000 });
const trio = () => [piece(), pack(6, 28000), box(60, 250000)];

const root = process.cwd();
const productForm = readFileSync(join(root, "features/products/components/product-form.tsx"), "utf8");
const hierarchy = readFileSync(join(root, "features/products/unit-hierarchy.ts"), "utf8");
const pricing = readFileSync(join(root, "features/products/unit-pricing.ts"), "utf8");
const posCart = readFileSync(join(root, "features/pos/pos-cart.ts"), "utf8");
const posRepo = readFileSync(join(root, "features/pos/prisma-repository.ts"), "utf8");
const posClient = readFileSync(join(root, "features/pos/components/pos-page-client.tsx"), "utf8");

check("source: table UI and V2 qty rules", () => {
  assert(productForm.includes('{t("qtyInBase")}'), "QTY IN BASE missing");
  assert(productForm.includes('{t("tableScrollHint")}'), "scroll hint missing");
  assert(productForm.includes("HierarchyQtyField"), "pack/box draft field missing");
  assert(productForm.includes("value={draft}"), "local draft missing");
  assert(productForm.includes("input.select()"), "select-on-focus missing");
  assert(productForm.includes("disabled readOnly value={1}"), "piece must be locked at 1");
  assert(productForm.includes("isHierarchyQtyLocked(unit)"), "piece lock not used in table");
  assert(productForm.includes('status: event.target.checked ? "active" : "inactive"'), "enable checkbox missing");
  assert(!productForm.includes("1 Box = ${qty} Packs") && !hierarchy.includes("1 Box = ${qty} Packs"), "pack hierarchy UI still present");
  assert(!pricing.includes("deriveSharedUnitCost("), "pricing patch still derives cost");
  assert(!hierarchy.includes("multiplyQty"), "hierarchy multiply still present");
});

check("1. Piece active → Qty fixed at 1", () => {
  const next = applyHierarchyConversions(trio());
  assert(next.find((row) => row.id === "piece")?.conversionQty === 1, "piece qty");
  assert(isHierarchyQtyLocked(next.find((row) => row.id === "piece")!), "locked");
});

check("2. Piece Qty cannot be changed", () => {
  const next = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { conversionQty: 5 },
    shareStock: true,
    units: trio(),
  });
  assert(next.find((row) => row.id === "piece")?.conversionQty === 1, "stays 1");
});

check("3. Pack 12 → 6", () => {
  const typed = simulateQtyReplace(12, "6");
  assert(typed.duringEdit === "6" && typed.committed === 6, JSON.stringify(typed));
  const next = applyUnitPricingPatch({ editedUnitId: "pack", patch: { conversionQty: 6 }, shareStock: true, units: [piece(), pack(12), box(60)] });
  assert(next.find((row) => row.id === "pack")?.conversionQty === 6, "pack 6");
  assert(next.find((row) => row.id === "box")?.conversionQty === 60, "box unchanged");
});

check("4. Pack 12 → 24", () => {
  const typed = simulateQtyClearThenType(12, "24");
  assert(typed.blank === "" && typed.committed === 24, JSON.stringify(typed));
  const next = applyUnitPricingPatch({ editedUnitId: "pack", patch: { conversionQty: 24 }, shareStock: true, units: [piece(), pack(12), box(60)] });
  assert(next.find((row) => row.id === "pack")?.conversionQty === 24, "pack 24");
  assert(next.find((row) => row.id === "box")?.conversionQty === 60, "box not 10 packs");
});

check("5. Box 60 → 120", () => {
  const next = applyUnitPricingPatch({ editedUnitId: "box", patch: { conversionQty: 120 }, shareStock: true, units: trio() });
  assert(next.find((row) => row.id === "box")?.conversionQty === 120, "box 120");
  assert(next.find((row) => row.id === "pack")?.conversionQty === 6, "pack unchanged");
});

check("6. Pack/Box allow temporary blank while editing", () => {
  const blank = onQtyInputChange(onQtyInputFocus(qtyInputFromCommitted(12)), "");
  assert(qtyInputDisplay(blank) === "" && blank.committed === 12, JSON.stringify(blank));
  const replaced = replaceConversionValue("12", "6");
  assert(replaced.draft === "6" && replaced.committed === 6 && replaced.error === false, JSON.stringify(replaced));
});

check("7. Invalid Qty cannot save", () => {
  const start = trio();
  for (const value of [0, -3, Number.NaN]) {
    const next = applyUnitPricingPatch({ editedUnitId: "pack", patch: { conversionQty: value }, shareStock: true, units: start });
    assert(next.find((row) => row.id === "pack")?.conversionQty === 6, `kept 6 for ${String(value)}`);
  }
  const blurred = onQtyInputBlur(onQtyInputChange(onQtyInputFocus(qtyInputFromCommitted(6)), ""));
  assert(blurred.committed === 6 && blurred.error === true, "restore");
  assert(parsePositiveIntQty(1.5) === null, "integers only");
  assert(productForm.includes('t("invalidUnitQuantity")'), "save copy");
});

check("8. Changing Qty does not change Cost", () => {
  const next = applyUnitPricingPatch({ editedUnitId: "pack", patch: { conversionQty: 10 }, shareStock: true, units: trio() });
  assert(next.find((row) => row.id === "piece")?.costPriceLak === 5000, "piece cost");
  assert(next.find((row) => row.id === "pack")?.costPriceLak === 28000, "pack cost");
  assert(next.find((row) => row.id === "box")?.costPriceLak === 250000, "box cost");
});

check("9. Changing Qty does not change Selling Price", () => {
  const next = applyUnitPricingPatch({ editedUnitId: "box", patch: { conversionQty: 120 }, shareStock: true, units: trio() });
  assert(next.find((row) => row.id === "piece")?.sellingPriceLak === 7000, "piece selling");
  assert(next.find((row) => row.id === "pack")?.sellingPriceLak === 30000, "pack selling");
  assert(next.find((row) => row.id === "box")?.sellingPriceLak === 260000, "box selling");
});

check("10. Pack Cost manual", () => {
  const next = applyUnitPricingPatch({ editedUnitId: "pack", patch: { costPriceLak: 28000 }, shareStock: true, units: trio() });
  assert(next.find((row) => row.id === "pack")?.costPriceLak === 28000, "pack cost");
  assert(next.find((row) => row.id === "piece")?.costPriceLak === 5000, "piece not derived");
});

check("11. Box Cost manual", () => {
  const next = applyUnitPricingPatch({ editedUnitId: "box", patch: { costPriceLak: 250000 }, shareStock: true, units: trio() });
  assert(next.find((row) => row.id === "box")?.costPriceLak === 250000, "box cost");
  assert(next.find((row) => row.id === "pack")?.costPriceLak === 28000, "pack not derived");
});

check("12. Piece pricing uses Piece Cost", () => {
  assert(sellingPriceFromCost({ costPriceLak: 5000, pricingMode: "cost_plus_percent", markupPercent: 0 }) === 5000, "piece");
});

check("13. Pack pricing uses Pack Cost", () => {
  assert(sellingPriceFromCost({ costPriceLak: 28000, pricingMode: "cost_plus_percent", markupPercent: 0 }) === 28000, "pack");
});

check("14. Box pricing uses Box Cost", () => {
  assert(sellingPriceFromCost({ costPriceLak: 250000, pricingMode: "cost_plus_percent", markupPercent: 0 }) === 250000, "box");
});

check("15. Disabled Pack not offered in POS", () => {
  assert(posCart.includes('item.status !== "inactive"'), "pos-cart filters inactive");
  assert(posClient.includes('unit.status !== "inactive"'), "POS client filters inactive");
});

check("16. Disabled Box not offered in POS", () => {
  const next = applyUnitPricingPatch({ editedUnitId: "box", patch: { status: "inactive" }, shareStock: true, units: trio() });
  assert(!isUnitEnabled(next.find((row) => row.id === "box")!), "box inactive");
  assert(isUnitEnabled(next.find((row) => row.id === "pack")!), "pack still on");
});

check("17. Disabled unit data retained", () => {
  const next = applyUnitPricingPatch({
    editedUnitId: "box",
    patch: { status: "inactive" },
    shareStock: true,
    units: [piece(), pack(6, 28000), box(60, 250000)],
  });
  const disabled = next.find((row) => row.id === "box")!;
  assert(disabled.status === "inactive", "inactive");
  assert(disabled.conversionQty === 60, "qty kept");
  assert(disabled.costPriceLak === 250000, "cost kept");
  assert(disabled.sellingPriceLak === 260000, "price kept");
});

check("18. Re-enable restores prior unit values", () => {
  const disabled = applyUnitPricingPatch({ editedUnitId: "box", patch: { status: "inactive" }, shareStock: true, units: trio() });
  const enabled = applyUnitPricingPatch({ editedUnitId: "box", patch: { status: "active" }, shareStock: true, units: disabled });
  const boxUnit = enabled.find((row) => row.id === "box")!;
  assert(boxUnit.status === "active", "active");
  assert(boxUnit.conversionQty === 60, "qty restored");
  assert(boxUnit.costPriceLak === 250000, "cost restored");
  assert(boxUnit.barcode === "", "barcode kept");
});

check("19. Sell Piece deducts 1", () => {
  assert(requiredBaseQty(1, 1) === 1, "piece");
  assert(posRepo.includes("baseQuantity: quantity * conversionQty"), "POS sale conversion");
});

check("20. Sell Pack=6 deducts 6", () => {
  assert(requiredBaseQty(1, 6) === 6, "pack");
});

check("21. Sell Box=60 deducts 60", () => {
  assert(requiredBaseQty(1, 60) === 60, "box");
});

check("22. Sell 2 Boxes deducts 120", () => {
  assert(requiredBaseQty(2, 60) === 120, "2 boxes");
});

check("23. Existing product 1/6/60 loads unchanged", () => {
  const stored = hydrateHierarchyQty([
    unit("piece", "Piece", 1, { costPriceLak: 8000, isBaseUnit: true }),
    unit("pack", "Pack", 6, { costPriceLak: 28000 }),
    unit("box", "Box", 60, { costPriceLak: 250000 }),
  ]);
  assert(stored.find((row) => row.id === "piece")?.conversionQty === 1, "piece 1");
  assert(stored.find((row) => row.id === "pack")?.conversionQty === 6, "pack 6");
  assert(stored.find((row) => row.id === "box")?.conversionQty === 60, "box 60 not 10 packs");
});

check("24. Edit-open does not rewrite costs", () => {
  const stored = hydrateHierarchyQty([
    unit("piece", "Piece", 1, { costPriceLak: 8000, isBaseUnit: true }),
    unit("pack", "Pack", 6, { costPriceLak: 28000 }),
    unit("box", "Box", 60, { costPriceLak: 250000 }),
  ]);
  assert(stored.find((row) => row.id === "pack")?.costPriceLak === 28000, "pack cost");
  assert(stored.find((row) => row.id === "box")?.costPriceLak === 250000, "box cost");
  const persisted = applyPersistedHierarchyCosts(stored);
  assert(persisted.find((row) => row.id === "pack")?.costPriceLak === 28000, "save path");
  assert(persisted.find((row) => row.id === "box")?.conversionQty === 60, "box qty");
  assert(productForm.includes("useState<ProductUnit[]>(() => hydrateHierarchyQty("), "edit hydrates only");
  assert(!productForm.includes("useState<ProductUnit[]>(() => applyHierarchyConversions"), "no persist-recalc on open");
});

check("25. No DB migration required", () => {
  assert(!productForm.includes("prisma migrate"), "form must not migrate");
  assert(posCart.includes("requiredBaseQty"), "POS already uses conversionQty");
});

const failed = results.filter((row) => row.status === "FAIL");
console.log(JSON.stringify({ failed: failed.length, passed: results.length - failed.length, total: results.length }, null, 2));
if (failed.length > 0) process.exit(1);
