/**
 * Product tool improvements: unit label order, preview paging, and amount pricing.
 * No database writes.
 */
import { barcodePrintUnits, buildBarcodePrintJob, type BarcodePrintProduct } from "../features/products/barcode-print";
import { bulkPriceUnits, quoteBulkSellingPrice, type BulkPriceProductSource } from "../features/products/bulk-price";
import {
  LABEL_PREVIEW_PAGE_SIZE_KEY,
  expandLabelCopies,
  nextLabelPreviewPage,
  normalizeLabelPreviewPageSize,
  sliceLabelPreview,
} from "../features/products/label-preview-page";
import { shelfPrintUnits } from "../features/products/shelf-print";
import { getProductsCopy, productsCopyKeyParity } from "../lib/i18n/products-copy";

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

function barcodeProduct(units: BarcodePrintProduct["units"]): BarcodePrintProduct {
  return { barcode: "LEGACY", id: "water", nameEn: "Water", nameLo: "ນ້ຳ", sellingPriceLak: 1500, sku: "WATER", units };
}

const mixed = barcodeProduct([
  { barcode: "BOX-1", sellingPriceLak: 110000, status: "active", unitName: "Box" },
  { barcode: "OLD", sellingPriceLak: 1, status: "inactive", unitName: "Pack" },
  { allowManualUnitSelect: false, barcode: "OFF", sellingPriceLak: 2, status: "active", unitName: "Piece" },
  { barcode: "PACK-1", sellingPriceLak: 28000, status: "active", unitName: "Pack" },
  { barcode: "PIECE-1", sellingPriceLak: 5000, status: "active", unitName: "Piece" },
]);
const barcodeUnits = barcodePrintUnits(mixed);
const shelfUnits = shelfPrintUnits(mixed);
check("piece only", barcodePrintUnits(barcodeProduct([{ barcode: "P", sellingPriceLak: 1500, status: "active", unitName: "Piece" }])).map((unit) => unit.unitName).join(",") === "Piece");
check("enabled units stay in piece pack box order", barcodeUnits.map((unit) => unit.unitName).join(",") === "Piece,Pack,Box" && shelfUnits.map((unit) => unit.unitName).join(",") === "Piece,Pack,Box");
check("disabled units are hidden", barcodeUnits.every((unit) => unit.barcode !== "OLD" && unit.barcode !== "OFF"));
check("unit barcode and price stay independent", barcodeUnits[0]?.barcode === "PIECE-1" && barcodeUnits[0]?.priceLak === 5000 && barcodeUnits[1]?.barcode === "PACK-1" && barcodeUnits[1]?.priceLak === 28000 && barcodeUnits[2]?.priceLak === 110000 && shelfUnits[1]?.priceLak === 28000);

const pieceOnly = barcodePrintUnits(barcodeProduct([]));
check("legacy product is one piece", pieceOnly.length === 1 && pieceOnly[0]?.unitName === "Piece" && pieceOnly[0]?.barcode === "LEGACY");

const selected = buildBarcodePrintJob([
  { ...barcodeUnits[0]!, copies: 20 },
  { ...barcodeUnits[1]!, copies: 10 },
  { ...barcodeUnits[2]!, copies: 5 },
]);
const printed = expandLabelCopies(selected.printable);
check("print includes every selected copy", printed.length === 35 && selected.total === 35);
for (const size of [12, 24, 48] as const) {
  const page = sliceLabelPreview(printed, 1, size);
  check(`preview page ${size}`, page.items.length === Math.min(size, printed.length) && page.pages === Math.ceil(printed.length / size));
}
check("later preview page stays inside the page size", sliceLabelPreview(printed, 2, 12).items.length === 12 && sliceLabelPreview(printed, 3, 12).items.length === 11);
check("page clamps when the page size changes", nextLabelPreviewPage({ page: 4, pageSize: 24, previousSignature: "same", signature: "same", total: 35 }) === 2);
check("page resets when the selection changes", nextLabelPreviewPage({ page: 3, pageSize: 12, previousSignature: "old", signature: "new", total: 35 }) === 1);

const memory = new Map<string, string>();
memory.set(LABEL_PREVIEW_PAGE_SIZE_KEY, "24");
const stored = normalizeLabelPreviewPageSize(memory.get(LABEL_PREVIEW_PAGE_SIZE_KEY));
memory.set(LABEL_PREVIEW_PAGE_SIZE_KEY, String(stored));
check("page size preference restores 24 and rejects other values", stored === 24 && memory.get(LABEL_PREVIEW_PAGE_SIZE_KEY) === "24" && normalizeLabelPreviewPageSize("36") === 12 && normalizeLabelPreviewPageSize(null) === 12);

