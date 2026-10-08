/**
 * Products step C3 barcode audit classification. No database writes.
 */
import { readFileSync } from "node:fs";
import { buildBarcodeAudit, barcodeAuditCsv, BARCODE_AUDIT_INVALID_RULE, type BarcodeAuditProduct } from "../features/products/barcode-audit";
import { productMissingBarcode } from "../features/products/unit-coverage";
import { findPosScanMatch } from "../features/pos/pos-cart";
import type { PosProduct } from "../features/pos/types";
import { productsCopyKeyParity, getProductsCopy } from "../lib/i18n/products-copy";

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

function product(input: Partial<BarcodeAuditProduct> & { id: string }): BarcodeAuditProduct {
  return {
    barcode: "",
    nameEn: input.id,
    nameLo: input.id,
    sku: input.id,
    status: "active",
    units: [],
    ...input,
  };
}

function unit(unitName: string, barcode: string, extra: { allowManualUnitSelect?: boolean; status?: string } = {}) {
  return { allowManualUnitSelect: true, barcode, status: "active", unitName, ...extra };
}

function issues(products: BarcodeAuditProduct[], kind?: "missing" | "duplicate" | "conflict") {
  const audit = buildBarcodeAudit(products);
  return kind ? audit.issues.filter((issue) => issue.issue === kind) : audit.issues;
}

const packMissing = buildBarcodeAudit([product({
  id: "water",
  units: [unit("Piece", "P1"), unit("Pack", ""), unit("Box", "B1")],
})]);
check("pack missing is one issue", packMissing.missingCount === 1 && packMissing.issues[0]?.unitName === "Pack");
check("piece and box are not missing", packMissing.issues.every((issue) => issue.unitName === "Pack"));

const pieceMissing = issues([product({ id: "piece", units: [unit("Piece", ""), unit("Pack", "PK"), unit("Box", "BX")] })], "missing");
check("piece missing barcode", pieceMissing.length === 1 && pieceMissing[0]?.unitName === "Piece");

const boxMissing = issues([product({ id: "box", units: [unit("Piece", "P"), unit("Pack", "K"), unit("Box", "")] })], "missing");
check("box missing barcode", boxMissing.length === 1 && boxMissing[0]?.unitName === "Box");

const customMissing = issues([product({ id: "tray", units: [unit("Piece", "P"), unit("Tray", "")] })], "missing");
check("custom unit missing barcode", customMissing.length === 1 && customMissing[0]?.unitName === "Tray");

const disabled = buildBarcodeAudit([product({
  id: "off",
  units: [unit("Piece", "ON"), unit("Pack", "", { status: "inactive" })],
})]);
check("disabled unit missing barcode is not flagged", disabled.missingCount === 0 && disabled.issues.length === 0);

const hiddenSelect = buildBarcodeAudit([product({
  id: "manual-off",
  units: [unit("Piece", "ON"), unit("Pack", "", { allowManualUnitSelect: false })],
})]);
check("blocked unit is outside missing readiness", hiddenSelect.missingCount === 0);

const piecePiece = buildBarcodeAudit([
  product({ id: "a", units: [unit("Piece", "DUP")] }),
  product({ id: "b", units: [unit("Piece", "DUP")] }),
]);
check("duplicate piece vs piece", piecePiece.conflictCount === 2 && piecePiece.issues.every((issue) => issue.details === "scan_conflict"));

const piecePack = buildBarcodeAudit([
  product({ id: "a", units: [unit("Piece", "X")] }),
  product({ id: "b", units: [unit("Pack", "X")] }),
]);
check("duplicate piece vs pack", piecePack.conflictCount === 2 && piecePack.issues.map((issue) => issue.unitName).sort().join(",") === "Pack,Piece");

const packBox = buildBarcodeAudit([product({
  id: "same",
  units: [unit("Pack", "Z"), unit("Box", "Z")],
})]);
check("duplicate pack vs box", packBox.conflictCount === 2 && packBox.issues.every((issue) => issue.productId === "same"));

const customClash = buildBarcodeAudit([
  product({ id: "a", units: [unit("Piece", "C")] }),
  product({ id: "b", units: [unit("Tray", "C")] }),
]);
check("duplicate custom vs other unit", customClash.conflictCount === 2 && customClash.issues.some((issue) => issue.unitName === "Tray"));

const disabledClash = buildBarcodeAudit([
  product({ id: "a", units: [unit("Piece", "H")] }),
  product({ id: "b", units: [unit("Pack", "H", { status: "inactive" })] }),
]);
check("disabled barcode does not create a scan conflict", disabledClash.issues.length === 0);

const legacy = buildBarcodeAudit([product({ id: "old", barcode: "LEG", units: [] })]);
check("legacy product barcode is the piece barcode", legacy.missingCount === 0 && legacy.unitsChecked === 1);

const legacyMissing = buildBarcodeAudit([product({ id: "old-blank", barcode: "", units: [] })]);
check("legacy blank barcode is one missing piece", legacyMissing.missingCount === 1 && legacyMissing.issues[0]?.unitName === "Piece");

const legacyDup = buildBarcodeAudit([
  product({ id: "old-a", barcode: "SAME", units: [] }),
  product({ id: "old-b", barcode: "SAME", units: [] }),
]);
check("legacy barcodes conflict when shared", legacyDup.conflictCount === 2);

const mirrored = buildBarcodeAudit([product({
  barcode: "P1",
  id: "mirror",
  units: [unit("Piece", "P1"), unit("Pack", "K1")],
})]);
check("product barcode matching its piece is not a second issue", mirrored.issues.length === 0);

