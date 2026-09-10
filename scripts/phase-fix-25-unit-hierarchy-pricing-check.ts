import { applyPersistedHierarchyCosts, hydrateHierarchyQty, isHierarchyQtyLocked, parsePositiveQty } from "../features/products/unit-hierarchy";
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
    costPriceLak: 0,
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

const piece = () => unit("piece", "Piece", 1, { isBaseUnit: true });
const pack = (qty = 6) => unit("pack", "Pack", qty, { hierarchyQty: qty });
const box = (conversionQty = 72, hierarchyQty = 12) => unit("box", "Box", conversionQty, { hierarchyQty });

function trio() {
  return [piece(), pack(6), box(72, 12)];
}

check("A. Piece only", () => {
  const next = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { costPriceLak: 5000 },
    shareStock: true,
    units: [piece()],
  });
  assert(next.length === 1 && next[0].conversionQty === 1 && next[0].costPriceLak === 5000, JSON.stringify(next[0]));
});

check("B. Piece + Pack", () => {
  const next = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { costPriceLak: 5000 },
    shareStock: true,
    units: [piece(), pack(6)],
  });
  assert(next.find((row) => row.id === "pack")?.costPriceLak === 30000, "pack cost");
  assert(next.find((row) => row.id === "pack")?.conversionQty === 6, "pack base qty");
});

check("C. Piece + Pack + Box", () => {
  const next = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { costPriceLak: 5000 },
    shareStock: true,
    units: trio(),
  });
  assert(next.find((row) => row.id === "piece")?.costPriceLak === 5000, "piece");
  assert(next.find((row) => row.id === "pack")?.costPriceLak === 30000, "pack 5000*6");
  assert(next.find((row) => row.id === "box")?.costPriceLak === 360000, "box 30000*12");
  assert(next.find((row) => row.id === "box")?.conversionQty === 72, "box base qty 6*12");
});

check("D. Pack only", () => {
  const next = applyUnitPricingPatch({
    editedUnitId: "pack",
    patch: { costPriceLak: 30000 },
    shareStock: true,
    units: [pack(6)],
  });
  assert(next[0].conversionQty === 1, "pack is base qty 1");
  assert(next[0].costPriceLak === 30000, "direct pack cost");
  assert(next[0].isBaseUnit === true, "pack is base");
});

check("E. Box only", () => {
  const next = applyUnitPricingPatch({
    editedUnitId: "box",
    patch: { costPriceLak: 360000 },
    shareStock: true,
    units: [box(72, 12)],
  });
  assert(next[0].conversionQty === 1, "box is base qty 1");
  assert(next[0].costPriceLak === 360000, "direct box cost");
  assert(next[0].isBaseUnit === true, "box is base");
});

check("F. Pack quantity change recalculates Pack cost", () => {
  const start = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { costPriceLak: 5000 },
    shareStock: true,
    units: trio(),
  });
  const next = applyUnitPricingPatch({
    editedUnitId: "pack",
    patch: { hierarchyQty: 10 },
    shareStock: true,
    units: start,
  });
  assert(next.find((row) => row.id === "pack")?.costPriceLak === 50000, "pack 5000*10");
  assert(next.find((row) => row.id === "pack")?.conversionQty === 10, "pack base qty");
});

check("G. Pack quantity change recalculates Box cost", () => {
  const start = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { costPriceLak: 5000 },
    shareStock: true,
    units: trio(),
  });
  const next = applyUnitPricingPatch({
    editedUnitId: "pack",
    patch: { hierarchyQty: 10 },
    shareStock: true,
    units: start,
  });
  assert(next.find((row) => row.id === "box")?.hierarchyQty === 12, "packs per box kept");
  assert(next.find((row) => row.id === "box")?.conversionQty === 120, "box base 10*12");
  assert(next.find((row) => row.id === "box")?.costPriceLak === 600000, "box 50000*12");
  assert(next.find((row) => row.id === "piece")?.costPriceLak === 5000, "piece unchanged");
});

check("H. Box quantity change recalculates Box cost only", () => {
  const start = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { costPriceLak: 5000 },
    shareStock: true,
    units: trio(),
  });
  const next = applyUnitPricingPatch({
    editedUnitId: "box",
    patch: { hierarchyQty: 8 },
    shareStock: true,
    units: start,
  });
  assert(next.find((row) => row.id === "pack")?.costPriceLak === 30000, "pack unchanged");
  assert(next.find((row) => row.id === "pack")?.conversionQty === 6, "pack qty unchanged");
  assert(next.find((row) => row.id === "box")?.conversionQty === 48, "box base 6*8");
  assert(next.find((row) => row.id === "box")?.costPriceLak === 240000, "box 30000*8");
});

check("I. Disabled Pack is excluded", () => {
  const start = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { costPriceLak: 5000 },
    shareStock: true,
    units: trio(),
  });
  const next = applyUnitPricingPatch({
    editedUnitId: "pack",
    patch: { status: "inactive" },
    shareStock: true,
    units: start,
  });
  assert(next.find((row) => row.id === "pack")?.status === "inactive", "pack inactive");
  assert(next.find((row) => row.id === "pack")?.costPriceLak === 30000, "inactive pack cost not recalculated");
  assert(next.find((row) => row.id === "box")?.conversionQty === 72, "box keeps piece base qty");
  assert(next.find((row) => row.id === "box")?.costPriceLak === 360000, "box still 5000*72");
});

