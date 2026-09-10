import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  derivedCostBreakdown,
  hierarchyQtyEditor,
  hierarchyRelationText,
  hydrateHierarchyQty,
  isHierarchyCostDerived,
  isHierarchyQtyLocked,
  parsePositiveQty,
} from "../features/products/unit-hierarchy";
import { applyUnitPricingPatch } from "../features/products/unit-pricing";
import { getProductsCopy, productsCopyKeyParity } from "../lib/i18n/products-copy";

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
const trio = () => [piece(), pack(6), box(72, 12)];

const root = process.cwd();
const productForm = readFileSync(join(root, "features/products/components/product-form.tsx"), "utf8");
const hierarchy = readFileSync(join(root, "features/products/unit-hierarchy.ts"), "utf8");
const en = getProductsCopy("en");
const lo = getProductsCopy("lo");

check("A. Piece quantity is locked at 1", () => {
  const units = trio();
  const editor = hierarchyQtyEditor(units[0], units);
  assert(editor.locked && editor.value === 1, "editor not locked at 1");
  assert(isHierarchyQtyLocked(units[0], units), "piece qty not locked");
  assert(productForm.includes("disabled readOnly value={1}"), "piece qty input is editable");
  assert(!productForm.includes('t("qtyInBase")'), "Qty in Base still shown as primary label");
});

check("B. Piece-only product is allowed", () => {
  const units = [piece()];
  const editor = hierarchyQtyEditor(units[0], units);
  assert(editor.locked && editor.prefix === "Quantity" && editor.value === 1, JSON.stringify(editor));
  const next = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { costPriceLak: 5000 },
    shareStock: true,
    units,
  });
  assert(next.length === 1 && next[0].costPriceLak === 5000 && next[0].conversionQty === 1, "piece-only cost");
});

check("C. Piece + Pack shows 1 Pack = X Pieces and derived Pack cost", () => {
  const start = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { costPriceLak: 5000 },
    shareStock: true,
    units: [piece(), pack(6)],
  });
  const packUnit = start.find((row) => row.id === "pack")!;
  const editor = hierarchyQtyEditor(packUnit, start);
  assert(editor.prefix === "1 Pack =" && editor.suffix === "Pieces" && editor.value === 6, JSON.stringify(editor));
  assert(hierarchyRelationText(packUnit, start) === "1 Pack = 6 Pieces", hierarchyRelationText(packUnit, start));
  assert(isHierarchyCostDerived(packUnit, start), "pack cost should be derived");
  assert(packUnit.costPriceLak === 30000, "pack cost 5000*6");
  const breakdown = derivedCostBreakdown(packUnit, start);
  assert(breakdown?.left === 5000 && breakdown.qty === 6 && breakdown.result === 30000, JSON.stringify(breakdown));
  assert(en.onePackEquals === "1 Pack =" && en.piecesWord === "Pieces" && en.calculatedCost === "Calculated Cost", "copy");
  assert(productForm.includes('t("onePackEquals")') && productForm.includes('t("calculatedCost")'), "form missing pack labels");
});

check("C2. Pack selling price uses Pack cost, not Piece selling price", () => {
  const priced = trio().map((row) => (
    row.id === "piece"
      ? { ...row, sellingPriceLak: 7000, pricingMode: "manual" as const }
      : { ...row, pricingMode: "cost_plus_percent" as const, markupPercent: 0 }
  ));
  const next = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { costPriceLak: 5000 },
    shareStock: true,
    units: priced,
  });
  assert(next.find((row) => row.id === "piece")?.sellingPriceLak === 7000, "piece selling kept");
  assert(next.find((row) => row.id === "pack")?.costPriceLak === 30000, "pack cost");
  assert(next.find((row) => row.id === "pack")?.sellingPriceLak === 30000, "pack selling from pack cost");
  assert(next.find((row) => row.id === "box")?.costPriceLak === 360000, "box cost");
  assert(next.find((row) => row.id === "box")?.sellingPriceLak === 360000, "box selling from box cost");
});

check("D. Piece + Pack + Box shows 1 Box = X Packs and derived Box cost", () => {
  const start = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { costPriceLak: 5000 },
    shareStock: true,
    units: trio(),
  });
  const boxUnit = start.find((row) => row.id === "box")!;
  const editor = hierarchyQtyEditor(boxUnit, start);
  assert(editor.prefix === "1 Box =" && editor.suffix === "Packs" && editor.value === 12, JSON.stringify(editor));
  assert(hierarchyRelationText(boxUnit, start) === "1 Box = 12 Packs", hierarchyRelationText(boxUnit, start));
  assert(boxUnit.costPriceLak === 360000 && boxUnit.conversionQty === 72, "box 30000*12 / base 72");
  assert(productForm.includes('t("oneBoxEquals")') && productForm.includes('t("packsWord")'), "form missing box labels");
});

