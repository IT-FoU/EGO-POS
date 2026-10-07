/**
 * Products step P3 barcode print workflow. No database writes.
 */
import { readFileSync } from "node:fs";
import {
  BARCODE_LABEL_HEIGHT_MM,
  BARCODE_LABEL_WIDTH_MM,
  DEFAULT_BARCODE_LABEL_FIELDS,
  applyLabelFit,
  barcodePrintUnits,
  buildBarcodePrintJob,
  fitBarcodeLabelName,
  parseLabelMillimetres,
  parsePrintQuantity,
  resolveBarcodeLabelSize,
  resolveBarcodeLabelView,
  unitPrintRole,
  type BarcodePrintChoice,
  type BarcodePrintProduct,
} from "../features/products/barcode-print";
import { getProductsCopy, productsCopyKeyParity } from "../lib/i18n/products-copy";

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

function product(input: Partial<BarcodePrintProduct> & { id: string }): BarcodePrintProduct {
  return { barcode: "", nameEn: input.id, nameLo: input.id, sellingPriceLak: 0, sku: input.id, units: [], ...input };
}

const pepsi = product({
  id: "pepsi",
  nameEn: "PEPSI",
  sku: "PEPSI-SKU",
  units: [
    { barcode: "PIECE-1", sellingPriceLak: 5000, status: "active", unitName: "Piece" },
    { barcode: "PACK-1", sellingPriceLak: 28000, status: "active", unitName: "Pack" },
    { barcode: "BOX-1", sellingPriceLak: 110000, status: "active", unitName: "Box" },
    { barcode: "TRAY-1", sellingPriceLak: 7000, status: "active", unitName: "Tray" },
    { barcode: "", sellingPriceLak: 1000, status: "active", unitName: "Bundle" },
    { barcode: "OLD", sellingPriceLak: 1, status: "inactive", unitName: "Pack" },
  ],
});
const units = barcodePrintUnits(pepsi);
check("piece", units.some((unit) => unit.unitName === "Piece" && unit.barcode === "PIECE-1" && unit.priceLak === 5000));
check("pack", units.some((unit) => unit.unitName === "Pack" && unit.barcode === "PACK-1" && unit.priceLak === 28000));
check("box", units.some((unit) => unit.unitName === "Box" && unit.barcode === "BOX-1" && unit.priceLak === 110000));
check("custom unit", units.some((unit) => unit.unitName === "Tray" && unit.barcode === "TRAY-1"));
check("disabled unit excluded", units.every((unit) => unit.barcode !== "OLD"));
check("missing barcode blocked", units.some((unit) => unit.unitName === "Bundle" && unit.missing && !unit.encodable));
check("barcode source stays on its unit", units.find((unit) => unit.unitName === "Box")?.barcode !== units.find((unit) => unit.unitName === "Piece")?.barcode);
check("legacy piece", barcodePrintUnits(product({ barcode: "LEGACY", id: "old", units: [] }))[0]?.unitName === "Piece");
check("roles", unitPrintRole("Piece") === "piece" && unitPrintRole("Pack") === "pack" && unitPrintRole("Box") === "box" && unitPrintRole("Tray") === "custom");

const piece = units.find((unit) => unit.unitName === "Piece")!;
const box = units.find((unit) => unit.unitName === "Box")!;
const job = buildBarcodePrintJob([copies(piece, 5), copies(box, 2), copies(units.find((unit) => unit.unitName === "Bundle")!, 1)]);
check("quantity and total", job.total === 7 && job.printable.length === 2 && job.blocked.length === 1);
check("qty bounds", parsePrintQuantity("1") === 1 && parsePrintQuantity("0") === null && parsePrintQuantity("-2") === null);
check("set qty for all stays an integer", [1, 5, 10].every((qty) => parsePrintQuantity(String(qty)) === qty));

check("default fields", DEFAULT_BARCODE_LABEL_FIELDS.productName && DEFAULT_BARCODE_LABEL_FIELDS.unitName && DEFAULT_BARCODE_LABEL_FIELDS.barcodeGraphic && DEFAULT_BARCODE_LABEL_FIELDS.barcodeText && !DEFAULT_BARCODE_LABEL_FIELDS.sku && !DEFAULT_BARCODE_LABEL_FIELDS.sellingPrice);
check("presets", resolveBarcodeLabelSize("40x25", "", "").widthMm === 40 && resolveBarcodeLabelSize("50x30", "", "").heightMm === 30 && resolveBarcodeLabelSize("60x40", "", "").widthMm === 60);
check("custom size", resolveBarcodeLabelSize("custom", "55", "28").widthMm === 55 && resolveBarcodeLabelSize("custom", "55", "28").heightMm === 28 && parseLabelMillimetres("10") === null && parseLabelMillimetres("0") === null);
check("default size constants stay 50 by 30", BARCODE_LABEL_WIDTH_MM === 50 && BARCODE_LABEL_HEIGHT_MM === 30);

