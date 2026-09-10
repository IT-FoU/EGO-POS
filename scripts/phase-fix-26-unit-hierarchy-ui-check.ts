import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyConversionInput,
  applyHierarchyConversions,
  hierarchyQtyEditor,
  hierarchyRelationText,
  hydrateHierarchyQty,
  parsePositiveQty,
  replaceConversionValue,
} from "../features/products/unit-hierarchy";
import { applyUnitPricingPatch, sellingPriceFromCost } from "../features/products/unit-pricing";
import { requiredBaseQty } from "../features/pos/pos-cart";
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

const root = process.cwd();
const productForm = readFileSync(join(root, "features/products/components/product-form.tsx"), "utf8");
const hierarchy = readFileSync(join(root, "features/products/unit-hierarchy.ts"), "utf8");
const prismaRepo = readFileSync(join(root, "features/products/prisma-repository.ts"), "utf8");
const posRepo = readFileSync(join(root, "features/pos/prisma-repository.ts"), "utf8");
const en = getProductsCopy("en");

check("A. Piece Cost is manual", () => {
  assert(productForm.includes('Field label={t("costLak")}'), "cost field missing");
  assert(!productForm.includes("disabled={costDerived}"), "pack/box cost still locked");
  const next = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { costPriceLak: 5000 },
    shareStock: true,
    units: trio(),
  });
  assert(next.find((row) => row.id === "piece")?.costPriceLak === 5000, "piece cost");
});

check("B. Pack Cost is manual", () => {
  const next = applyUnitPricingPatch({
    editedUnitId: "pack",
    patch: { costPriceLak: 28000 },
    shareStock: true,
    units: trio(),
  });
  assert(next.find((row) => row.id === "pack")?.costPriceLak === 28000, "pack cost");
  assert(!hierarchy.includes("deriveSharedUnitCost"), "cost hierarchy helper still used");
});

check("C. Box Cost is manual", () => {
  const next = applyUnitPricingPatch({
    editedUnitId: "box",
    patch: { costPriceLak: 250000 },
    shareStock: true,
    units: trio(),
  });
  assert(next.find((row) => row.id === "box")?.costPriceLak === 250000, "box cost");
});

check("D. Changing Pack conversion does not modify Pack Cost", () => {
  const next = applyUnitPricingPatch({
    editedUnitId: "pack",
    patch: { hierarchyQty: 10 },
    shareStock: true,
    units: trio(),
  });
  assert(next.find((row) => row.id === "pack")?.costPriceLak === 28000, "pack cost");
  assert(next.find((row) => row.id === "pack")?.conversionQty === 10, "pack stock");
});

check("E. Changing Pack conversion does not modify Box Cost", () => {
  const next = applyUnitPricingPatch({
    editedUnitId: "pack",
    patch: { hierarchyQty: 10 },
    shareStock: true,
    units: trio(),
  });
  assert(next.find((row) => row.id === "box")?.costPriceLak === 250000, "box cost");
  assert(next.find((row) => row.id === "box")?.conversionQty === 100, "box stock follows pack");
});

check("F. Changing Box conversion does not modify Box Cost", () => {
  const next = applyUnitPricingPatch({
    editedUnitId: "box",
    patch: { hierarchyQty: 12 },
    shareStock: true,
    units: trio(),
  });
  assert(next.find((row) => row.id === "box")?.costPriceLak === 250000, "box cost");
  assert(next.find((row) => row.id === "pack")?.costPriceLak === 28000, "pack cost");
});

check("G. Pack conversion input fully replaces 12 → 6", () => {
  const next = replaceConversionValue("12", "6");
  assert(next.draft === "6" && next.committed === 6 && next.error === false, JSON.stringify(next));
});

check("H. Pack conversion input fully replaces 12 → 10", () => {
  const next = replaceConversionValue("12", "10");
  assert(next.draft === "10" && next.committed === 10 && next.error === false, JSON.stringify(next));
});

check("I. Box conversion input fully replaces 24 → 6", () => {
  const next = replaceConversionValue("24", "6");
  assert(next.draft === "6" && next.committed === 6 && next.error === false, JSON.stringify(next));
});

check("J. Input can be temporarily blank during editing", () => {
  const blank = applyConversionInput({ committed: 12, draft: "12", error: false }, "");
  assert(blank.draft === "" && blank.committed === 12 && blank.error === true, JSON.stringify(blank));
  const typed = applyConversionInput(blank, "6");
  assert(typed.draft === "6" && typed.committed === 6 && typed.error === false, JSON.stringify(typed));
  assert(productForm.includes('type="text"') && productForm.includes("applyConversionInput"), "form still uses locked number input");
  assert(productForm.includes('inputMode="numeric"'), "numeric keypad missing");
  assert(!productForm.includes('type="number" value={draft}'), "controlled number input still present");
});

