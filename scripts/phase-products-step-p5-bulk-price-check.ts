/**
 * Products step P5 bulk price update. No database writes.
 */
import { readFileSync } from "node:fs";
import { bulkPriceUnits, quoteBulkSellingPrice, shelfLabelReprintCandidate, type BulkPriceProductSource } from "../features/products/bulk-price";
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
  sku: "WATER",
  units: [
    { id: "piece", roundingLak: 500, sellingPriceLak: 5000, status: "active", unitName: "Piece" },
    { id: "pack", roundingLak: 500, sellingPriceLak: 28000, status: "active", unitName: "Pack" },
    { id: "box", roundingLak: 500, sellingPriceLak: 110000, status: "active", unitName: "Box" },
    { id: "tray", roundingLak: 0, sellingPriceLak: 12000, status: "active", unitName: "Tray" },
    { id: "old", roundingLak: 0, sellingPriceLak: 1, status: "inactive", unitName: "Pack" },
  ],
});
const units = bulkPriceUnits(water);
check("piece pack box custom stay independent", units.find((unit) => unit.unitName === "Piece")?.priceLak === 5000 && units.find((unit) => unit.unitName === "Pack")?.priceLak === 28000 && units.find((unit) => unit.unitName === "Box")?.priceLak === 110000 && units.find((unit) => unit.unitName === "Tray")?.priceLak === 12000 && units.every((unit) => unit.unitId !== "old"));
check("percent increase uses each unit", quoteBulkSellingPrice({ currentPriceLak: 5000, jobRounding: 0, method: "increase_percent", value: 10 }).newPriceLak === 5500 && quoteBulkSellingPrice({ currentPriceLak: 28000, jobRounding: 0, method: "increase_percent", value: 10 }).newPriceLak === 30800 && quoteBulkSellingPrice({ currentPriceLak: 110000, jobRounding: 0, method: "increase_percent", value: 10 }).newPriceLak === 121000);
check("percent decrease", quoteBulkSellingPrice({ currentPriceLak: 5000, jobRounding: 0, method: "decrease_percent", value: 5 }).newPriceLak === 4750);
check("manual price is exact", quoteBulkSellingPrice({ currentPriceLak: 28000, method: "set_exact", roundingLak: 500, value: 25520 }).newPriceLak === 25520);
check("manual rounding is explicit", quoteBulkSellingPrice({ currentPriceLak: 28000, jobRounding: 1000, method: "set_exact", roundExact: true, value: 25520 }).newPriceLak === 26000 && quoteBulkSellingPrice({ currentPriceLak: 25100, jobRounding: 500, method: "set_exact", roundExact: true, value: 25100 }).newPriceLak === 25500);
check("override 100", quoteBulkSellingPrice({ currentPriceLak: 22820, jobRounding: 100, method: "increase_percent", value: 10 }).newPriceLak === 25200);
check("override 500", quoteBulkSellingPrice({ currentPriceLak: 22820, jobRounding: 500, method: "increase_percent", value: 10 }).newPriceLak === 25500);
check("override 1000", quoteBulkSellingPrice({ currentPriceLak: 22820, jobRounding: 1000, method: "increase_percent", value: 10 }).newPriceLak === 26000);
check("no rounding", quoteBulkSellingPrice({ currentPriceLak: 22820, jobRounding: 0, method: "increase_percent", value: 10 }).newPriceLak === 25102);
check("unit rounding still applies when the job does not override", quoteBulkSellingPrice({ currentPriceLak: 22820, method: "increase_percent", roundingLak: 1000, value: 10 }).newPriceLak === 26000);
check("reprint hook persists the changed unit", shelfLabelReprintCandidate({ productId: "water", unitId: "pack" }).persist && shelfLabelReprintCandidate({ legacy: true, productId: "old", unitId: "" }).legacy);

const en = getProductsCopy("en");
const lo = getProductsCopy("lo");
const labels = ["bulkPriceUpdate", "bulkSelectedProducts", "printSelectUnits", "bulkPercent", "bulkIncrease", "bulkDecrease", "bulkManual", "bulkCurrentPrice", "bulkNewPrice", "bulkOverrideRounding", "bulkNoRounding", "bulkApplyRoundingManual", "bulkPreviewChanges", "bulkProductsAffected", "bulkUnitsAffected", "bulkUnchanged", "bulkConflict", "bulkApply", "bulkUpdated", "bulkSkipped", "bulkFailed", "bulkRefreshPreview"] as const;
check("EN", en.bulkPriceUpdate === "Bulk Price Update" && en.bulkApply === "Apply Price Updates" && en.bulkPercent === "Percent" && en.bulkManual === "Manual" && en.bulkNoRounding === "No Rounding" && labels.every((key) => en[key].length > 0));
check("LO", labels.every((key) => lo[key] !== en[key]));
check("copy parity", productsCopyKeyParity());

const drawer = readFileSync("features/products/components/product-bulk-price-drawer.tsx", "utf8");
const previewButton = drawer.slice(drawer.indexOf("products-bulk-preview"), drawer.indexOf("products-bulk-preview") + 400);
check("selection load and preview does not write", drawer.includes("productIds: ids") && !drawer.includes("products-bulk-search") && previewButton.includes("setPhase(\"preview\")") && !previewButton.includes("applyBulkSellingPricesAction"));
const service = readFileSync("features/products/bulk-price-service.ts", "utf8");
check("apply still writes selling price only", service.includes("data: { sellingPriceLak: line.newPriceLak }") && !service.includes("roundingLak: line") && !service.includes("costPriceLak: line") && !service.includes("data: { costPriceLak") && service.includes("shelfLabelReprintCandidate") && service.includes("roundingOverrideLak"));
check("schema stores the reprint flag", readFileSync("prisma/schema.prisma", "utf8").includes("labelReprintNeeded") && readFileSync("prisma/schema.prisma", "utf8").includes("labelPrintedAt"));

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length}`);
if (failed.length) process.exit(1);