function priceProduct(units: BulkPriceProductSource["units"]): BulkPriceProductSource {
  return { costPriceLak: 900, id: "water", nameEn: "Water", nameLo: "ນ້ຳ", sellingPriceLak: 999, sku: "WATER", units };
}
const priceUnits = bulkPriceUnits(priceProduct([
  { costPriceLak: 400, id: "box", roundingLak: 1000, sellingPriceLak: 110000, status: "active", unitName: "Box" },
  { costPriceLak: 50, id: "piece", roundingLak: 0, sellingPriceLak: 1500, status: "active", unitName: "Piece" },
  { costPriceLak: 9, id: "off", roundingLak: 0, sellingPriceLak: 1, status: "inactive", unitName: "Pack" },
  { allowManualUnitSelect: false, costPriceLak: 8, id: "hidden", roundingLak: 0, sellingPriceLak: 2, status: "active", unitName: "Pack" },
  { costPriceLak: 200, id: "pack", roundingLak: 500, sellingPriceLak: 28000, status: "active", unitName: "Pack" },
]));
check("price units keep their own selling prices", priceUnits.map((unit) => `${unit.unitName}:${unit.priceLak}`).join(",") === "Piece:1500,Pack:28000,Box:110000");
check("cost is not the selling price", priceUnits.every((unit) => unit.costLak !== unit.priceLak));

const piece = priceUnits[0]!;
const pack = priceUnits[1]!;
const increasePercent = quoteBulkSellingPrice({ currentPriceLak: piece.priceLak, jobRounding: 1000, method: "increase_percent", value: 20 });
const decreasePercent = quoteBulkSellingPrice({ currentPriceLak: piece.priceLak, jobRounding: 1000, method: "decrease_percent", value: 20 });
const increaseAmount = quoteBulkSellingPrice({ currentPriceLak: piece.priceLak, jobRounding: 1000, method: "increase_amount", value: 1000 });
const decreaseAmount = quoteBulkSellingPrice({ currentPriceLak: piece.priceLak, jobRounding: 1000, method: "decrease_amount", value: 500 });
check("percent increase rounds up", increasePercent.rawPriceLak === 1800 && increasePercent.newPriceLak === 2000);
check("percent decrease rounds down", decreasePercent.rawPriceLak === 1200 && decreasePercent.newPriceLak === 1000);
check("amount increase rounds up", increaseAmount.rawPriceLak === 2500 && increaseAmount.newPriceLak === 3000);
check("amount decrease keeps an exact multiple", decreaseAmount.rawPriceLak === 1000 && decreaseAmount.newPriceLak === 1000);
check("exact rounding boundary stays unchanged", quoteBulkSellingPrice({ currentPriceLak: 2000, jobRounding: 1000, method: "increase_amount", value: 0 }).newPriceLak === 2000 && quoteBulkSellingPrice({ currentPriceLak: 2000, jobRounding: 1000, method: "decrease_amount", value: 0 }).newPriceLak === 2000);
check("no rounding keeps the LAK integer", quoteBulkSellingPrice({ currentPriceLak: 22820, jobRounding: 0, method: "increase_percent", value: 10 }).newPriceLak === 25102);
check("pack price is not derived from piece", quoteBulkSellingPrice({ currentPriceLak: pack.priceLak, jobRounding: 0, method: "increase_percent", value: 20 }).newPriceLak === 33600 && pack.priceLak === 28000);
check("negative amount is blocked", quoteBulkSellingPrice({ currentPriceLak: 1500, method: "decrease_amount", roundingLak: 0, value: 2000 }).reason === "negative");
check("empty adjustment is invalid", quoteBulkSellingPrice({ currentPriceLak: 1500, method: "increase_amount", value: Number.NaN }).reason === "invalid_value");

const ready = priceUnits
  .map((unit, index) => ({ ...unit, included: index === 0, quote: quoteBulkSellingPrice({ currentPriceLak: unit.priceLak, jobRounding: 1000, method: "increase_amount", value: 1000 }) }))
  .filter((unit) => unit.included && unit.quote.newPriceLak !== null && unit.quote.newPriceLak !== unit.priceLak);
check("unselected units are not updated", ready.length === 1 && ready[0]?.unitName === "Piece" && ready[0]?.quote.newPriceLak === 3000);

const en = getProductsCopy("en");
const lo = getProductsCopy("lo");
check("amount copy", en.bulkAmount === "Amount" && lo.bulkAmount !== en.bulkAmount && en.bulkManual === "Manual" && en.printLabelsPerPage.length > 0 && lo.printPageLabel !== en.printPageLabel);
check("copy parity", productsCopyKeyParity());

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length}`);
if (failed.length) process.exit(1);