check("K. Piece pricing uses Piece Cost", () => {
  assert(sellingPriceFromCost({ costPriceLak: 5000, pricingMode: "cost_plus_percent", markupPercent: 0 }) === 5000, "piece");
});

check("L. Pack pricing uses Pack Cost", () => {
  assert(sellingPriceFromCost({ costPriceLak: 28000, pricingMode: "cost_plus_percent", markupPercent: 0 }) === 28000, "pack");
});

check("M. Box pricing uses Box Cost", () => {
  assert(sellingPriceFromCost({ costPriceLak: 250000, pricingMode: "cost_plus_percent", markupPercent: 0 }) === 250000, "box");
});

check("N. Piece + Pack: 1 Pack = 6 Pieces, baseQty Pack = 6", () => {
  const next = applyHierarchyConversions([piece(), pack(6)]);
  const packUnit = next.find((row) => row.id === "pack")!;
  assert(hierarchyRelationText(packUnit, next) === "1 Pack = 6 Pieces", hierarchyRelationText(packUnit, next));
  assert(packUnit.conversionQty === 6, "pack base");
});

check("O. Piece + Pack + Box: 1 Box = 10 Packs, baseQty Box = 60", () => {
  const next = applyHierarchyConversions(trio());
  const packUnit = next.find((row) => row.id === "pack")!;
  const boxUnit = next.find((row) => row.id === "box")!;
  assert(hierarchyQtyEditor(packUnit, next).value === 6, "pack editor");
  assert(hierarchyRelationText(boxUnit, next) === "1 Box = 10 Packs", hierarchyRelationText(boxUnit, next));
  assert(boxUnit.conversionQty === 60, "box base 60");
});

check("P. Piece + Box without Pack: 1 Box = 60 Pieces, baseQty Box = 60", () => {
  const next = applyHierarchyConversions([
    piece(),
    unit("box", "Box", 60, { hierarchyQty: 60, costPriceLak: 250000 }),
  ]);
  const boxUnit = next.find((row) => row.id === "box")!;
  assert(hierarchyRelationText(boxUnit, next) === "1 Box = 60 Pieces", hierarchyRelationText(boxUnit, next));
  assert(boxUnit.conversionQty === 60, "box base");
});

check("Q. Sell 1 Piece deducts 1 base unit", () => {
  assert(requiredBaseQty(1, 1) === 1, "piece 1");
  assert(posRepo.includes("baseQuantity: quantity * conversionQty"), "POS sale missing conversion");
});

check("R. Sell 1 Pack deducts 6 base units", () => {
  assert(requiredBaseQty(1, 6) === 6, "pack 6");
});

check("S. Sell 1 Box deducts 60 base units", () => {
  assert(requiredBaseQty(1, 60) === 60, "box 60");
});

check("T. quantity 2 Box deducts 120 base units", () => {
  assert(requiredBaseQty(2, 60) === 120, "2 boxes");
});

check("U. Existing Product edit does not recalculate manual costs", () => {
  const stored = hydrateHierarchyQty([
    unit("piece", "Piece", 1, { costPriceLak: 8000, isBaseUnit: true }),
    unit("pack", "Pack", 6, { costPriceLak: 28000 }),
    unit("box", "Box", 60, { costPriceLak: 250000 }),
  ]);
  assert(hierarchyRelationText(stored[1], stored) === "1 Pack = 6 Pieces", "pack display");
  assert(hierarchyRelationText(stored[2], stored) === "1 Box = 10 Packs", "box display");
  assert(stored[1].costPriceLak === 28000 && stored[2].costPriceLak === 250000, "costs kept");
  assert(productForm.includes("useState<ProductUnit[]>(() => hydrateHierarchyQty("), "edit load hydrates only");
  assert(!productForm.includes("useState<ProductUnit[]>(() => applyHierarchyConversions"), "opening must not persist-recalc");
});

check("V. Create and Edit share the same behavior", () => {
  const usages = productForm.match(/<ProductUnitsTable /g) ?? [];
  assert(usages.length === 2, `expected shared table on create and edit, got ${usages.length}`);
});

check("W. Invalid conversion cannot be saved", () => {
  assert(productForm.includes("conversionInvalid"), "save gate missing");
  assert(productForm.includes('t("invalidUnitQuantity")'), "validation copy missing");
  assert(prismaRepo.includes("assertPositive(unit.conversionQty"), "repository conversion guard missing");
  assert(parsePositiveQty(0) === null && parsePositiveQty("") === null, "parser");
  assert(en.invalidUnitQuantity.includes("greater than 0"), en.invalidUnitQuantity);
  assert(productsCopyKeyParity(), "en/lo key parity");
});

const failed = results.filter((row) => row.status === "FAIL");
console.log(JSON.stringify({ failed: failed.length, passed: results.length - failed.length, total: results.length }, null, 2));
if (failed.length > 0) process.exit(1);