check("E. Pack-only product allows direct Pack cost", () => {
  const units = [pack(6)];
  const editor = hierarchyQtyEditor(units[0], units);
  assert(editor.locked && editor.value === 1, "standalone pack qty");
  assert(!isHierarchyCostDerived(units[0], units), "pack-only cost should be direct");
  const next = applyUnitPricingPatch({
    editedUnitId: "pack",
    patch: { costPriceLak: 30000 },
    shareStock: true,
    units,
  });
  assert(next[0].conversionQty === 1 && next[0].costPriceLak === 30000, "direct pack cost");
});

check("F. Box-only product allows direct Box cost", () => {
  const units = [box(72, 12)];
  const editor = hierarchyQtyEditor(units[0], units);
  assert(editor.locked && editor.value === 1, "standalone box qty");
  assert(!isHierarchyCostDerived(units[0], units), "box-only cost should be direct");
  const next = applyUnitPricingPatch({
    editedUnitId: "box",
    patch: { costPriceLak: 360000 },
    shareStock: true,
    units,
  });
  assert(next[0].conversionQty === 1 && next[0].costPriceLak === 360000, "direct box cost");
});

check("G. Pack change 6 → 10 updates Pack Cost", () => {
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
  assert(hierarchyRelationText(next.find((row) => row.id === "pack")!, next) === "1 Pack = 10 Pieces", "pack relation");
});

check("H. Pack change updates downstream Box Cost", () => {
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
  assert(next.find((row) => row.id === "box")?.costPriceLak === 600000, "box 50000*12");
  assert(next.find((row) => row.id === "piece")?.costPriceLak === 5000, "piece unchanged");
});

check("I. Box quantity change only affects Box", () => {
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
  assert(next.find((row) => row.id === "box")?.costPriceLak === 240000, "box 30000*8");
});

check("J. Disabled Pack UI hides active pricing controls", () => {
  assert(productForm.includes('t("unitDisabledHint")'), "missing disabled hint");
  assert(productForm.includes("{!enabled ?"), "disabled units still render active controls");
  assert(productForm.includes('status: event.target.checked ? "active" : "inactive"'), "missing enable checkbox");
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
  assert(!isHierarchyCostDerived(next.find((row) => row.id === "pack")!, next), "disabled pack not derived");
});

check("K. Disabled Box UI hides active pricing controls", () => {
  assert(productForm.includes("data-unit-role={unitRole(unit.unitName)}"), "unit cards missing");
  assert(productForm.includes('t("enableNamedUnit")'), "missing per-unit enable checkbox label");
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
  assert(next.find((row) => row.id === "box")?.status === "inactive", "box inactive");
  const afterPack = applyUnitPricingPatch({
    editedUnitId: "pack",
    patch: { hierarchyQty: 10 },
    shareStock: true,
    units: next,
  });
  assert(afterPack.find((row) => row.id === "box")?.costPriceLak === 360000, "disabled box cost frozen");
});

check("L. Legacy baseQty 1/6/72 displays as 1 Pack=6 Pieces, 1 Box=12 Packs", () => {
  const stored = [
    unit("piece", "Piece", 1, { costPriceLak: 5000, isBaseUnit: true }),
    unit("pack", "Pack", 6, { costPriceLak: 30000 }),
    unit("box", "Box", 72, { costPriceLak: 360000 }),
  ];
  const hydrated = hydrateHierarchyQty(stored);
  assert(hydrated.find((row) => row.id === "pack")?.hierarchyQty === 6, "pack pieces");
  assert(hydrated.find((row) => row.id === "box")?.hierarchyQty === 12, "packs per box");
  assert(hierarchyRelationText(hydrated[0], hydrated) === "Piece = 1", "piece relation");
  assert(hierarchyRelationText(hydrated[1], hydrated) === "1 Pack = 6 Pieces", "pack relation");
  assert(hierarchyRelationText(hydrated[2], hydrated) === "1 Box = 12 Packs", "box relation");
  assert(hydrated.find((row) => row.id === "pack")?.costPriceLak === 30000, "opening must not rewrite pack cost");
  assert(hydrated.find((row) => row.id === "box")?.costPriceLak === 360000, "opening must not rewrite box cost");
  assert(hydrated.find((row) => row.id === "pack")?.conversionQty === 6, "pack conversion kept");
  assert(hydrated.find((row) => row.id === "box")?.conversionQty === 72, "box conversion kept");
  assert(productForm.includes("useState<ProductUnit[]>(() => hydrateHierarchyQty("), "edit load must hydrate only");
  assert(!productForm.includes("useState<ProductUnit[]>(() => applyHierarchyConversionsAndCosts"), "opening must not persist-recalc");
});

