/**
 * STEP 3 selling-unit and barcode cleanup.
 * Run: npx tsx scripts/phase-products-step3-selling-unit-cleanup-check.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { productsCopyKeyParity, tProducts } from "../lib/i18n/products-copy";

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
const form = read("features/products/components/product-form.tsx");
const pricing = read("features/products/unit-pricing.ts");
const schema = read("prisma/schema.prisma");
const productModel = schema.slice(schema.indexOf("model Product "), schema.indexOf("model ProductUnit"));
const unitModel = schema.slice(schema.indexOf("model ProductUnit"), schema.indexOf("model ProductImage"));

check("one Add Custom Unit action", (form.match(/t\("addCustomUnit"\)/g) ?? []).length === 2);
check("named custom input is gone", !form.includes("customUnitName") && !form.includes("customPlus") && !form.includes("addBlankUnit"));
check("both add paths use one blank row", form.includes("function addCustomUnit()") && form.includes('addNamedUnit("")'));
check("global rounding control is gone", !form.includes("applyRoundingToAll") && !form.includes("roundingForAll") && !form.includes("applyRoundingToAllUnits"));
check("per-unit rounding remains", form.includes("unit.roundingLak") && form.includes('t("rounding")') && form.includes('t("noRounding")'));
check("apply-all helper is not in the pricing engine", !pricing.includes("applyRoundingToAllUnits"));
check("per-unit price patch remains", pricing.includes("export function applyUnitPricingPatch"));
check("duplicate unit names are blocked on save", form.includes("hasDuplicateUnitName") && form.includes('t("duplicateUnitName")'));
check("no persisted global rounding on Product", !/rounding/i.test(productModel));
check("rounding stays on ProductUnit", unitModel.includes("roundingLak") && unitModel.includes("rounding_lak"));
check("products copy parity", productsCopyKeyParity());

for (const key of ["addCustomUnit", "duplicateUnitName", "rounding", "noRounding"] as const) {
  const en = tProducts(key, "en");
  const lo = tProducts(key, "lo");
  const laoHasEnglish = /[A-Za-z]/.test(lo);
  check(`${key} en/lo`, en !== lo && en.length > 0 && lo.length > 0 && !laoHasEnglish, `en=${en} lo=${lo}`);
}

check("stale custom-unit copy is gone", tProducts("customPlus", "en") === "customPlus" && tProducts("addBlankUnit", "en") === "addBlankUnit" && tProducts("applyRoundingToAllUnits", "en") === "applyRoundingToAllUnits");

console.log(`\nSTEP 3 selling unit cleanup: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
