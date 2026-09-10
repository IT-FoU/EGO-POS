import { applyHierarchyConversions, applyPersistedHierarchyCosts, hydrateHierarchyQty, isHierarchyQtyLocked, parsePositiveQty } from "../features/products/unit-hierarchy";
import { applyUnitPricingPatch, sellingPriceFromCost } from "../features/products/unit-pricing";

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
    hierarchyQty: extra.hierarchyQty as number | undefined,
    id,
    markupPercent: 0,
    pricingMode: "manual" as const,
    roundingLak: 0,
    sellingPriceLak: 0,
    status: "active" as const,
    unitName,
    ...extra,
  };
}

const piece = () => unit("piece", "Piece", 1, { isBaseUnit: true, costPriceLak: 5000 });
const pack = (qty = 6, cost = 28000) => unit("pack", "Pack", qty, { hierarchyQty: qty, costPriceLak: cost });
const box = (conversionQty = 60, hierarchyQty = 10, cost = 250000) => unit("box", "Box", conversionQty, { hierarchyQty, costPriceLak: cost });
const trio = () => [piece(), pack(6, 28000), box(60, 10, 250000)];

check("A. Piece Cost is manual", () => {
  const next = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { costPriceLak: 7000 },
    shareStock: true,
    units: trio(),
  });
  assert(next.find((row) => row.id === "piece")?.costPriceLak === 7000, "piece cost");
  assert(next.find((row) => row.id === "pack")?.costPriceLak === 28000, "pack not derived");
  assert(next.find((row) => row.id === "box")?.costPriceLak === 250000, "box not derived");
});

check("B. Pack Cost is manual", () => {
  const next = applyUnitPricingPatch({
    editedUnitId: "pack",
    patch: { costPriceLak: 28000 },
    shareStock: true,
    units: trio(),
  });
  assert(next.find((row) => row.id === "pack")?.costPriceLak === 28000, "pack cost");
  assert(next.find((row) => row.id === "piece")?.costPriceLak === 5000, "piece unchanged");
});

check("C. Box Cost is manual", () => {
  const next = applyUnitPricingPatch({
    editedUnitId: "box",
    patch: { costPriceLak: 360000 },
    shareStock: true,
    units: trio(),
  });
  assert(next.find((row) => row.id === "box")?.costPriceLak === 360000, "box cost");
  assert(next.find((row) => row.id === "pack")?.costPriceLak === 28000, "pack unchanged");
});

check("D. Pack conversion does not modify Pack Cost", () => {
  const next = applyUnitPricingPatch({
    editedUnitId: "pack",
    patch: { hierarchyQty: 10 },
    shareStock: true,
    units: trio(),
  });
  assert(next.find((row) => row.id === "pack")?.conversionQty === 10, "pack base 10");
  assert(next.find((row) => row.id === "pack")?.costPriceLak === 28000, "pack cost frozen");
});

check("E. Pack conversion does not modify Box Cost", () => {
  const next = applyUnitPricingPatch({
    editedUnitId: "pack",
    patch: { hierarchyQty: 10 },
    shareStock: true,
    units: trio(),
  });
  assert(next.find((row) => row.id === "box")?.costPriceLak === 250000, "box cost frozen");
  assert(next.find((row) => row.id === "box")?.conversionQty === 100, "box stock 10*10");
  assert(next.find((row) => row.id === "box")?.hierarchyQty === 10, "packs per box kept");
});

check("F. Box conversion does not modify Box Cost", () => {
  const next = applyUnitPricingPatch({
    editedUnitId: "box",
    patch: { hierarchyQty: 12 },
    shareStock: true,
    units: trio(),
  });
  assert(next.find((row) => row.id === "box")?.costPriceLak === 250000, "box cost frozen");
  assert(next.find((row) => row.id === "piece")?.costPriceLak === 5000, "piece cost frozen");
  assert(next.find((row) => row.id === "pack")?.costPriceLak === 28000, "pack cost frozen");
  assert(next.find((row) => row.id === "box")?.conversionQty === 72, "box stock 6*12");
});

check("K. Piece pricing uses Piece Cost", () => {
  const next = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { pricingMode: "cost_plus_percent", markupPercent: 0, roundingLak: 0, costPriceLak: 5000 },
    shareStock: true,
    units: [{ ...piece(), pricingMode: "cost_plus_percent" }],
  });
  assert(next[0].sellingPriceLak === 5000, "piece selling");
  assert(sellingPriceFromCost({ costPriceLak: 5000, pricingMode: "cost_plus_percent", markupPercent: 0 }) === 5000, "formula");
});