const view = resolveBarcodeLabelView({
  fields: { ...DEFAULT_BARCODE_LABEL_FIELDS, sellingPrice: true, sku: true },
  layout: { align: "center", barcodeScale: 2, nameFontPx: 12, priceFontPx: 11, spacingPx: 2 },
  line: piece,
  localeName: "PEPSI",
});
check("price uses the unit price", view.showPrice && view.priceLak === 5000);
check("sku shows when present", view.showSku && view.sku === "PEPSI-SKU");
const blankSku = resolveBarcodeLabelView({
  fields: { ...DEFAULT_BARCODE_LABEL_FIELDS, sku: true },
  layout: { align: "left", barcodeScale: 1, nameFontPx: 12, priceFontPx: 11, spacingPx: 1 },
  line: { ...piece, sku: "" },
  localeName: "PEPSI",
});
check("blank sku is omitted", !blankSku.showSku);

const override = resolveBarcodeLabelView({
  fields: DEFAULT_BARCODE_LABEL_FIELDS,
  layout: { align: "center", barcodeScale: 2, nameFontPx: 12, priceFontPx: 11, spacingPx: 2 },
  line: piece,
  localeName: "PEPSI",
  override: { displayName: "P", productName: true, unitName: false },
});
const other = resolveBarcodeLabelView({
  fields: DEFAULT_BARCODE_LABEL_FIELDS,
  layout: { align: "center", barcodeScale: 2, nameFontPx: 12, priceFontPx: 11, spacingPx: 2 },
  line: box,
  localeName: "PEPSI",
});
check("individual override", override.displayName === "P" && !override.showUnit && other.displayName === "PEPSI" && other.showUnit);

const longName = "Very Long Product Name That Cannot Fit Inside A Small Thermal Label Without Wrapping Or A Smaller Font";
const fitted = fitBarcodeLabelName(longName, 40, 16);
const contained = applyLabelFit({ ...view, displayName: longName, fontPx: 16, showName: true }, 40);
check("long name shrinks", fitted.fontPx < 16 && contained.fontPx <= fitted.fontPx);
check("long name can warn", fitBarcodeLabelName("X".repeat(80), 20, 8).overflow);

const en = getProductsCopy("en");
const lo = getProductsCopy("lo");
const labels = ["printBarcode", "printSelectedLoaded", "printSelectUnits", "printSelectAllPiece", "printSelectAllPack", "printSelectAllBox", "printQuantity", "printSetQtyAll", "printLabelSizeTitle", "printCustomSize", "productName", "printUnitName", "printBarcodeGraphic", "printBarcodeNumber", "sellingPrice", "preview", "printEditLabel", "printResetOverride", "printMissingBarcode", "printUnencodable", "printTotalLabels", "printAction"] as const;
check("EN", labels.every((key) => en[key].length > 0) && en.sku === "SKU" && en.printUnencodable === "Barcode cannot be printed" && en.printAction === "Print");
check("LO", labels.every((key) => lo[key] !== en[key] && lo[key].length > 0) && lo.sku.length > 0);
check("copy parity", productsCopyKeyParity());

const drawer = readFileSync("features/products/components/product-print-barcode-drawer.tsx", "utf8");
const service = readFileSync("features/products/barcode-print-service.ts", "utf8");
const action = readFileSync("features/products/actions.ts", "utf8");
const actionBody = action.slice(action.indexOf("export async function searchBarcodePrintProductsAction"), action.indexOf("export async function auditProductBarcodesAction"));
check("selection is the only load", drawer.includes("productIds: ids") && !drawer.includes("products-print-search"));
check("one label per page and browser print", drawer.includes("window.print()") && drawer.includes("break-after: page") && drawer.includes("@media print") && drawer.includes("visibility: hidden"));
check("print permission", actionBody.includes('requireFinePermission(tenant, "products.print")'));
check("read only", !/update\(|create\(|delete\(/.test(service) && !drawer.includes("updateProduct") && !drawer.includes("saveProduct"));
check("no schema", !drawer.includes("prisma") && !service.includes("prisma.product.update"));

function copies(choice: BarcodePrintChoice, count: number): BarcodePrintChoice {
  return { ...choice, copies: count };
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length}`);
if (failed.length) process.exit(1);
