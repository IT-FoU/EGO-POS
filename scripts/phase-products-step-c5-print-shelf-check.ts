/**
 * Products step C5 shelf labels. No database writes.
 */
import { readFileSync } from "node:fs";
import { BARCODE_LABEL_HEIGHT_MM, BARCODE_LABEL_WIDTH_MM, barcodePrintUnits, type BarcodePrintProduct } from "../features/products/barcode-print";
import { buildShelfPrintJob, SHELF_LABEL_HEIGHT_MM, SHELF_LABEL_WIDTH_MM, shelfPrintUnits, shelfSellingPrice, type ShelfPrintChoice } from "../features/products/shelf-print";
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
  sku: "WATER",
  units: [
    { barcode: "PIECE", sellingPriceLak: 5000, status: "active", unitName: "Piece" },
    { barcode: "PACK", sellingPriceLak: 28000, status: "active", unitName: "Pack" },
    { barcode: "BOX", sellingPriceLak: 110000, status: "active", unitName: "Box" },
    { barcode: "TRAY", sellingPriceLak: 12000, status: "active", unitName: "Tray" },
    { barcode: "", sellingPriceLak: 8000, status: "active", unitName: "Bundle" },
    { barcode: "FREE", sellingPriceLak: null, status: "active", unitName: "Cup" },
    { barcode: "OLD", sellingPriceLak: 1, status: "inactive", unitName: "Pack" },
    { barcode: "HIDDEN", sellingPriceLak: 2, allowManualUnitSelect: false, status: "active", unitName: "Carton" },
  ],
});
const units = shelfPrintUnits(water);
const piece = units.find((unit) => unit.unitName === "Piece");
const pack = units.find((unit) => unit.unitName === "Pack");
const box = units.find((unit) => unit.unitName === "Box");
const tray = units.find((unit) => unit.unitName === "Tray");
const bundle = units.find((unit) => unit.unitName === "Bundle");
const cup = units.find((unit) => unit.unitName === "Cup");

check("piece pack box use their own prices", piece?.priceLak === 5000 && pack?.priceLak === 28000 && box?.priceLak === 110000);
check("pack price is not the piece price", pack?.priceLak !== piece?.priceLak && box?.priceLak !== pack?.priceLak);
check("custom unit keeps its price and barcode", tray?.priceLak === 12000 && tray?.barcode === "TRAY" && tray?.unitName === "Tray");
check("missing barcode still prints", Boolean(bundle && !bundle.missingPrice && bundle.barcode === "" && !bundle.graphic));
check("missing price is blocked", cup?.missingPrice === true && cup?.priceLak === null);
check("disabled units are excluded", units.every((unit) => unit.barcode !== "OLD" && unit.barcode !== "HIDDEN") && units.length === 6);
check("product price is not copied onto pack", pack?.priceLak === 28000 && pack?.sku === "WATER");
check("zero is a saved price and a negative price is missing", shelfSellingPrice(0) === 0 && shelfSellingPrice(-1) === null && shelfSellingPrice(Number.NaN) === null);

const legacy = shelfPrintUnits(product({ barcode: "LEGACY", id: "old", sellingPriceLak: 1500, sku: "OLD-SKU", units: [] }));
check("legacy product uses implicit piece price", legacy.length === 1 && legacy[0]?.unitName === "Piece" && legacy[0]?.priceLak === 1500 && legacy[0]?.barcode === "LEGACY" && legacy[0]?.sku === "OLD-SKU");

const job = buildShelfPrintJob([
  line(piece!, 5),
  line(pack!, 2),
  line(box!, 3),
  line(bundle!, 1),
  line(cup!, 4),
]);
check("multi unit job keeps valid labels", job.total === 11 && job.printable.length === 4 && job.blocked.length === 1 && job.blocked[0]?.unitName === "Cup");
check("missing barcode label stays in the job", job.printable.some((label) => label.unitName === "Bundle" && label.barcode === ""));
check("barcode print still blocks a missing barcode", barcodePrintUnits(water).some((unit) => unit.unitName === "Bundle" && unit.missing));

check("100 shelf labels stay within the job limit", buildShelfPrintJob([line(piece!, 100)]).total === 100 && !buildShelfPrintJob([line(piece!, 100)]).overLimit);
check("over limit is rejected", buildShelfPrintJob([line(piece!, 100), line(pack!, 100), line(box!, 1)]).overLimit);
check("label size is 70 by 40 and barcode labels stay 50 by 30", SHELF_LABEL_WIDTH_MM === 70 && SHELF_LABEL_HEIGHT_MM === 40 && BARCODE_LABEL_WIDTH_MM === 50 && BARCODE_LABEL_HEIGHT_MM === 30);

const en = getProductsCopy("en");
const lo = getProductsCopy("lo");
const labels = ["printShelfLabel", "shelfLabel", "printSelectProducts", "printSelectUnit", "sellingPrice", "printQuantity", "preview", "printAction", "printTotalLabels", "printMissingPrice", "printBack", "cancel"] as const;
check("EN labels", labels.every((key) => en[key].length > 0) && en.printShelfLabel === "Print Shelf Label" && en.shelfLabel === "Shelf Label" && en.printMissingPrice === "Missing Selling Price" && en.sellingPrice === "Selling Price" && en.preview === "Preview" && en.printAction === "Print" && en.cancel === "Cancel");
check("LO labels", labels.every((key) => lo[key] !== en[key]));
check("copy key parity", productsCopyKeyParity());

const drawer = readFileSync("features/products/components/product-print-shelf-drawer.tsx", "utf8");
const barcodeDrawer = readFileSync("features/products/components/product-print-barcode-drawer.tsx", "utf8");
check("shelf print reuses the barcode product loader", drawer.includes("searchBarcodePrintProductsAction") && drawer.includes("window.print()") && drawer.includes("@media print") && drawer.includes("SHELF_LABEL_WIDTH_MM"));
check("shelf print does not write products", !drawer.includes("update(") && !drawer.includes("create(") && !drawer.includes("delete("));
check("barcode print drawer is unchanged in size", barcodeDrawer.includes("BARCODE_LABEL_WIDTH_MM") && barcodeDrawer.includes("BARCODE_LABEL_HEIGHT_MM") && !barcodeDrawer.includes("SHELF_LABEL_WIDTH_MM"));
const list = readFileSync("features/products/components/product-list-client.tsx", "utf8");
check("shelf menu uses the print permission and selected rows", list.includes('testId="products-print-shelf-action"') && list.includes("selectedIds={selectedIds}") && list.includes("productAccess.printBarcode ? <ActionMenuButton icon={Tags}"));
const action = readFileSync("features/products/actions.ts", "utf8");
const actionBody = action.slice(action.indexOf("export async function searchBarcodePrintProductsAction"), action.indexOf("export async function auditProductBarcodesAction"));
check("print permission still guards the loader", actionBody.includes('requireFinePermission(tenant, "products.print")') && actionBody.includes("READ_PERMISSIONS.productsView"));
const scanner = readFileSync("features/pos/pos-cart.ts", "utf8");
check("scanner was not changed", scanner.includes("unitMatches.length > 1"));

function line(choice: ShelfPrintChoice, copies: number): ShelfPrintChoice {
  return { ...choice, copies };
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exit(1);
