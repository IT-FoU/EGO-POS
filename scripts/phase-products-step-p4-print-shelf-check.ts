/**
 * Products step P4 shelf label designer. No database writes.
 */
import { readFileSync } from "node:fs";
import { fitBarcodeLabelName } from "../features/products/barcode-print";
import {
  DEFAULT_SHELF_LABEL_FIELDS,
  SHELF_LABEL_HEIGHT_MM,
  SHELF_LABEL_WIDTH_MM,
  resolveShelfLabelSize,
  resolveShelfLabelView,
  shelfLayoutStyle,
  shelfPrintUnits,
  shelfSellingPrice,
} from "../features/products/shelf-print";
import { type BarcodePrintProduct as Product } from "../features/products/barcode-print";
import { getProductsCopy, productsCopyKeyParity } from "../lib/i18n/products-copy";

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

function product(input: Partial<Product> & { id: string }): Product {
  return { barcode: "", nameEn: input.id, nameLo: input.id, sellingPriceLak: 0, sku: input.id, units: [], ...input };
}

const water = product({
  id: "water",
  nameEn: "Water",
  sku: "WATER",
  units: [
    { barcode: "PIECE", sellingPriceLak: 5000, status: "active", unitName: "Piece" },
    { barcode: "PACK", sellingPriceLak: 28000, status: "active", unitName: "Pack" },
    { barcode: "BOX", sellingPriceLak: 110000, status: "active", unitName: "Box" },
    { barcode: "", sellingPriceLak: 8000, status: "active", unitName: "Bundle" },
    { barcode: "FREE", sellingPriceLak: null, status: "active", unitName: "Cup" },
  ],
});
const units = shelfPrintUnits(water);
const piece = units.find((unit) => unit.unitName === "Piece")!;
check("unit price", piece.priceLak === 5000 && units.find((unit) => unit.unitName === "Pack")?.priceLak === 28000);
check("zero price stays valid", shelfSellingPrice(0) === 0);
check("missing price", units.find((unit) => unit.unitName === "Cup")?.missingPrice === true);
check("missing barcode still printable", units.find((unit) => unit.unitName === "Bundle")?.missingPrice === false);
check("default fields are price first", DEFAULT_SHELF_LABEL_FIELDS.productName && DEFAULT_SHELF_LABEL_FIELDS.unitName && DEFAULT_SHELF_LABEL_FIELDS.sellingPrice && !DEFAULT_SHELF_LABEL_FIELDS.barcodeGraphic && !DEFAULT_SHELF_LABEL_FIELDS.barcodeText && !DEFAULT_SHELF_LABEL_FIELDS.sku);
check("sizes", resolveShelfLabelSize("50x30", "", "").widthMm === 50 && resolveShelfLabelSize("60x40", "", "").widthMm === 60 && resolveShelfLabelSize("70x40", "", "").widthMm === 70 && resolveShelfLabelSize("custom", "55", "32").heightMm === 32);
check("default size stays 70 by 40", SHELF_LABEL_WIDTH_MM === 70 && SHELF_LABEL_HEIGHT_MM === 40);
const price = shelfLayoutStyle("price");
const balanced = shelfLayoutStyle("balanced");
const compact = shelfLayoutStyle("compact");
check("layouts keep price largest", price.priceFontPx > price.nameFontPx && price.nameFontPx > price.unitFontPx && balanced.priceFontPx > balanced.nameFontPx && compact.priceFontPx > compact.nameFontPx);
const view = resolveShelfLabelView({
  fields: { ...DEFAULT_SHELF_LABEL_FIELDS, barcodeGraphic: true, sku: true },
  graphic: false,
  line: { barcode: "", priceLak: 8000, sku: "", unitName: "Bundle" },
  localeName: "Water",
  style: price,
});
check("missing barcode omits the graphic", !view.showBarcode && view.showNoBarcode && view.showPrice && view.priceLak === 8000);
const named = resolveShelfLabelView({
  fields: DEFAULT_SHELF_LABEL_FIELDS,
  graphic: true,
  line: piece,
  localeName: "Water",
  override: { displayName: "W", sku: false, unitName: false },
  style: price,
});
const other = resolveShelfLabelView({ fields: DEFAULT_SHELF_LABEL_FIELDS, graphic: true, line: piece, localeName: "Water", style: price });
check("override is isolated", named.displayName === "W" && !named.showUnit && other.displayName === "Water" && other.showUnit);
check("long name can warn", fitBarcodeLabelName("X".repeat(80), 20, 8).overflow);

const en = getProductsCopy("en");
const lo = getProductsCopy("lo");
const labels = ["printShelfLabel", "shelfLabel", "printSelectedLoaded", "printSelectUnits", "printQuantity", "printSetQtyAll", "printLabelSizeTitle", "shelfLayout", "shelfPriceFocus", "shelfBalanced", "shelfCompact", "productName", "printUnitName", "sellingPrice", "printBarcodeGraphic", "printBarcodeNumber", "preview", "printEditLabel", "printResetOverride", "printMissingPrice", "printTotalLabels", "printAction"] as const;
check("EN", labels.every((key) => en[key].length > 0) && en.shelfPriceFocus === "Price Focus" && en.printMissingPrice === "Missing Selling Price");
check("LO", labels.every((key) => lo[key] !== en[key] && lo[key].length > 0));
check("copy parity", productsCopyKeyParity());

const drawer = readFileSync("features/products/components/product-print-shelf-drawer.tsx", "utf8");
check("selection load and one label per page", drawer.includes("productIds: ids") && drawer.includes("window.print()") && drawer.includes("break-after: page") && drawer.includes("SHELF_LABEL_WIDTH_MM") && !drawer.includes("products-shelf-search"));
check("read only", !drawer.includes("update(") && !drawer.includes("create(") && !drawer.includes("delete("));

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length}`);
if (failed.length) process.exit(1);
