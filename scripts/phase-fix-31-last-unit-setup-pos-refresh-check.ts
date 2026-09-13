import {
  applyLastCreateUnitSetupToDefaults,
  extractLastCreateUnitSetupFromUnits,
  FALLBACK_LAST_CREATE_UNIT_SETUP,
  LAST_CREATE_UNIT_SETUP_KEY,
  parseLastCreateUnitSetup,
  resolveCreateUnitSetup,
} from "../features/products/last-create-unit-setup";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

const root = process.cwd();
const productForm = readFileSync(join(root, "features/products/components/product-form.tsx"), "utf8");
const productList = readFileSync(join(root, "features/products/components/product-list-client.tsx"), "utf8");
const productActions = readFileSync(join(root, "features/products/actions.ts"), "utf8");
const moduleSource = readFileSync(join(root, "features/products/last-create-unit-setup.ts"), "utf8");

check("1. First Create uses fallback defaults", () => {
  const fallback = resolveCreateUnitSetup(null);
  assert(fallback.units.piece.enabled && fallback.units.piece.conversionQty === 1, "piece fallback");
  assert(fallback.units.pack.enabled && fallback.units.pack.conversionQty === 6, "pack fallback");
  assert(fallback.units.box.enabled && fallback.units.box.conversionQty === 60, "box fallback");
});

check("2-3. Save Piece=1 Pack=6 Box disabled → next Create remembers", () => {
  const saved = extractLastCreateUnitSetupFromUnits([
    { unitName: "Piece", conversionQty: 1, status: "active" },
    { unitName: "Pack", conversionQty: 6, status: "active" },
    { unitName: "Box", conversionQty: 60, status: "inactive" },
  ]);
  assert(saved.units.piece.enabled && saved.units.piece.conversionQty === 1, "piece");
  assert(saved.units.pack.enabled && saved.units.pack.conversionQty === 6, "pack");
  assert(!saved.units.box.enabled && saved.units.box.conversionQty === 60, "box disabled keeps qty");
  const applied = applyLastCreateUnitSetupToDefaults([
    { unitName: "Piece", conversionQty: 1, status: "active" as const },
    { unitName: "Pack", conversionQty: 6, status: "active" as const },
    { unitName: "Box", conversionQty: 60, status: "active" as const },
  ], saved);
  assert(applied[0]!.status === "active" && applied[0]!.conversionQty === 1, "next piece");
  assert(applied[1]!.status === "active" && applied[1]!.conversionQty === 6, "next pack");
  assert(applied[2]!.status === "inactive" && applied[2]!.conversionQty === 60, "next box disabled");
});

check("4-6. Piece=1 Pack disabled Box=48 → next Create remembers", () => {
  const saved = extractLastCreateUnitSetupFromUnits([
    { unitName: "Piece", conversionQty: 1, status: "active" },
    { unitName: "Pack", conversionQty: 6, status: "inactive" },
    { unitName: "Box", conversionQty: 48, status: "active" },
  ]);
  assert(saved.units.piece.enabled, "piece on");
  assert(!saved.units.pack.enabled, "pack off");
  assert(saved.units.box.enabled && saved.units.box.conversionQty === 48, "box 48");
});

check("7-8. Failed/cancelled must not write (source guards)", () => {
  assert(productForm.includes("writeLastCreateUnitSetup(extractLastCreateUnitSetupFromUnits(sourceUnits))"), "write on success");
  const createStart = productForm.indexOf('if (mode === "create")');
  const createEnd = productForm.indexOf("if (product)", createStart);
  const createBlock = productForm.slice(createStart, createEnd);
  assert(createBlock.includes("if (!result.ok)"), "failed create returns before write");
  assert(createBlock.includes("writeLastCreateUnitSetup(extractLastCreateUnitSetupFromUnits(sourceUnits))"), "write inside create success");
  const failIdx = createBlock.indexOf("if (!result.ok)");
  const writeIdx = createBlock.indexOf("writeLastCreateUnitSetup(extractLastCreateUnitSetupFromUnits(sourceUnits))");
  assert(writeIdx > failIdx, "write must be after successful create gate");
});

check("9. Cost/Barcode/SKU are NOT copied", () => {
  assert(moduleSource.includes("Never stores prices, barcodes, SKU"), "intent documented");
  const extracted = extractLastCreateUnitSetupFromUnits([
    { unitName: "Piece", conversionQty: 1, status: "active" },
    { unitName: "Pack", conversionQty: 12, status: "active" },
    { unitName: "Box", conversionQty: 24, status: "inactive" },
  ]);
  assert(!("barcode" in extracted.units.piece), "no barcode field");
  assert(!("costPriceLak" in extracted.units.piece), "no cost field");
  assert(!("sku" in extracted), "no sku field");
  assert(JSON.stringify(extracted).includes('"conversionQty"'), "qty present");
  assert(JSON.stringify(extracted).includes('"enabled"'), "enabled present");
});

check("storage key + parse round-trip", () => {
  assert(LAST_CREATE_UNIT_SETUP_KEY === "ego-pos.last-create-unit-setup", "key");
  const parsed = parseLastCreateUnitSetup(FALLBACK_LAST_CREATE_UNIT_SETUP);
  assert(parsed?.units.pack.conversionQty === 6, "parse fallback");
  assert(parseLastCreateUnitSetup(null) === null, "null");
  assert(parseLastCreateUnitSetup({ units: {} }) === null, "incomplete rejected");
});

check("Create form applies remembered setup", () => {
  assert(productForm.includes("applyLastCreateUnitSetupToDefaults"), "apply unused");
  assert(productForm.includes("readLastCreateUnitSetup"), "read unused");
  assert(productForm.includes("useLayoutEffect"), "client restore missing");
  assert(productForm.includes("from \"@/features/products/last-create-unit-setup\""), "module import");
});

check("POS create/edit/delete signal invalidation", () => {
  assert(productForm.includes("signalPosCatalogueInvalidation()"), "form signals");
  const createBlock = productForm.slice(productForm.indexOf('if (mode === "create")'), productForm.indexOf("if (product)"));
  assert(createBlock.includes("signalPosCatalogueInvalidation()"), "create signals");
  const updateBlock = productForm.slice(productForm.indexOf("updateProductAction"), productForm.indexOf("function duplicateProduct"));
  assert(updateBlock.includes("signalPosCatalogueInvalidation()"), "update signals");
  assert(productForm.includes("changeProductStatus") && productForm.includes("signalPosCatalogueInvalidation()"), "delete/archive path present");
  assert(productList.includes("signalPosCatalogueInvalidation()"), "list delete signals");
});

check("Server catalogue paths revalidated", () => {
  assert(productActions.includes('revalidatePath("/pos")'), "pos path");
  assert(productActions.includes('revalidatePath("/products")'), "products path");
  assert(productActions.includes("revalidateProductCataloguePaths()"), "helper used");
});

const failed = results.filter((item) => item.status === "FAIL");
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exitCode = 1;
