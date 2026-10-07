/**
 * Products step C6 bulk selling prices. No database writes.
 */
import { readFileSync } from "node:fs";
import { bulkPriceUnits, classifyBulkLine, quoteBulkSellingPrice, type BulkPriceProductSource } from "../features/products/bulk-price";
import { getProductsCopy, productsCopyKeyParity } from "../lib/i18n/products-copy";

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

function product(input: Partial<BulkPriceProductSource> & { id: string }): BulkPriceProductSource {
  return { nameEn: input.id, nameLo: input.id, sellingPriceLak: 0, sku: input.id, units: [], ...input };
}

const water = product({
  id: "water",
  sellingPriceLak: 999,
  sku: "WATER",
  units: [
    { id: "piece", roundingLak: 0, sellingPriceLak: 5000, status: "active", unitName: "Piece" },
    { id: "pack", roundingLak: 1000, sellingPriceLak: 28000, status: "active", unitName: "Pack" },
    { id: "box", roundingLak: 500, sellingPriceLak: 110000, status: "active", unitName: "Box" },
    { id: "tray", roundingLak: 0, sellingPriceLak: 12000, status: "active", unitName: "Tray" },
    { id: "old", roundingLak: 0, sellingPriceLak: 1, status: "inactive", unitName: "Pack" },
    { id: "hidden", allowManualUnitSelect: false, roundingLak: 0, sellingPriceLak: 2, status: "active", unitName: "Carton" },
  ],
});
const units = bulkPriceUnits(water);
const piece = units.find((unit) => unit.unitName === "Piece");
const pack = units.find((unit) => unit.unitName === "Pack");
const box = units.find((unit) => unit.unitName === "Box");
const tray = units.find((unit) => unit.unitName === "Tray");

check("enabled units keep their own prices", piece?.priceLak === 5000 && pack?.priceLak === 28000 && box?.priceLak === 110000 && tray?.priceLak === 12000);
check("disabled units are excluded", units.every((unit) => unit.unitId !== "old" && unit.unitId !== "hidden") && units.length === 4);
check("exact price is saved as entered", quoteBulkSellingPrice({ currentPriceLak: 28000, method: "set_exact", roundingLak: 1000, value: 25000 }).newPriceLak === 25000);
check("exact zero is valid", quoteBulkSellingPrice({ currentPriceLak: 5000, method: "set_exact", roundingLak: 0, value: 0 }).newPriceLak === 0);
check("increase amount uses pack rounding", quoteBulkSellingPrice({ currentPriceLak: 28000, method: "increase_amount", roundingLak: 1000, value: 1500 }).newPriceLak === 30000);
check("decrease amount uses box rounding", quoteBulkSellingPrice({ currentPriceLak: 110000, method: "decrease_amount", roundingLak: 500, value: 500 }).newPriceLak === 109500);
check("increase percent", quoteBulkSellingPrice({ currentPriceLak: 28000, method: "increase_percent", roundingLak: 0, value: 10 }).newPriceLak === 30800);
check("decrease percent", quoteBulkSellingPrice({ currentPriceLak: 5000, method: "decrease_percent", roundingLak: 0, value: 5 }).newPriceLak === 4750);
check("negative result is blocked", quoteBulkSellingPrice({ currentPriceLak: 5000, method: "decrease_amount", roundingLak: 0, value: 6000 }).reason === "negative");
check("piece quote does not change the pack price", quoteBulkSellingPrice({ currentPriceLak: piece!.priceLak, method: "set_exact", roundingLak: piece!.roundingLak, value: 5100 }).newPriceLak === 5100 && pack?.priceLak === 28000);

const legacy = bulkPriceUnits(product({ id: "old", sellingPriceLak: 1500, sku: "OLD", units: [] }));
check("legacy product uses implicit piece", legacy.length === 1 && legacy[0]?.unitName === "Piece" && legacy[0]?.priceLak === 1500 && legacy[0]?.unitId === "");