check("L. Pack pricing uses Pack Cost", () => {
  const next = applyUnitPricingPatch({
    editedUnitId: "pack",
    patch: { pricingMode: "cost_plus_percent", markupPercent: 0, costPriceLak: 28000 },
    shareStock: true,
    units: [piece(), { ...pack(6, 28000), pricingMode: "cost_plus_percent" }],
  });
  assert(next.find((row) => row.id === "pack")?.sellingPriceLak === 28000, "pack selling from 28000");
  assert(next.find((row) => row.id === "piece")?.sellingPriceLak === 0, "piece selling not used");
});

check("M. Box pricing uses Box Cost", () => {
  const next = applyUnitPricingPatch({
    editedUnitId: "box",
    patch: { pricingMode: "cost_plus_percent", markupPercent: 0, costPriceLak: 250000 },
    shareStock: true,
    units: [...trio().slice(0, 2), { ...box(60, 10, 250000), pricingMode: "cost_plus_percent" }],
  });
  assert(next.find((row) => row.id === "box")?.sellingPriceLak === 250000, "box selling from 250000");
});

check("N. Piece + Pack stock conversion", () => {
  const next = applyHierarchyConversions([piece(), pack(6, 28000)]);
  assert(next.find((row) => row.id === "piece")?.conversionQty === 1, "piece base");
  assert(next.find((row) => row.id === "pack")?.conversionQty === 6, "pack base 6");
});

check("O. Piece + Pack + Box stock conversion", () => {
  const next = applyHierarchyConversions(trio());
  assert(next.find((row) => row.id === "pack")?.conversionQty === 6, "pack 6");
  assert(next.find((row) => row.id === "box")?.hierarchyQty === 10, "10 packs");
  assert(next.find((row) => row.id === "box")?.conversionQty === 60, "box base 60");
});

check("P. Piece + Box without Pack", () => {
  const next = applyHierarchyConversions([
    piece(),
    unit("box", "Box", 60, { hierarchyQty: 60, costPriceLak: 250000 }),
  ]);
  assert(next.find((row) => row.id === "box")?.conversionQty === 60, "box pieces 60");
  assert(next.find((row) => row.id === "box")?.hierarchyQty === 60, "display 60 pieces");
});

check("U. Existing product load does not recalculate manual costs", () => {
  const stored = hydrateHierarchyQty([
    unit("piece", "Piece", 1, { costPriceLak: 8000, isBaseUnit: true }),
    unit("pack", "Pack", 6, { costPriceLak: 28000 }),
    unit("box", "Box", 60, { costPriceLak: 250000 }),
  ]);
  assert(stored.find((row) => row.id === "pack")?.hierarchyQty === 6, "pack pieces");
  assert(stored.find((row) => row.id === "box")?.hierarchyQty === 10, "packs per box 60/6");
  assert(stored.find((row) => row.id === "pack")?.costPriceLak === 28000, "pack cost kept");
  assert(stored.find((row) => row.id === "box")?.costPriceLak === 250000, "box cost kept");
  const persisted = applyPersistedHierarchyCosts(stored);
  assert(persisted.find((row) => row.id === "pack")?.costPriceLak === 28000, "save path does not derive pack cost");
  assert(persisted.find((row) => row.id === "box")?.costPriceLak === 250000, "save path does not derive box cost");
  assert(persisted.find((row) => row.id === "box")?.conversionQty === 60, "box base kept");
});

check("Piece quantity stays locked at 1", () => {
  const next = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { hierarchyQty: 9, conversionQty: 9 },
    shareStock: true,
    units: trio(),
  });
  assert(next.find((row) => row.id === "piece")?.conversionQty === 1, "piece qty");
  assert(isHierarchyQtyLocked(next.find((row) => row.id === "piece")!, next), "locked");
});

check("Invalid conversion is rejected", () => {
  const start = trio();
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -3, 0]) {
    const next = applyUnitPricingPatch({
      editedUnitId: "pack",
      patch: { hierarchyQty: value },
      shareStock: true,
      units: start,
    });
    assert(next.find((row) => row.id === "pack")?.conversionQty === 6, `kept previous for ${String(value)}`);
    assert(next.find((row) => row.id === "pack")?.costPriceLak === 28000, "cost kept");
  }
  assert(parsePositiveQty(-1) === null && parsePositiveQty(Number.NaN) === null, "parser");
});

check("Box-only conversion is editable base pieces", () => {
  const next = applyHierarchyConversions([unit("box", "Box", 60, { hierarchyQty: 60, costPriceLak: 250000 })]);
  assert(next[0].conversionQty === 60, "box base pieces");
  assert(!isHierarchyQtyLocked(next[0], next), "box-only qty not locked");
});

const failed = results.filter((row) => row.status === "FAIL");
console.log(JSON.stringify({ failed: failed.length, passed: results.length - failed.length, total: results.length }, null, 2));
if (failed.length > 0) process.exit(1);
