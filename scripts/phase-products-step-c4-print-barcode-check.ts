/**
 * Products step C4 barcode print job. No database writes.
 */
import { readFileSync } from "node:fs";
import {
  BARCODE_LABEL_HEIGHT_MM,
  BARCODE_LABEL_WIDTH_MM,
  barcodePrintUnits,
  buildBarcodePrintJob,
  code128PatternTable,
  encodeCode128B,
  parsePrintQuantity,
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

const water = product({
  id: "water",
  sellingPriceLak: 999,
  units: [
    { barcode: "PIECE", sellingPriceLak: 5000, status: "active", unitName: "Piece" },
    { barcode: "PACK", sellingPriceLak: 28000, status: "active", unitName: "Pack" },
    { barcode: "BOX", sellingPriceLak: 110000, status: "active", unitName: "Box" },
    { barcode: "TRAY", sellingPriceLak: 7000, status: "active", unitName: "Tray" },
    { barcode: "", sellingPriceLak: 1000, status: "active", unitName: "Bundle" },
    { barcode: "OLD", sellingPriceLak: 1, status: "inactive", unitName: "Pack" },
  ],
});
const units = barcodePrintUnits(water);
check("piece pack box custom use their own barcodes", ["PIECE", "PACK", "BOX", "TRAY"].every((barcode, index) => units[index]?.barcode === barcode && units[index]?.unitName === ["Piece", "Pack", "Box", "Tray"][index]));
check("pack price is not the piece price", units.find((unit) => unit.unitName === "Pack")?.priceLak === 28000 && units.find((unit) => unit.unitName === "Box")?.priceLak === 110000);
check("missing barcode is flagged", units.some((unit) => unit.unitName === "Bundle" && unit.missing));
check("disabled unit is excluded", units.every((unit) => unit.barcode !== "OLD") && units.length === 5);
check("product barcode is not copied onto pack", units.find((unit) => unit.unitName === "Pack")?.barcode === "PACK");

const legacy = barcodePrintUnits(product({ barcode: "LEGACY", id: "old", sellingPriceLak: 1500, units: [] }));
check("legacy product prints its product barcode as piece", legacy.length === 1 && legacy[0]?.unitName === "Piece" && legacy[0]?.barcode === "LEGACY" && legacy[0]?.priceLak === 1500);

const job = buildBarcodePrintJob([
  line(units[0]!, 5),
  line(units[1]!, 2),
  line(units[3]!, 10),
  line(units[4]!, 1),
]);
check("multi product quantities stay printable", job.total === 17 && job.printable.length === 3 && job.blocked.length === 1 && job.blocked[0]?.unitName === "Bundle");

check("qty 1 5 10 and custom", [1, 5, 10, 17].every((qty) => parsePrintQuantity(String(qty)) === qty));
check("invalid qty rejected", [0, -1, 1.5, 101, ""].every((qty) => parsePrintQuantity(String(qty)) === null));

const hundred = buildBarcodePrintJob([line(units[0]!, 100)]);
check("100 labels stay within the job limit", hundred.total === 100 && !hundred.overLimit);
check("over limit is rejected", buildBarcodePrintJob([line(units[0]!, 100), line(units[1]!, 100), line(units[2]!, 1)]).overLimit);

const patterns = code128PatternTable();
check(
  "code128 table",
  patterns.length === 107 && patterns[104] === "211214" && patterns[106] === "2331112" && patterns.slice(0, 106).every((pattern) => [...pattern].reduce((sum, digit) => sum + Number(digit), 0) === 11),
);
const encoded = encodeCode128B("PIECE");
check("renderer encodes a saved barcode", Boolean(encoded && encoded.some((module) => module.ink)));
check("renderer rejects a non-ascii barcode", encodeCode128B("ນ້ຳ") === null && encodeCode128B("") === null);
check("different barcodes do not share a symbol", JSON.stringify(encodeCode128B("PIECE")) !== JSON.stringify(encodeCode128B("PACK")));

const en = getProductsCopy("en");
const lo = getProductsCopy("lo");
const labels = ["printBarcode", "printSelectProducts", "printSelectUnit", "printQuantity", "preview", "printAction", "printMissingBarcode", "labels", "printTotalLabels", "printNoPrintable", "printBack", "cancel"] as const;
check("EN labels", labels.every((key) => en[key].length > 0) && en.preview === "Preview" && en.printAction === "Print" && en.cancel === "Cancel");
check("LO labels", labels.every((key) => lo[key] !== en[key]));
check("copy key parity", productsCopyKeyParity());

const action = readFileSync("features/products/actions.ts", "utf8");
const actionBody = action.slice(action.indexOf("export async function searchBarcodePrintProductsAction"), action.indexOf("export async function auditProductBarcodesAction"));
check("print requires products.print", actionBody.includes('requireFinePermission(tenant, "products.print")') && actionBody.includes("READ_PERMISSIONS.productsView"));
const service = readFileSync("features/products/barcode-print-service.ts", "utf8");
check("print query skips images and writes", !service.includes("imageUrl") && !/update\(|create\(|delete\(/.test(service));
const drawer = readFileSync("features/products/components/product-print-barcode-drawer.tsx", "utf8");
check("browser print and print css", drawer.includes("window.print()") && drawer.includes("@media print") && drawer.includes("BARCODE_LABEL_WIDTH_MM") && drawer.includes("BARCODE_LABEL_HEIGHT_MM"));
check("label size is 50 by 30", BARCODE_LABEL_WIDTH_MM === 50 && BARCODE_LABEL_HEIGHT_MM === 30);
const scanner = readFileSync("features/pos/pos-cart.ts", "utf8");
check("scanner was not changed for printing", scanner.includes("unitMatches.length > 1"));

function line(choice: BarcodePrintChoice, copies: number): BarcodePrintChoice {
  return { ...choice, copies };
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exit(1);
