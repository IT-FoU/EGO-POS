import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyUnitPricingPatch } from "../features/products/unit-pricing";
import {
  onQtyInputBlur,
  onQtyInputChange,
  onQtyInputFocus,
  qtyInputDisplay,
  qtyInputFromCommitted,
  simulateQtyClearThenType,
  simulateQtyReplace,
} from "../features/products/unit-qty-input";

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

const productForm = readFileSync(join(process.cwd(), "features/products/components/product-form.tsx"), "utf8");

check("source: ProductUnitsTable is the QTY IN BASE table and commits conversionQty only on blur", () => {
  assert(productForm.includes('{t("qtyInBase")}'), "QTY IN BASE column missing");
  assert(productForm.includes('{t("tableScrollHint")}'), "table scroll hint missing");
  assert(productForm.includes("HierarchyQtyField"), "shared qty field missing");
  assert(productForm.includes("defaultValue={String(committed)}"), "must remount from defaultValue, not controlled value");
  assert(productForm.includes("onQtyInputChange"), "onChange handler missing");
  assert(productForm.includes("onQtyInputBlur"), "blur handler missing");
  assert(productForm.includes("onCommit={(qty) => updateUnit(unit.id, { conversionQty: qty })}"), "blur must commit conversionQty");
  assert(!productForm.includes("updateUnit(unit.id, { hierarchyQty: parsed })"), "onChange still commits hierarchyQty");
  assert(!productForm.includes("updateUnit(unit.id, { hierarchyQty: next.committed })"), "onChange still commits next.committed");
  assert(!productForm.includes('type="number" min="1" value={unit.conversionQty}'), "controlled number qty still present");
  assert(!productForm.includes("disabled={unit.isBaseUnit} onChange={(event) => updateUnit(unit.id, { conversionQty"), "base unit qty still disabled");
  assert(!productForm.includes("conversionQty: 1, isPurchaseUnit: true"), "selecting base still forces qty 1");
  assert(!productForm.includes("disabled readOnly value={1}"), "piece qty still locked");
  assert(!productForm.includes("qtyDraft"), "controlled qty draft still in table");
});

check("0. Piece 1 → Ctrl+A → 2 => 2", () => {
  const next = simulateQtyReplace(1, "2");
  assert(next.duringEdit === "2", `during edit ${next.duringEdit}`);
  assert(next.committed === 2 && next.display === "2" && next.error === false, JSON.stringify(next));
});

check("0b. Piece 1 → clear → 2 = 2", () => {
  const next = simulateQtyClearThenType(1, "2");
  assert(next.blank === "", `blank ${next.blank}`);
  assert(next.committed === 2 && next.display === "2" && next.error === false, JSON.stringify(next));
  const patched = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { conversionQty: next.committed },
    shareStock: true,
    units: [
      { addAmountLak: 0, conversionQty: 1, costPriceLak: 5000, hierarchyQty: 1, id: "piece", markupPercent: 10, pricingMode: "manual" as const, roundingLak: 500, sellingPriceLak: 7000, status: "active" as const, unitName: "Piece" },
      { addAmountLak: 0, conversionQty: 12, costPriceLak: 28000, hierarchyQty: 12, id: "pack", markupPercent: 0, pricingMode: "manual" as const, roundingLak: 0, sellingPriceLak: 30000, status: "active" as const, unitName: "Pack" },
      { addAmountLak: 0, conversionQty: 24, costPriceLak: 250000, hierarchyQty: 2, id: "box", markupPercent: 0, pricingMode: "manual" as const, roundingLak: 0, sellingPriceLak: 260000, status: "active" as const, unitName: "Box" },
    ],
  });
  assert(patched.find((row) => row.id === "piece")?.conversionQty === 2, "piece conversionQty");
  assert(patched.find((row) => row.id === "piece")?.costPriceLak === 5000, "piece cost");
  assert(patched.find((row) => row.id === "pack")?.costPriceLak === 28000, "pack cost");
  assert(patched.find((row) => row.id === "box")?.costPriceLak === 250000, "box cost");
});

