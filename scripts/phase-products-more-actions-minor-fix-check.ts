/**
 * Products More Actions minor column fixes. No database writes.
 */
import { readFileSync } from "node:fs";
import { barcodeAuditCsv, buildBarcodeAudit, relatedProductLabel, type BarcodeAuditProduct } from "../features/products/barcode-audit";
import { bulkPriceUnits } from "../features/products/bulk-price";
import { getProductsCopy, productsCopyKeyParity } from "../lib/i18n/products-copy";

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

function product(input: Partial<BarcodeAuditProduct> & { id: string }): BarcodeAuditProduct {
  return {
    barcode: "",
    nameEn: input.nameEn ?? input.id,
    nameLo: input.nameLo ?? input.nameEn ?? input.id,
    sku: input.sku ?? input.id,
    status: "active",
    units: [],
    ...input,
  };
}

function unit(unitName: string, barcode: string) {
  return { allowManualUnitSelect: true, barcode, status: "active", unitName };
}

const csvLabels = {
  conflict: "Barcode Conflict",
  duplicate: "Duplicate Barcode",
  invalid: "Invalid Barcode",
  missing: "Missing Barcode",
  missing_barcode: "Enabled unit has no barcode.",
  scan_conflict: "Scan can match more than one unit.",
  shared_barcode: "Another record also stores this barcode.",
};