check("J. Disabled Box is excluded", () => {
  const start = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { costPriceLak: 5000 },
    shareStock: true,
    units: trio(),
  });
  const next = applyUnitPricingPatch({
    editedUnitId: "box",
    patch: { status: "inactive" },
    shareStock: true,
    units: start,
  });
  const afterPack = applyUnitPricingPatch({
    editedUnitId: "pack",
    patch: { hierarchyQty: 10 },
    shareStock: true,
    units: next,
  });
  assert(afterPack.find((row) => row.id === "box")?.status === "inactive", "box inactive");
  assert(afterPack.find((row) => row.id === "box")?.costPriceLak === 360000, "inactive box cost frozen");
  assert(afterPack.find((row) => row.id === "pack")?.costPriceLak === 50000, "pack still recalculates");
});

check("K. Piece quantity stays locked at 1", () => {
  const next = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { hierarchyQty: 9, conversionQty: 9 },
    shareStock: true,
    units: trio(),
  });
  assert(next.find((row) => row.id === "piece")?.conversionQty === 1, "piece qty");
  assert(isHierarchyQtyLocked(next.find((row) => row.id === "piece")!, next), "locked");
});

check("L. Markup does not mutate cost", () => {
  const start = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { costPriceLak: 5000, pricingMode: "cost_plus_percent", markupPercent: 10 },
    shareStock: true,
    units: trio().map((row) => ({ ...row, pricingMode: "cost_plus_percent" as const, markupPercent: 10 })),
  });
  const next = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { markupPercent: 50 },
    shareStock: true,
    units: start,
  });
  assert(next.find((row) => row.id === "piece")?.costPriceLak === 5000, "piece cost");
  assert(next.find((row) => row.id === "pack")?.costPriceLak === 30000, "pack cost");
  assert(next.find((row) => row.id === "box")?.costPriceLak === 360000, "box cost");
});

check("M. Rounding does not mutate cost", () => {
  const start = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { costPriceLak: 5000, pricingMode: "cost_plus_percent", roundingLak: 500, markupPercent: 0 },
    shareStock: true,
    units: [{ ...piece(), pricingMode: "cost_plus_percent", markupPercent: 0, roundingLak: 0 }],
  });
  const next = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { roundingLak: 1000 },
    shareStock: true,
    units: start,
  });
  assert(next[0].costPriceLak === 5000, "cost unchanged");
  assert(next[0].sellingPriceLak === 5000, "sell rounded from cost");
  assert(sellingPriceFromCost({ costPriceLak: 5000, markupPercent: 0, pricingMode: "cost_plus_percent", roundingLak: 1000 }) === 5000, "formula");
});

check("N. No NaN / Infinity / negative invalid conversion", () => {
  const start = trio();
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -3, 0]) {
    const next = applyUnitPricingPatch({
      editedUnitId: "pack",
      patch: { hierarchyQty: value },
      shareStock: true,
      units: start,
    });
    assert(next.find((row) => row.id === "pack")?.conversionQty === 6, `kept previous for ${String(value)}`);
    assert(next.every((row) => Number.isFinite(Number(row.conversionQty)) && Number(row.conversionQty) > 0), "finite qty");
    assert(next.every((row) => Number.isFinite(Number(row.costPriceLak ?? 0))), "finite cost");
  }
  assert(parsePositiveQty(-1) === null && parsePositiveQty(Number.NaN) === null, "parser");
});

check("O. Existing product load/edit remains compatible", () => {
  const stored = hydrateHierarchyQty([
    unit("piece", "Piece", 1, { costPriceLak: 8000, isBaseUnit: true }),
    unit("pack", "Pack", 12, { costPriceLak: 96000 }),
    unit("box", "Box", 24, { costPriceLak: 192000 }),
  ]);
  assert(stored.find((row) => row.id === "pack")?.hierarchyQty === 12, "pack pieces hydrated");
  assert(stored.find((row) => row.id === "box")?.hierarchyQty === 2, "packs per box 24/12");
  assert(stored.find((row) => row.id === "pack")?.costPriceLak === 96000, "stored pack cost kept until edit");
  assert(stored.find((row) => row.id === "box")?.costPriceLak === 192000, "stored box cost kept until edit");
  const persisted = applyPersistedHierarchyCosts(stored);
  assert(persisted.find((row) => row.id === "pack")?.conversionQty === 12, "pack conversion kept");
  assert(persisted.find((row) => row.id === "box")?.conversionQty === 24, "box conversion kept");
  assert(persisted.find((row) => row.id === "pack")?.costPriceLak === 96000, "pack 8000*12");
  assert(persisted.find((row) => row.id === "box")?.costPriceLak === 192000, "box 96000*2");
});

const failed = results.filter((row) => row.status === "FAIL");
console.log(JSON.stringify({ failed: failed.length, passed: results.length - failed.length, total: results.length }, null, 2));
if (failed.length > 0) process.exit(1);