check("1. Pack 12 → Ctrl+A → 6 => 6", () => {
  const next = simulateQtyReplace(12, "6");
  assert(next.duringEdit === "6", `during edit ${next.duringEdit}`);
  assert(next.committed === 6 && next.display === "6" && next.error === false, JSON.stringify(next));
});

check("2. Pack 12 → clear → 10 => 10", () => {
  const next = simulateQtyClearThenType(12, "10");
  assert(next.blank === "", `blank ${next.blank}`);
  assert(next.duringEdit === "10", `during ${next.duringEdit}`);
  assert(next.committed === 10 && next.error === false, JSON.stringify(next));
});

check("2b. Pack 12 → clear → 24 = 24", () => {
  const next = simulateQtyClearThenType(12, "24");
  assert(next.blank === "" && next.committed === 24 && next.display === "24", JSON.stringify(next));
  const patched = applyUnitPricingPatch({
    editedUnitId: "pack",
    patch: { conversionQty: next.committed },
    shareStock: true,
    units: [
      { addAmountLak: 0, conversionQty: 1, costPriceLak: 5000, hierarchyQty: 1, id: "piece", markupPercent: 10, pricingMode: "manual" as const, roundingLak: 500, sellingPriceLak: 7000, status: "active" as const, unitName: "Piece" },
      { addAmountLak: 0, conversionQty: 12, costPriceLak: 28000, hierarchyQty: 12, id: "pack", markupPercent: 0, pricingMode: "manual" as const, roundingLak: 0, sellingPriceLak: 30000, status: "active" as const, unitName: "Pack" },
      { addAmountLak: 0, conversionQty: 24, costPriceLak: 250000, hierarchyQty: 2, id: "box", markupPercent: 0, pricingMode: "manual" as const, roundingLak: 0, sellingPriceLak: 260000, status: "active" as const, unitName: "Box" },
    ],
  });
  assert(patched.find((row) => row.id === "pack")?.conversionQty === 24, "pack conversionQty");
  assert(patched.find((row) => row.id === "pack")?.costPriceLak === 28000, "pack cost");
  assert(patched.find((row) => row.id === "box")?.costPriceLak === 250000, "box cost");
});

check("3. Box 24 → clear → 6 => 6", () => {
  const next = simulateQtyClearThenType(24, "6");
  assert(next.blank === "" && next.committed === 6, JSON.stringify(next));
});

check("4. Box 24 → clear → 12 => 12", () => {
  const next = simulateQtyClearThenType(24, "12");
  assert(next.blank === "" && next.committed === 12, JSON.stringify(next));
});

check("4b. Box 24 → clear → 60 = 60", () => {
  const next = simulateQtyClearThenType(24, "60");
  assert(next.blank === "" && next.committed === 60 && next.display === "60", JSON.stringify(next));
  const patched = applyUnitPricingPatch({
    editedUnitId: "box",
    patch: { conversionQty: next.committed },
    shareStock: true,
    units: [
      { addAmountLak: 0, conversionQty: 1, costPriceLak: 5000, hierarchyQty: 1, id: "piece", markupPercent: 10, pricingMode: "manual" as const, roundingLak: 500, sellingPriceLak: 7000, status: "active" as const, unitName: "Piece" },
      { addAmountLak: 0, conversionQty: 12, costPriceLak: 28000, hierarchyQty: 12, id: "pack", markupPercent: 0, pricingMode: "manual" as const, roundingLak: 0, sellingPriceLak: 30000, status: "active" as const, unitName: "Pack" },
      { addAmountLak: 0, conversionQty: 24, costPriceLak: 250000, hierarchyQty: 2, id: "box", markupPercent: 0, pricingMode: "manual" as const, roundingLak: 0, sellingPriceLak: 260000, status: "active" as const, unitName: "Box" },
    ],
  });
  assert(patched.find((row) => row.id === "box")?.conversionQty === 60, "box conversionQty");
  assert(patched.find((row) => row.id === "box")?.costPriceLak === 250000, "box cost");
  assert(patched.find((row) => row.id === "pack")?.costPriceLak === 28000, "pack cost");
});