const shadowed = buildBarcodeAudit([
  product({ barcode: "P1", id: "shelf", units: [unit("Piece", "OTHER")] }),
  product({ id: "scanned", units: [unit("Piece", "P1")] }),
]);
check(
  "shadowed product barcode is a duplicate without a scan conflict",
  shadowed.duplicateCount === 2 && shadowed.conflictCount === 0 && shadowed.issues.every((issue) => issue.details === "shared_barcode"),
);

const oddCodes = buildBarcodeAudit([
  product({ id: "short", units: [unit("Piece", "A1")] }),
  product({ id: "symbol", units: [unit("Piece", "12 34")] }),
]);
check("invalid barcode is not applicable", oddCodes.invalidCount === 0 && oddCodes.invalidRule === BARCODE_AUDIT_INVALID_RULE && oddCodes.issues.length === 0);

const healthProducts = [
  product({ id: "ok", units: [unit("Piece", "OK"), unit("Pack", "OKP")] }),
  product({ id: "gap", units: [unit("Piece", "G"), unit("Pack", ""), unit("Box", "")] }),
  product({ id: "legacy-gap", barcode: " ", units: [] }),
  product({ id: "off", units: [unit("Piece", "ON"), unit("Box", "", { status: "inactive" })] }),
];
const healthAudit = buildBarcodeAudit(healthProducts);
const healthIds = healthProducts.filter((item) => productMissingBarcode(item)).map((item) => item.id).sort();
check("missing products match product health", healthIds.join(",") === healthAudit.missingProductIds.join(",") && healthAudit.missingCount === 3, `health=${healthIds.join("|")} rows=${healthAudit.missingCount}`);

const scanProducts = [pos("a", "DUP", "Piece"), pos("b", "DUP", "Pack")];
const scan = findPosScanMatch(scanProducts, "DUP");
check("scanner flags two active units as a conflict", Boolean(scan?.conflict));
check("audit matches that scanner conflict", piecePack.conflictCount === 2);

const silent = findPosScanMatch([pos("same", "Z", "Pack", "Box")], "Z");
check("scanner keeps the first unit when one product repeats a barcode", Boolean(silent && !silent.conflict && silent.unit?.unitName === "Pack"));
check("audit still flags that repeated unit barcode", packBox.conflictCount === 2);

const many = buildBarcodeAudit(Array.from({ length: 120 }, (_, index) => product({
  id: `n${index}`,
  units: [unit("Piece", `N${index}`)],
})));
check("100 product audit stays in memory", many.productsChecked === 120 && many.unitsChecked === 120 && many.issues.length === 0);

const csv = barcodeAuditCsv(piecePiece.issues, {
  conflict: "Barcode Conflict",
  duplicate: "Duplicate Barcode",
  invalid: "Invalid Barcode",
  missing: "Missing Barcode",
  missing_barcode: "Enabled unit has no barcode.",
  scan_conflict: "Scan can match more than one unit.",
  shared_barcode: "Another record also stores this barcode.",
});
check("audit csv columns", csv.includes("Product Name,SKU,Unit,Barcode,Issue Type,Details,Related Product") && csv.includes("Barcode Conflict"));

const en = getProductsCopy("en");
const lo = getProductsCopy("lo");
const labels = ["barcodeAudit", "auditAllIssues", "auditMissing", "auditDuplicate", "auditInvalid", "auditConflict", "auditProduct", "auditUnit", "auditBarcode", "auditIssue", "auditNoIssues", "auditExport", "auditOpenProduct"] as const;
check("EN labels", labels.every((key) => en[key].length > 0));
check("LO labels", labels.every((key) => lo[key] !== en[key] && !lo[key].includes("Barcode")));
check("copy key parity", productsCopyKeyParity());

const action = readFileSync("features/products/actions.ts", "utf8");
const actionBody = action.slice(action.indexOf("export async function auditProductBarcodesAction"), action.indexOf("export async function exportProductsAction"));
check("audit requires products.view", actionBody.includes("READ_PERMISSIONS.productsView") && !actionBody.includes("productsCreate") && !actionBody.includes("productsUpdate"));
const service = readFileSync("features/products/barcode-audit-service.ts", "utf8");
check("audit query does not load images", !service.includes("imageUrl"));
check("audit is read only", !/create\(|update\(|delete\(|recordEssentialActivity|revalidatePath/.test(service));
check("audit uses the list scope", service.includes("resolveProductListFilter") && service.includes('status: { not: "deleted" }'));
const scanner = readFileSync("features/pos/pos-cart.ts", "utf8");
check("scanner resolution was not rewritten", scanner.includes("unitMatches.length > 1") && scanner.includes('item.status !== "inactive"'));

function pos(id: string, barcode: string, unitName: string, second?: string): PosProduct {
  const units = [posUnit(`${id}-1`, barcode, unitName)];
  if (second) units.push(posUnit(`${id}-2`, barcode, second));
  return {
    barcode,
    categoryName: "",
    id,
    imageKey: "",
    nameEn: id,
    nameLo: id,
    priceLak: 1,
    sku: id,
    stockQty: 1,
    unitName,
    units,
  };
}

function posUnit(id: string, barcode: string, unitName: string) {
  return {
    allowManualUnitSelect: true,
    barcode,
    conversionQty: 1,
    costPriceLak: 1,
    id,
    isBaseUnit: unitName === "Piece",
    isDefaultSaleUnit: unitName === "Piece",
    isPurchaseUnit: true,
    sellingPriceLak: 1,
    sortOrder: 0,
    status: "active" as const,
    unitName,
  };
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exit(1);
