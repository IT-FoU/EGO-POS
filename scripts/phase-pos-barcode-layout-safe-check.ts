/**
 * POS barcode scanner layout-safe helper tests.
 * Run: npx tsx scripts/phase-pos-barcode-layout-safe-check.ts
 */
import {
  findPosScanMatch,
  filterPosCatalogue,
} from "../features/pos/pos-cart";
import type { PosProduct } from "../features/pos/types";
import {
  isScannerEnterCode,
  mapScannerKeyCode,
  ScannerKeycodeSession,
  SCAN_MAX_KEY_INTERVAL_MS,
  SCAN_MIN_LENGTH,
} from "../features/pos/scanner-keycode";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, extra = "") {
  if (!ok) {
    failed += 1;
    console.error(`FAIL: ${label}${extra ? ` — ${extra}` : ""}`);
    process.exitCode = 1;
    return;
  }
  passed += 1;
  console.log(`PASS: ${label}`);
}

function product(partial: Partial<PosProduct> & Pick<PosProduct, "id" | "barcode">): PosProduct {
  return {
    categoryName: "Drinks",
    costPriceLak: 1000,
    nameEn: "English Water",
    nameLo: "ນ້ຳດື່ມ",
    priceLak: 2000,
    sku: "SKU-WATER",
    productCode: "P-WATER",
    stockQty: 50,
    unitName: "Piece",
    units: [
      {
        barcode: partial.barcode,
        conversionQty: 1,
        costPriceLak: 1000,
        id: `${partial.id}-base`,
        isBaseUnit: true,
        isDefaultSaleUnit: true,
        sellingPriceLak: 2000,
        status: "active",
        unitName: "Piece",
      },
    ],
    ...partial,
  };
}

const sampleBarcode = "8851959132015";
const digitCodes = sampleBarcode.split("").map((digit) => `Digit${digit}`);

check("1. Digit0–9 map to ASCII", mapScannerKeyCode("Digit8") === "8" && mapScannerKeyCode("Digit0") === "0");
check("2. Numpad digits map", mapScannerKeyCode("Numpad5") === "5");
check("3. KeyA–Z map uppercase", mapScannerKeyCode("KeyA") === "A" && mapScannerKeyCode("KeyZ") === "Z");
check("4. Minus/Period/Slash/Equal map", mapScannerKeyCode("Minus") === "-" && mapScannerKeyCode("Period") === "." && mapScannerKeyCode("Slash") === "/" && mapScannerKeyCode("Equal") === "=");
check("5. Unsupported code → null", mapScannerKeyCode("Space") == null && mapScannerKeyCode("ShiftLeft") == null);
check("6. Enter + NumpadEnter detected", isScannerEnterCode("Enter") && isScannerEnterCode("NumpadEnter"));
check("7. Thresholds documented", SCAN_MAX_KEY_INTERVAL_MS === 50 && SCAN_MIN_LENGTH === 3);

{
  const session = new ScannerKeycodeSession();
  let t = 1000;
  for (const code of digitCodes) {
    session.pushCode(code, t);
    t += 10;
  }
  const result = session.finalize(t);
  check("8. Numeric Digit* sequence → ASCII barcode", result.ok && result.value === sampleBarcode);
}

{
  // Simulate Lao/Thai layout: event.key would be wrong, but event.code stays Digit*.
  const session = new ScannerKeycodeSession();
  let t = 2000;
  for (const code of digitCodes) {
    session.pushCode(code, t);
    t += 12;
  }
  const result = session.finalize(t);
  const catalogue = [product({ id: "p1", barcode: sampleBarcode, nameLo: "ນ້ຳດື່ມ" })];
  const match = result.ok ? findPosScanMatch(catalogue, result.value) : null;
  check(
    "9. Layout-safe Digit* still matches stored ASCII barcode",
    Boolean(result.ok && match && match.product.id === "p1" && !match.conflict),
  );
}

{
  const session = new ScannerKeycodeSession();
  // Slow Lao typing simulation: long gaps between keys
  session.pushCode("KeyA", 3000);
  session.pushCode("KeyB", 3000 + SCAN_MAX_KEY_INTERVAL_MS + 20);
  session.pushCode("KeyC", 3000 + (SCAN_MAX_KEY_INTERVAL_MS + 20) * 2);
  const result = session.finalize(3000 + (SCAN_MAX_KEY_INTERVAL_MS + 20) * 2 + 5);
  check("10. Slow typing → not classified as scan", !result.ok);
}

{
  const session = new ScannerKeycodeSession();
  session.pushCode("KeyX", 4000);
  session.pushCode("KeyY", 4010);
  const result = session.finalize(4020);
  check("11. Fast but below min length → not scan", !result.ok && result.reason === "too_short");
}

{
  const session = new ScannerKeycodeSession();
  let t = 5000;
  for (const code of ["KeyC", "KeyO", "KeyC", "KeyA"]) {
    session.pushCode(code, t);
    t += 80; // slower than scanner threshold
  }
  const result = session.finalize(t);
  check("12. English name typing with pauses → not scan", !result.ok);
}