check("4c. Paste 144 → 144", () => {
  const next = simulateQtyReplace(24, "144");
  assert(next.duringEdit === "144", `during ${next.duringEdit}`);
  assert(next.committed === 144 && next.display === "144" && next.error === false, JSON.stringify(next));
  const patched = applyUnitPricingPatch({
    editedUnitId: "box",
    patch: { conversionQty: next.committed },
    shareStock: true,
    units: [
      { addAmountLak: 0, conversionQty: 1, costPriceLak: 5000, hierarchyQty: 1, id: "piece", markupPercent: 0, pricingMode: "manual" as const, roundingLak: 0, sellingPriceLak: 7000, status: "active" as const, unitName: "Piece" },
      { addAmountLak: 0, conversionQty: 12, costPriceLak: 28000, hierarchyQty: 12, id: "pack", markupPercent: 0, pricingMode: "manual" as const, roundingLak: 0, sellingPriceLak: 30000, status: "active" as const, unitName: "Pack" },
      { addAmountLak: 0, conversionQty: 24, costPriceLak: 250000, hierarchyQty: 2, id: "box", markupPercent: 0, pricingMode: "manual" as const, roundingLak: 0, sellingPriceLak: 260000, status: "active" as const, unitName: "Box" },
    ],
  });
  assert(patched.find((row) => row.id === "box")?.conversionQty === 144, "pasted conversionQty");
  assert(patched.find((row) => row.id === "box")?.costPriceLak === 250000, "box cost");
});

check("5. Temporarily blank field remains blank during edit", () => {
  const focused = onQtyInputFocus(qtyInputFromCommitted(12));
  const blank = onQtyInputChange(focused, "");
  assert(qtyInputDisplay(blank) === "", `display ${qtyInputDisplay(blank)}`);
  assert(blank.committed === 12, "must not restore committed while editing");
  assert(blank.error === true, "validation may show while blank");
});

check("6. Blur with valid value commits", () => {
  const typed = onQtyInputChange(onQtyInputFocus(qtyInputFromCommitted(12)), "100");
  const blurred = onQtyInputBlur(typed);
  assert(blurred.committed === 100 && qtyInputDisplay(blurred) === "100" && blurred.error === false, JSON.stringify(blurred));
});

check("7. Blur with invalid/blank restores last valid value", () => {
  const blank = onQtyInputChange(onQtyInputFocus(qtyInputFromCommitted(12)), "");
  const blurred = onQtyInputBlur(blank);
  assert(blurred.committed === 12, "committed restored");
  assert(qtyInputDisplay(blurred) === "12", `display ${qtyInputDisplay(blurred)}`);
  assert(blurred.error === true, "validation after invalid blur");
  const invalid = onQtyInputBlur(onQtyInputChange(onQtyInputFocus(qtyInputFromCommitted(24)), "-3"));
  assert(invalid.committed === 24 && qtyInputDisplay(invalid) === "24", JSON.stringify(invalid));
});

check("8. Box without Pack 24 → 10", () => {
  const next = simulateQtyReplace(24, "10");
  assert(next.committed === 10 && next.display === "10" && next.error === false, JSON.stringify(next));
  const patched = applyUnitPricingPatch({
    editedUnitId: "box",
    patch: { hierarchyQty: next.committed },
    shareStock: true,
    units: [
      { addAmountLak: 0, conversionQty: 1, costPriceLak: 5000, hierarchyQty: 1, id: "piece", markupPercent: 0, pricingMode: "manual" as const, roundingLak: 0, sellingPriceLak: 7000, status: "active" as const, unitName: "Piece" },
      { addAmountLak: 0, conversionQty: 24, costPriceLak: 250000, hierarchyQty: 24, id: "box", markupPercent: 0, pricingMode: "manual" as const, roundingLak: 0, sellingPriceLak: 260000, status: "active" as const, unitName: "Box" },
    ],
  });
  assert(patched.find((row) => row.id === "box")?.conversionQty === 10, "box base 10");
  assert(patched.find((row) => row.id === "box")?.costPriceLak === 250000, "box cost");
});