check("stale price is a conflict", classifyBulkLine({ currentPriceLak: 5200, enabled: true, expectedPriceLak: 5000, found: true, newPriceLak: 5100 }) === "conflict");
check("matching preview can update", classifyBulkLine({ currentPriceLak: 5000, enabled: true, expectedPriceLak: 5000, found: true, newPriceLak: 5100 }) === "updated");
check("unchanged row is skipped", classifyBulkLine({ currentPriceLak: 5000, enabled: true, expectedPriceLak: 5000, found: true, newPriceLak: 5000 }) === "skipped");
check("disabled row is skipped", classifyBulkLine({ currentPriceLak: 5000, enabled: false, expectedPriceLak: 5000, found: true, newPriceLak: 5100 }) === "skipped");

const hundred = Array.from({ length: 100 }, (_, index) => quoteBulkSellingPrice({ currentPriceLak: 1000 + index, method: "increase_amount", roundingLak: 0, value: 1 }));
check("100 quotes stay valid", hundred.length === 100 && hundred.every((quote, index) => quote.newPriceLak === 1001 + index));

const en = getProductsCopy("en");
const lo = getProductsCopy("lo");
const labels = ["bulkPriceUpdate", "bulkSelectedProducts", "bulkFilteredProducts", "bulkSetExact", "bulkIncreaseAmount", "bulkDecreaseAmount", "bulkIncreasePercent", "bulkDecreasePercent", "bulkCurrentPrice", "bulkNewPrice", "bulkDifference", "bulkPreviewChanges", "bulkApply", "bulkUpdated", "bulkSkipped", "bulkFailed", "bulkConflict"] as const;
check("EN labels", en.bulkPriceUpdate === "Bulk Price Update" && en.bulkApply === "Apply Price Updates" && en.bulkSetExact === "Set Exact Price" && en.bulkPreviewChanges === "Preview Changes" && labels.every((key) => en[key].length > 0));
check("LO labels", labels.every((key) => lo[key] !== en[key]));
check("copy key parity", productsCopyKeyParity());

const drawer = readFileSync("features/products/components/product-bulk-price-drawer.tsx", "utf8");
const previewButton = drawer.slice(drawer.indexOf("products-bulk-preview"), drawer.indexOf("products-bulk-preview") + 400);
check("preview does not write", previewButton.includes("setPhase(\"preview\")") && !previewButton.includes("applyBulkSellingPricesAction"));
const service = readFileSync("features/products/bulk-price-service.ts", "utf8");
check("apply writes selling price only", service.includes("data: { sellingPriceLak: line.newPriceLak }") && !service.includes("costPriceLak: line") && !service.includes("data: { costPriceLak") && !service.includes("conversionQty") && !service.includes("imageUrl"));
check("apply records price history and bulk activity", service.includes("productPriceHistory.create") && service.includes("bulk_selling_price") && service.includes("Bulk Price Update") && service.includes("BULK_PRICE_BATCH_SIZE"));
check("apply rechecks the current price", service.includes("classifyBulkLine"));
const action = readFileSync("features/products/actions.ts", "utf8");
const actionBody = action.slice(action.indexOf("async function bulkPriceTenant"), action.indexOf("export async function searchBulkPriceProductsAction"));
check("permission is products.update and change price", actionBody.includes("WRITE_PERMISSIONS.productsUpdate") && actionBody.includes("FINE.productsChangePrice"));
const list = readFileSync("features/products/components/product-list-client.tsx", "utf8");
check("menu uses the price permission and selected rows", list.includes('testId="products-bulk-price-action"') && list.includes("selectedIds={selectedIds}") && list.includes("productAccess.editPrice"));
const scanner = readFileSync("features/pos/pos-cart.ts", "utf8");
check("scanner was not changed", scanner.includes("unitMatches.length > 1"));
check("pos still reads the unit selling price", scanner.includes("unit.sellingPriceLak"));

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exit(1);