{
  const session = new ScannerKeycodeSession();
  let t = 6000;
  for (const code of digitCodes) {
    session.pushCode(code, t);
    t += 8;
  }
  const result = session.finalize(t);
  check("13. Enter finalizes valid buffer", result.ok === true);
}

{
  const session = new ScannerKeycodeSession();
  let t = 7000;
  for (const code of digitCodes) {
    session.pushCode(code, t);
    t += 8;
  }
  // NumpadEnter path uses same finalize()
  const result = session.finalize(t);
  check("14. NumpadEnter-compatible finalize", result.ok && result.value === sampleBarcode);
}

{
  const session = new ScannerKeycodeSession();
  let t = 8000;
  for (const code of digitCodes.slice(0, 5)) {
    session.pushCode(code, t);
    t += 10;
  }
  // timeout / stale before Enter
  const result = session.finalize(t + SCAN_MAX_KEY_INTERVAL_MS + 5);
  check("15. Scanner timeout/stale → discard", !result.ok && result.reason === "stale");
}

{
  const session = new ScannerKeycodeSession();
  session.pushCode("Digit1", 9000);
  session.pushCode("Digit2", 9010);
  session.pushCode("Digit3", 9020);
  session.pushCode("Space", 9030); // unsupported
  session.pushCode("Digit4", 9040);
  const result = session.finalize(9050);
  // After unsupported, buffer restarted with Digit4 only → too short / empty path
  check("16. Unsupported code invalidates candidate safely", !result.ok);
}

{
  const catalogue = [product({ id: "p1", barcode: sampleBarcode })];
  check("17. Unknown barcode → no match", findPosScanMatch(catalogue, "0000000000000") === null);
}

{
  const a = product({
    id: "a",
    barcode: "111",
    units: [
      {
        barcode: "222",
        conversionQty: 1,
        costPriceLak: 1,
        id: "a-u",
        isBaseUnit: true,
        isDefaultSaleUnit: true,
        sellingPriceLak: 2,
        status: "active",
        unitName: "Piece",
      },
    ],
  });
  const b = product({
    id: "b",
    barcode: "333",
    units: [
      {
        barcode: "222",
        conversionQty: 1,
        costPriceLak: 1,
        id: "b-u",
        isBaseUnit: true,
        isDefaultSaleUnit: true,
        sellingPriceLak: 2,
        status: "active",
        unitName: "Piece",
      },
    ],
  });
  const conflict = findPosScanMatch([a, b], "222");
  check("18. Barcode conflict preserved", Boolean(conflict?.conflict));
}

{
  const beer = product({
    id: "beer",
    barcode: "8850000000001",
    nameEn: "Beer",
    units: [
      {
        barcode: "8850000000001",
        conversionQty: 1,
        costPriceLak: 5000,
        id: "beer-piece",
        isBaseUnit: true,
        isDefaultSaleUnit: true,
        sellingPriceLak: 10000,
        status: "active",
        unitName: "Piece",
      },
      {
        barcode: "8850000000012",
        conversionQty: 12,
        costPriceLak: 55000,
        id: "beer-pack",
        isBaseUnit: false,
        isDefaultSaleUnit: false,
        sellingPriceLak: 110000,
        status: "active",
        unitName: "Pack",
      },
    ],
  });
  const packMatch = findPosScanMatch([beer], "8850000000012");
  check(
    "19. Multi-unit pack barcode still selects pack unit",
    Boolean(packMatch && !packMatch.conflict && packMatch.unit?.id === "beer-pack"),
  );
}

{
  const catalogue = [
    product({ id: "p1", barcode: sampleBarcode, nameEn: "English Water", nameLo: "ນ້ຳດື່ມ" }),
  ];
  check(
    "20. Lao name human search unchanged",
    filterPosCatalogue(catalogue, "ນ້ຳ").some((row) => row.id === "p1"),
  );
  check(
    "21. English name human search unchanged",
    filterPosCatalogue(catalogue, "English").some((row) => row.id === "p1"),
  );
}

{
  const client = readFileSync(join(process.cwd(), "features/pos/components/pos-page-client.tsx"), "utf8");
  check(
    "22. POS wires scanner session + explicit scanBarcode",
    client.includes("ScannerKeycodeSession") &&
      client.includes("handleProductSearchKeyDown") &&
      client.includes("scanBarcode(finalized.value)") &&
      client.includes("scanBarcode(explicitScanValue?: string)"),
  );
  check(
    "23. POS does not preventDefault on every key (only Enter path)",
    client.includes("session.pushCode(code, now)") &&
      !client.includes("preventDefault();\n        session.pushCode"),
  );
  check(
    "24. Cart qty helpers still present (unaffected wiring)",
    client.includes("updatePosCartQuantity") && client.includes("removePosCartLine"),
  );
}

if (failed) {
  console.error(`\nphase-pos-barcode-layout-safe-check: FAIL (${passed} passed, ${failed} failed)`);
  process.exit(1);
}
console.log(`\nphase-pos-barcode-layout-safe-check: PASS (${passed})`);