check("M. Invalid zero/negative conversion is rejected", () => {
  assert(parsePositiveQty(0) === null && parsePositiveQty(-4) === null, "parser");
  assert(parsePositiveQty(Number.NaN) === null && parsePositiveQty(Number.POSITIVE_INFINITY) === null, "nan/inf");
  assert(parsePositiveQty("") === null && parsePositiveQty(" ") === null, "blank");
  const start = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { costPriceLak: 5000 },
    shareStock: true,
    units: trio(),
  });
  for (const value of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
    const next = applyUnitPricingPatch({
      editedUnitId: "pack",
      patch: { hierarchyQty: value },
      shareStock: true,
      units: start,
    });
    assert(next.find((row) => row.id === "pack")?.costPriceLak === 30000, `did not keep pack cost for ${String(value)}`);
    assert(next.find((row) => row.id === "pack")?.conversionQty === 6, `did not keep pack qty for ${String(value)}`);
    assert(next.find((row) => row.id === "box")?.costPriceLak === 360000, `did not keep box cost for ${String(value)}`);
  }
  assert(productForm.includes("commitHierarchyQty"), "qty commit missing");
  assert(productForm.includes("parsePositiveQty(raw)"), "invalid qty not parsed");
  assert(productForm.includes('t("invalidUnitQuantity")'), "missing field validation copy");
  assert(en.invalidUnitQuantity.includes("greater than 0"), en.invalidUnitQuantity);
});

check("N. Create and Edit use the same unit rules", () => {
  const usages = productForm.match(/<ProductUnitsTable /g) ?? [];
  assert(usages.length === 2, `expected shared table on create and edit, got ${usages.length}`);
  assert(productForm.includes('mode, product,'), "create/edit share ProductForm");
  assert(!productForm.includes("function CreateUnitsTable") && !productForm.includes("function EditUnitsTable"), "split unit tables");
});

check("O. Phase 1 hierarchy formulas remain in place", () => {
  assert(hierarchy.includes("deriveSharedUnitCost(Number(piece.costPriceLak ?? 0), 1, piecesPerPack)"), "pack formula changed");
  assert(hierarchy.includes("deriveSharedUnitCost(Number(pack.costPriceLak ?? 0), Number(pack.conversionQty), Number(box.conversionQty))"), "box formula changed");
  assert(productForm.includes("applyUnitPricingPatch"), "form no longer uses Phase 1 patch");
  const next = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { costPriceLak: 5000 },
    shareStock: true,
    units: trio(),
  });
  assert(next.find((row) => row.id === "piece")?.costPriceLak === 5000, "piece");
  assert(next.find((row) => row.id === "pack")?.costPriceLak === 30000, "pack");
  assert(next.find((row) => row.id === "box")?.costPriceLak === 360000, "box");
});

check("Copy. Merchant labels exist in EN/LO without Qty in Base as primary UX", () => {
  assert(productsCopyKeyParity(), "en/lo key parity");
  assert(en.onePackEquals === "1 Pack =" && lo.onePackEquals === "1 Pack =", "pack label");
  assert(en.oneBoxEquals === "1 Box =" && lo.oneBoxEquals === "1 Box =", "box label");
  assert(en.calculatedCost !== lo.calculatedCost && en.sellingPrice !== lo.sellingPrice, "localized cost/price labels");
  assert(en.unitDisabledHint !== lo.unitDisabledHint && en.invalidUnitQuantity !== lo.invalidUnitQuantity, "validation copy");
  assert(productForm.includes('t("sellingPrice")'), "selling price label missing");
});

const failed = results.filter((row) => row.status === "FAIL");
console.log(JSON.stringify({ failed: failed.length, passed: results.length - failed.length, total: results.length }, null, 2));
if (failed.length > 0) process.exit(1);