check("9. Box with Pack 12: 2 Packs → 3 Packs, baseQty 36, costs unchanged", () => {
  const next = simulateQtyReplace(2, "3");
  assert(next.committed === 3, "packs committed");
  const patched = applyUnitPricingPatch({
    editedUnitId: "box",
    patch: { hierarchyQty: next.committed },
    shareStock: true,
    units: [
      { addAmountLak: 0, conversionQty: 1, costPriceLak: 5000, hierarchyQty: 1, id: "piece", markupPercent: 10, pricingMode: "manual" as const, roundingLak: 500, sellingPriceLak: 7000, status: "active" as const, unitName: "Piece" },
      { addAmountLak: 0, conversionQty: 12, costPriceLak: 28000, hierarchyQty: 12, id: "pack", markupPercent: 0, pricingMode: "manual" as const, roundingLak: 0, sellingPriceLak: 30000, status: "active" as const, unitName: "Pack" },
      { addAmountLak: 0, conversionQty: 24, costPriceLak: 250000, hierarchyQty: 2, id: "box", markupPercent: 0, pricingMode: "manual" as const, roundingLak: 0, sellingPriceLak: 260000, status: "active" as const, unitName: "Box" },
    ],
  });
  assert(patched.find((row) => row.id === "box")?.conversionQty === 36, "box base 36");
  assert(patched.find((row) => row.id === "pack")?.conversionQty === 12, "pack base");
  assert(patched.find((row) => row.id === "piece")?.costPriceLak === 5000, "piece cost");
  assert(patched.find((row) => row.id === "pack")?.costPriceLak === 28000, "pack cost");
  assert(patched.find((row) => row.id === "box")?.costPriceLak === 250000, "box cost");
  assert(patched.find((row) => row.id === "piece")?.sellingPriceLak === 7000, "piece selling");
  assert(patched.find((row) => row.id === "pack")?.sellingPriceLak === 30000, "pack selling");
  assert(patched.find((row) => row.id === "box")?.sellingPriceLak === 260000, "box selling");
});

check("10. No pricing/cost values change during this input edit", () => {
  const start = [
    { addAmountLak: 0, conversionQty: 1, costPriceLak: 5000, hierarchyQty: 1, id: "piece", markupPercent: 10, pricingMode: "manual" as const, roundingLak: 500, sellingPriceLak: 7000, status: "active" as const, unitName: "Piece" },
    { addAmountLak: 0, conversionQty: 12, costPriceLak: 28000, hierarchyQty: 12, id: "pack", markupPercent: 0, pricingMode: "manual" as const, roundingLak: 0, sellingPriceLak: 30000, status: "active" as const, unitName: "Pack" },
    { addAmountLak: 0, conversionQty: 120, costPriceLak: 250000, hierarchyQty: 10, id: "box", markupPercent: 0, pricingMode: "manual" as const, roundingLak: 0, sellingPriceLak: 260000, status: "active" as const, unitName: "Box" },
  ];
  const during = simulateQtyReplace(12, "6");
  assert(during.committed === 6, "qty committed");
  const next = applyUnitPricingPatch({
    editedUnitId: "pack",
    patch: { conversionQty: during.committed },
    shareStock: true,
    units: start,
  });
  assert(next.find((row) => row.id === "piece")?.costPriceLak === 5000, "piece cost");
  assert(next.find((row) => row.id === "pack")?.costPriceLak === 28000, "pack cost");
  assert(next.find((row) => row.id === "box")?.costPriceLak === 250000, "box cost");
  assert(next.find((row) => row.id === "piece")?.sellingPriceLak === 7000, "piece selling");
  assert(next.find((row) => row.id === "pack")?.sellingPriceLak === 30000, "pack selling");
  assert(next.find((row) => row.id === "box")?.sellingPriceLak === 260000, "box selling");
});

const failed = results.filter((row) => row.status === "FAIL");
console.log(JSON.stringify({ failed: failed.length, passed: results.length - failed.length, total: results.length }, null, 2));
if (failed.length > 0) process.exit(1);