function parseCsv(text: string) {
  const body = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index] ?? "";
    if (quoted) {
      if (char === "\"") {
        if (body[index + 1] === "\"") {
          cell += "\"";
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  return rows.filter((line) => line.some((value) => value.length > 0));
}

const bulk = readFileSync("features/products/components/product-bulk-price-drawer.tsx", "utf8");
const previewStart = bulk.indexOf('testId="products-bulk-quote-table"');
const previewHead = bulk.slice(previewStart, bulk.indexOf("</thead>", previewStart));
const previewHeaders = [...previewHead.matchAll(/<th(?:\s[^>]*)?>([\s\S]*?)<\/th>/g)].map((match) => (match[1] ?? "").replace(/\s+/g, " ").trim());
const expectedHeaders = [
  '{t("productName")}',
  '{t("barcode")}',
  '{t("unit")}',
  '{t("cost")}',
  '{t("bulkCurrentSellingPrice")}',
  '{t("bulkRawResult")}',
  '{t("bulkNewSellingPrice")}',
  '{t("bulkDifference")}',
];
check("preview headers use product name and barcode", previewHeaders.join("|") === expectedHeaders.join("|"));
const previewBody = bulk.slice(previewStart, bulk.indexOf("</tbody>", previewStart));
check("preview barcode cell uses the unit barcode", previewBody.includes('data-testid="products-bulk-preview-barcode">{line.barcode || "—"}') && !previewBody.includes(">{line.sku}<"));
check("raw result and difference stay in the preview", previewBody.includes('data-testid="products-bulk-raw"') && previewBody.includes('t("bulkDifference")'));

const pricedUnits = bulkPriceUnits({
  id: "water",
  nameEn: "Water",
  nameLo: "ນ້ຳ",
  sku: "WATER-SKU",
  units: [
    { barcode: "PIECE-100", id: "piece", sellingPriceLak: 1500, status: "active", unitName: "Piece" },
    { barcode: "PACK-200", id: "pack", sellingPriceLak: 8000, status: "active", unitName: "Pack" },
    { barcode: "BOX-300", id: "box", sellingPriceLak: 20000, status: "active", unitName: "Box" },
  ],
});
check("each unit keeps its own barcode", pricedUnits.map((unit) => `${unit.unitName}:${unit.barcode}`).join("|") === "Piece:PIECE-100|Pack:PACK-200|Box:BOX-300");

const en = getProductsCopy("en");
const lo = getProductsCopy("lo");
check("bulk preview labels localize", en.productName === "Product Name" && lo.productName === "ຊື່ສິນຄ້າ" && en.barcode === "Barcode" && lo.barcode === "Barcode" && en.bulkRawResult.length > 0 && lo.bulkRawResult !== en.bulkRawResult && en.bulkDifference.length > 0 && lo.bulkDifference !== en.bulkDifference);
check("related product label localizes", en.auditRelatedProduct === "Related Product" && lo.auditRelatedProduct === "ສິນຄ້າທີ່ກ່ຽວຂ້ອງ" && productsCopyKeyParity());

const pair = buildBarcodeAudit([
  product({ id: "a", nameEn: "Water", nameLo: "Water", sku: "SKU-A", units: [unit("Piece", "DUP")] }),
  product({ id: "b", nameEn: "Soda", nameLo: "Soda", sku: "SKU-B", units: [unit("Piece", "DUP")] }),
]);
check("two products stay a conflict", pair.conflictCount === 2 && pair.duplicateCount === 2 && pair.issues.every((issue) => issue.details === "scan_conflict"));
check("two products name each other", pair.issues.every((issue) => !issue.relatedProducts.some((related) => related.productId === issue.productId)) && relatedProductLabel(pair.issues.find((issue) => issue.productId === "a")!) === "Soda" && relatedProductLabel(pair.issues.find((issue) => issue.productId === "b")!) === "Water");

const trio = buildBarcodeAudit([
  product({ id: "c", nameEn: "Gamma", sku: "SKU-C", units: [unit("Piece", "TRIPLE")] }),
  product({ id: "a", nameEn: "Alpha", sku: "SKU-A", units: [unit("Piece", "TRIPLE")] }),
  product({ id: "b", nameEn: "Beta", sku: "SKU-B", units: [unit("Piece", "TRIPLE")] }),
]);
check("three products stay conflicts", trio.conflictCount === 3 && trio.missingCount === 0 && trio.invalidCount === 0);
check("three products list every other product", relatedProductLabel(trio.issues.find((issue) => issue.productId === "a")!) === "Beta, Gamma" && relatedProductLabel(trio.issues.find((issue) => issue.productId === "b")!) === "Alpha, Gamma" && relatedProductLabel(trio.issues.find((issue) => issue.productId === "c")!) === "Alpha, Beta");

const sameName = buildBarcodeAudit([
  product({ id: "a", nameEn: "Alpha", sku: "SKU-A", units: [unit("Piece", "SAME")] }),
  product({ id: "b", nameEn: "Water", sku: "SKU-1", units: [unit("Piece", "SAME")] }),
  product({ id: "c", nameEn: "Water", sku: "SKU-2", units: [unit("Piece", "SAME")] }),
]);
check("repeated related names stay distinct", relatedProductLabel(sameName.issues.find((issue) => issue.productId === "a")!) === "Water (SKU-1), Water (SKU-2)");

const sameProduct = buildBarcodeAudit([product({
  id: "same",
  nameEn: "Juice",
  units: [unit("Pack", "Z"), unit("Box", "Z")],
})]);
check("same product conflict does not list itself", sameProduct.conflictCount === 2 && sameProduct.issues.every((issue) => issue.details === "scan_conflict" && relatedProductLabel(issue) === "—"));

const across = buildBarcodeAudit([
  product({ id: "piece", nameEn: "Piece Item", units: [unit("Piece", "X")] }),
  product({ id: "pack", nameEn: "Pack Item", units: [unit("Pack", "X")] }),
]);
check("conflict across products keeps the classification and the other name", across.conflictCount === 2 && across.issues.every((issue) => issue.issue === "conflict") && relatedProductLabel(across.issues.find((issue) => issue.productId === "piece")!) === "Pack Item");

const missing = buildBarcodeAudit([product({
  id: "blank",
  nameEn: "Blank",
  units: [unit("Piece", ""), unit("Pack", "PK")],
})]);
check("missing barcode has no related product", missing.missingCount === 1 && missing.invalidCount === 0 && missing.issues[0]?.issue === "missing" && relatedProductLabel(missing.issues[0]!) === "—");

const shared = buildBarcodeAudit([
  product({ barcode: "P1", id: "shelf", nameEn: "Shelf", units: [unit("Piece", "OTHER")] }),
  product({ id: "scanned", nameEn: "Scanned", units: [unit("Piece", "P1")] }),
]);
check("shared barcode stays a duplicate and names the other product", shared.conflictCount === 0 && shared.duplicateCount === 2 && shared.issues.every((issue) => issue.issue === "duplicate") && relatedProductLabel(shared.issues.find((issue) => issue.productId === "shelf")!) === "Scanned");

const awkward = buildBarcodeAudit([
  product({ id: "plain", nameEn: "Plain", sku: "PLAIN", units: [unit("Piece", "ODD")] }),
  product({ id: "odd", nameEn: "Beta, \"Cold\"\nDrink", nameLo: "Beta, \"Cold\"\nDrink", sku: "ODD", units: [unit("Piece", "ODD")] }),
]);
const csv = parseCsv(barcodeAuditCsv(awkward.issues, csvLabels));
const header = csv[0] ?? [];
const plain = csv.find((row) => row[1] === "PLAIN");
check("csv adds the related product column", header.join(",") === "Product Name,SKU,Unit,Barcode,Issue Type,Details,Related Product");
check("csv escapes commas quotes and new lines", plain?.[6] === "Beta, \"Cold\"\nDrink" && plain[4] === "Barcode Conflict");
check("csv uses a dash when there is no related product", parseCsv(barcodeAuditCsv(missing.issues, csvLabels))[1]?.[6] === "—");

const auditDrawer = readFileSync("features/products/components/product-barcode-audit-drawer.tsx", "utf8");
check("audit table renders the related product column", auditDrawer.includes('t("auditRelatedProduct")') && auditDrawer.includes("products-barcode-audit-related") && auditDrawer.includes("relatedProductLabel"));

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length}`);
if (failed.length > 0) process.exit(1);
