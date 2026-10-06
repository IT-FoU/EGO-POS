import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findPosScanMatch, resolveUnitCardImageUrl } from "../features/pos/pos-cart";
import type { PosProduct, PosProductUnit } from "../features/pos/types";
import {
  missingBarcodeUnits,
  missingImageUnits,
  productMissingBarcode,
  productMissingImage,
  type CoverageProduct,
  type CoverageUnit,
} from "../features/products/unit-coverage";
import { productsCopyKeyParity, tProducts } from "../lib/i18n/products-copy";

function check(name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const results: Array<{ detail: string; name: string; ok: boolean }> = [];

function unit(partial: Partial<CoverageUnit> & { unitName: string }): CoverageUnit {
  return {
    allowManualUnitSelect: true,
    barcode: `${partial.unitName}-BC`,
    imageUrl: `products/demo/${partial.unitName.toLowerCase()}.webp`,
    status: "active",
    ...partial,
  };
}

function names(units: CoverageUnit[]) {
  return units.map((item) => item.unitName).join(", ");
}

const covered = {
  units: [unit({ unitName: "Piece" }), unit({ unitName: "Pack" }), unit({ unitName: "Box" })],
};
check("1. Piece Pack Box images covered", productMissingImage(covered) === false);
check("1b. Piece Pack Box barcodes covered", productMissingBarcode(covered) === false);

const packMissing = {
  units: [unit({ unitName: "Piece" }), unit({ imageUrl: "", unitName: "Pack" }), unit({ unitName: "Box" })],
};
check("2. Pack missing image", productMissingImage(packMissing) && names(missingImageUnits(packMissing)) === "Pack");
const packBarcode = {
  units: [unit({ unitName: "Piece" }), unit({ barcode: "  ", unitName: "Pack" }), unit({ unitName: "Box" })],
};
check("2b. Pack missing barcode", productMissingBarcode(packBarcode) && names(missingBarcodeUnits(packBarcode)) === "Pack");

const pieceMissing = {
  barcode: "PRODUCT-LEVEL",
  imageUrl: "products/demo/main.webp",
  units: [unit({ imageUrl: "", unitName: "Piece" }), unit({ unitName: "Pack" }), unit({ unitName: "Box" })],
};
check("3. Piece missing image ignores product image", productMissingImage(pieceMissing) && names(missingImageUnits(pieceMissing)) === "Piece");
const pieceBarcode = {
  barcode: "PRODUCT-LEVEL",
  units: [unit({ barcode: "", unitName: "Piece" }), unit({ unitName: "Pack" }), unit({ unitName: "Box" })],
};
check("3b. Piece missing barcode ignores product barcode", productMissingBarcode(pieceBarcode) && names(missingBarcodeUnits(pieceBarcode)) === "Piece");

const packAndBox = {
  units: [unit({ unitName: "Piece" }), unit({ imageUrl: null, unitName: "Pack" }), unit({ imageUrl: "", unitName: "Box" })],
};
check("4. Pack and Box missing image", productMissingImage(packAndBox) && names(missingImageUnits(packAndBox)) === "Pack, Box");
const packAndBoxBarcode = {
  units: [unit({ unitName: "Piece" }), unit({ barcode: "", unitName: "Pack" }), unit({ barcode: null, unitName: "Box" })],
};
check("4b. Pack and Box missing barcode", productMissingBarcode(packAndBoxBarcode) && names(missingBarcodeUnits(packAndBoxBarcode)) === "Pack, Box");

const disabledBox = {
  units: [
    unit({ unitName: "Piece" }),
    unit({ unitName: "Pack" }),
    unit({ barcode: "", imageUrl: "", status: "inactive", unitName: "Box" }),
  ],
};
check("5. Disabled Box is excluded", productMissingImage(disabledBox) === false && productMissingBarcode(disabledBox) === false);

const blockedBox = {
  units: [
    unit({ unitName: "Piece" }),
    unit({ unitName: "Pack" }),
    unit({ allowManualUnitSelect: false, barcode: "", imageUrl: "", unitName: "Box" }),
  ],
};
check("6. Manual-blocked Box is excluded", productMissingImage(blockedBox) === false && productMissingBarcode(blockedBox) === false);

const tray: CoverageProduct = {
  units: [unit({ unitName: "Piece" }), unit({ barcode: "", imageUrl: "", sortOrder: 4, unitName: "Tray" })],
};
check("7. Enabled custom Tray is missing image and barcode", productMissingImage(tray) && productMissingBarcode(tray) && names(missingImageUnits(tray)) === "Tray");
const trayOff: CoverageProduct = {
  units: [unit({ unitName: "Piece" }), unit({ barcode: "", imageUrl: "", status: "inactive", unitName: "Tray" })],
};
check("8. Disabled Tray does not create coverage gaps", productMissingImage(trayOff) === false && productMissingBarcode(trayOff) === false);

const fallbackProduct: CoverageProduct = {
  imageUrl: "https://cdn.example/piece.jpg",
  units: [unit({ imageUrl: "https://cdn.example/piece.jpg", unitName: "Piece" }), unit({ imageUrl: "", unitName: "Pack" })],
};
const fallbackDisplay = resolveUnitCardImageUrl(
  {
    productImageUrl: "https://cdn.example/piece.jpg",
    unitImageUrl: "https://cdn.example/piece.jpg",
  } as PosProduct,
  { imageUrl: "" } as PosProductUnit,
);
check(
  "9. POS image fallback does not count as Pack coverage",
  productMissingImage(fallbackProduct) && names(missingImageUnits(fallbackProduct)) === "Pack" && fallbackDisplay === "https://cdn.example/piece.jpg",
);

const legacyCovered: CoverageProduct = { barcode: "LEGACY-1", imageUrl: "products/legacy/main.webp", units: [] };
const legacyEmpty: CoverageProduct = { barcode: "   ", imageUrl: "", units: [] };
check("10. Legacy product without units uses product image and barcode", productMissingImage(legacyCovered) === false && productMissingBarcode(legacyCovered) === false);
check("11. Legacy product without units is missing when product fields are blank", productMissingImage(legacyEmpty) && productMissingBarcode(legacyEmpty) && names(missingImageUnits(legacyEmpty)) === "Piece");

const catalogue = [packAndBox, pieceMissing, covered, disabledBox];
check("12. Missing image KPI counts products, not units", catalogue.filter(productMissingImage).length === 2);
check("13. Missing barcode KPI counts products, not units", [packAndBoxBarcode, pieceBarcode, covered].filter(productMissingBarcode).length === 2);

const scanProduct = {
  barcode: "PRODUCT-LEVEL",
  id: "p1",
  nameEn: "Sample",
  nameLo: "ຕົວຢ່າງ",
  sku: "SKU-1",
  units: [
    { barcode: "PIECE-1", id: "u1", status: "active", unitName: "Piece" },
    { barcode: "PACK-1", id: "u2", status: "active", unitName: "Pack" },
    { barcode: "BOX-OFF", id: "u3", status: "inactive", unitName: "Box" },
  ],
} as PosProduct;
check("14. POS scan still resolves an enabled unit barcode", findPosScanMatch([scanProduct], "PACK-1")?.unit?.unitName === "Pack");
check("15. POS scan still resolves the product barcode", findPosScanMatch([scanProduct], "PRODUCT-LEVEL")?.product.id === "p1" && !findPosScanMatch([scanProduct], "PRODUCT-LEVEL")?.unit);
check("16. POS scan still ignores an inactive unit barcode", findPosScanMatch([scanProduct], "BOX-OFF") === null);

check("17. EN coverage labels", tProducts("noImage", "en") === "No Image" && tProducts("missingBarcode", "en") === "Missing Barcode" && tProducts("missingImageUnits", "en") === "Missing image: {units}" && tProducts("missingBarcodeUnits", "en") === "Missing barcode: {units}");
check("18. LO coverage labels", tProducts("noImage", "lo") === "ບໍ່ມີຮູບ" && tProducts("missingBarcode", "lo") === "ຂາດ Barcode" && tProducts("missingImageUnits", "lo") === "ຂາດຮູບ: {units}" && tProducts("missingBarcodeUnits", "lo") === "ຂາດ Barcode: {units}" && productsCopyKeyParity());

const listQuery = readFileSync(resolve(process.cwd(), "features/products/list-query.ts"), "utf8");
const listClient = readFileSync(resolve(process.cwd(), "features/products/components/product-list-client.tsx"), "utf8");
check(
  "19. List filter and KPI share the enabled-unit SQL",
  listQuery.includes("allow_manual_unit_select = true")
    && listQuery.includes("unitCoverageGap(\"image\")")
    && listQuery.includes("unitCoverageGap(\"barcode\")")
    && listQuery.includes("loadCoverageGapIds")
    && !listQuery.includes("none: { barcode")
    && !listQuery.includes("none: { imageUrl"),
);
check(
  "20. Product list uses the coverage helper for filter, KPI fallback, and row text",
  listClient.includes("productMissingImage")
    && listClient.includes("productMissingBarcode")
    && listClient.includes("missing-image-units")
    && listClient.includes("missing-barcode-units")
    && listClient.includes('applyInsightFilter("no_image")')
    && listClient.includes('applyInsightFilter("missing_barcode")'),
);

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exit(1);
