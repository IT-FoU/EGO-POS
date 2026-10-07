/**
 * Products step P6 shelf-label reprint lifecycle. No database writes.
 */
import { readFileSync } from "node:fs";
import { shelfPrintUnits } from "../features/products/shelf-print";
import { productNeedsLabelReprint, reprintUnitNames, sellingPriceChanged } from "../features/products/label-reprint";
import { getProductsCopy, productsCopyKeyParity } from "../lib/i18n/products-copy";

const results: Array<{ name: string; ok: boolean }> = [];
function check(name: string, ok: boolean) {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}

const schema = readFileSync("prisma/schema.prisma", "utf8");
const migration = readFileSync("prisma/migrations/20261007180000_label_reprint_needed/migration.sql", "utf8");
const service = readFileSync("features/products/label-reprint-service.ts", "utf8");
const bulk = readFileSync("features/products/bulk-price-service.ts", "utf8");
const repository = readFileSync("features/products/prisma-repository.ts", "utf8");
const query = readFileSync("features/products/list-query.ts", "utf8");
const drawer = readFileSync("features/products/components/product-print-shelf-drawer.tsx", "utf8");
const barcodeDrawer = readFileSync("features/products/components/product-print-barcode-drawer.tsx", "utf8");
const list = readFileSync("features/products/components/product-list-client.tsx", "utf8");
const createStart = repository.indexOf("export async function writePrismaProductCreate");
const createBody = repository.slice(createStart, repository.indexOf("export async function createPrismaProduct"));
const sendPrint = drawer.slice(drawer.indexOf("function sendToPrinter"), drawer.indexOf("async function markPrinted"));
const archive = repository.slice(repository.indexOf("export async function writePrismaProductArchive"), repository.indexOf("export async function archivePrismaProduct"));

check("schema columns", schema.includes("labelReprintNeeded") && schema.includes("labelPrintedAt") && schema.includes('@map("label_reprint_needed")') && schema.includes('@map("label_printed_at")') && schema.includes("DateTime?"));
check("migration is additive", migration.includes("ADD COLUMN IF NOT EXISTS") && migration.includes("DEFAULT false") && !/drop|rename/i.test(migration));
check("price change marks only the changed value", sellingPriceChanged(1000, 1100) && !sellingPriceChanged(1000, 1000) && !sellingPriceChanged(6000, 6000));
check("unit names stay independent", reprintUnitNames({ units: [
  { labelReprintNeeded: true, status: "active", unitName: "Piece" },
  { labelReprintNeeded: false, status: "active", unitName: "Pack" },
  { labelReprintNeeded: true, status: "inactive", unitName: "Box" },
] }).join(",") === "Piece");
check("legacy piece uses the product flag", reprintUnitNames({ labelReprintNeeded: true, units: [] }).join(",") === "Piece" && !productNeedsLabelReprint({ labelReprintNeeded: false, units: [] }));
const applyLine = bulk.slice(bulk.indexOf("async function applyBulkLine"));
check("bulk marks only after a successful price write", applyLine.includes("await markShelfLabelReprintNeeded") && applyLine.includes("data: { sellingPriceLak: line.newPriceLak }") && applyLine.indexOf('if (status !== "updated")') < applyLine.indexOf("markShelfLabelReprintNeeded"));
check("mark needed does not clear the last print time", !service.slice(0, service.indexOf("export async function markShelfLabelsPrinted")).includes("labelPrintedAt"));
check("mark printed rechecks the prepared price", service.includes("observedPriceLak") && service.includes("price_changed") && service.includes("labelPrintedAt: printedAt") && service.includes('source: "shelf_label_print"'));
check("filter counts products with an enabled flagged unit", query.includes("needs_label_reprint") && query.includes("pu.label_reprint_needed = true") && query.includes("pu.status = 'active'") && query.includes("p.status <> 'deleted'"));
check("new product create does not flag", !createBody.includes("labelReprintNeeded"));
check("soft delete preserves the flag", !archive.includes("labelReprintNeeded"));
check("print does not clear", sendPrint.includes("window.print()") && !sendPrint.includes("markShelfLabelsPrintedAction"));
check("shelf prefill is reprint-only", drawer.includes('prefillReprint && unit.labelReprintNeeded') && drawer.includes('data-prefill={prefillReprint ? "reprint" : "manual"}'));
check("barcode print does not clear", !barcodeDrawer.includes("markShelfLabelsPrinted") && !barcodeDrawer.includes("labelReprintNeeded"));
check("list shows unit names and the product count", list.includes('value="needs_label_reprint"') && list.includes('data-testid="products-reprint-units"') && list.includes('data-testid="products-reprint-count"') && list.includes('"new_products"'));
const shelf = shelfPrintUnits({
  id: "water",
  labelReprintNeeded: false,
  sellingPriceLak: 1000,
  units: [
    { id: "piece", labelReprintNeeded: true, sellingPriceLak: 1100, status: "active", unitName: "Piece" },
    { id: "pack", labelReprintNeeded: false, sellingPriceLak: 6000, status: "active", unitName: "Pack" },
  ],
});
check("shelf units keep their own reprint flag", shelf.find((unit) => unit.unitName === "Piece")?.labelReprintNeeded === true && shelf.find((unit) => unit.unitName === "Pack")?.labelReprintNeeded === false);

const en = getProductsCopy("en");
const lo = getProductsCopy("lo");
const labels = ["needsLabelReprint", "labelsNeedReprint", "needsLabel", "markAsPrinted", "markPrintedLabels", "labelPrinted", "lastPrinted", "notYet", "priceChangedAfterLabel", "reprintRequired", "noLabelsNeedReprint", "printSentToBrowser"] as const;
check("EN", en.needsLabelReprint === "Needs Label Reprint" && en.markPrintedLabels === "Mark Printed Labels" && en.noLabelsNeedReprint === "No labels need reprinting" && en.priceChangedAfterLabel === "Price changed after this label was prepared" && labels.every((key) => en[key].length > 0));
check("LO", labels.every((key) => lo[key] !== en[key] && lo[key].length > 0));
check("copy parity", productsCopyKeyParity());

const failed = results.filter((row) => !row.ok);
console.log(`\n${results.length - failed.length}/${results.length}`);
if (failed.length) process.exit(1);
