/**
 * Settings V2.1 — Receipt paper size extension (58/80/A5/A4/Custom).
 * Static + in-memory. No DB migration. No Production.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readSettingsUi } from "./settings-ui-sources";
import {
  DEFAULT_RECEIPT_LAYOUT,
  RECEIPT_LAYOUT_JSON_KEY,
  RECEIPT_PAPER_WIDTH_PX,
  asPaperSize,
  isDocumentPaperSize,
  isThermalPaperSize,
  parseReceiptLayoutPrefs,
  receiptFormFieldsFromLayout,
  receiptLayoutFromFormFields,
  resolvePaperDimensionsMm,
  resolvePreviewPaperStyle,
  resolvePrintPageSizeCss,
  validateCustomPaperDimensions,
  withReceiptLayoutPrefs,
} from "../features/settings/receipt-layout";

const root = process.cwd();
let failed = 0;
let passed = 0;

function check(label: string, ok: boolean) {
  if (!ok) {
    failed += 1;
    console.error(`FAIL: ${label}`);
    return;
  }
  passed += 1;
  console.log(`PASS: ${label}`);
}

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

const preview = read("features/settings/components/receipt-settings-preview.tsx");
const form = readSettingsUi(root);
const copy = read("lib/i18n/settings-copy.ts");
const layout = read("features/settings/receipt-layout.ts");
const pos = read("features/pos/components/pos-page-client.tsx");

check("1. no migration for paper extension", layout.includes("RECEIPT_LAYOUT_JSON_KEY") && !layout.includes("prisma migrate"));
check("2. paper options include A5/A4/Custom", layout.includes('"a5"') && layout.includes('"a4"') && layout.includes('"custom"'));
check("3. 58/80 remain thermal", isThermalPaperSize("58mm") && isThermalPaperSize("80mm") && !isDocumentPaperSize("58mm"));
check("4. A5/A4/custom are document", isDocumentPaperSize("a5") && isDocumentPaperSize("a4") && isDocumentPaperSize("custom"));
check("5. A5 dimensions 148x210", (() => {
  const d = resolvePaperDimensionsMm("a5");
  return d.widthMm === 148 && d.heightMm === 210 && !d.continuous;
})());
check("6. A4 dimensions 210x297", (() => {
  const d = resolvePaperDimensionsMm("a4");
  return d.widthMm === 210 && d.heightMm === 297 && !d.continuous;
})());
check("7. thermal widths differ", RECEIPT_PAPER_WIDTH_PX["58mm"] < RECEIPT_PAPER_WIDTH_PX["80mm"]);
check("8. preview uses document layout attribute", preview.includes('data-receipt-paper-layout={documentLayout ? "document" : "thermal"}'));
check("9. document table columns", preview.includes("receiptColItem") && preview.includes("receiptColQty") && preview.includes("receiptColUnitPrice"));
check("10. A4 not thermal-only", preview.includes("isDocumentPaperSize") && form.includes("receiptPaperSizeA4"));
check("11. Custom inputs in form", form.includes("receiptCustomWidth") && form.includes("receiptCustomHeight") && form.includes('receiptPaperSize === "custom"'));
check("12. custom validation rejects zero", validateCustomPaperDimensions(0, 100).ok === false);
check("13. custom validation rejects negative", validateCustomPaperDimensions(-10, 100).ok === false);
check("14. custom validation rejects empty", validateCustomPaperDimensions("", 100).ok === false && validateCustomPaperDimensions(100, "").ok === false);
check("15. custom validation accepts valid", (() => {
  const r = validateCustomPaperDimensions(120, 180);
  return r.ok === true && r.widthMm === 120 && r.heightMm === 180;
})());
check("16. live preview helpers", preview.includes("resolvePreviewPaperStyle") && form.includes("RECEIPT_PAPER_SIZE_OPTIONS"));
check("17. print CSS helper", resolvePrintPageSizeCss("a4") === "A4" && resolvePrintPageSizeCss("a5") === "A5" && resolvePrintPageSizeCss("58mm") === "58mm auto");
check("18. custom print CSS", resolvePrintPageSizeCss("custom", 110, 160) === "110mm 160mm");
check("19. POS uses document + @page", pos.includes("resolvePrintPageSizeCss") && pos.includes("@page") && pos.includes("isDocumentPaperSize"));
check("20. backward compat 58/80 parse", asPaperSize("58mm") === "58mm" && asPaperSize("80mm") === "80mm" && asPaperSize("unknown") === "80mm");
check("21. old JSON without custom dims still loads", (() => {
  const packed = {
    [RECEIPT_LAYOUT_JSON_KEY]: { paperSize: "58mm", visibility: { showCompanyName: false } },
  };
  const parsed = parseReceiptLayoutPrefs(packed);
  return parsed.paperSize === "58mm" && parsed.visibility.showCompanyName === false && parsed.customWidthMm > 0;
})());
check("22. round-trip custom", (() => {
  const layoutPrefs = receiptLayoutFromFormFields({
    receiptPaperSize: "custom",
    receiptCustomWidthMm: 105,
    receiptCustomHeightMm: 148,
    receiptShowCompanyName: true,
  });
  const packed = withReceiptLayoutPrefs({}, layoutPrefs);
  const round = parseReceiptLayoutPrefs(packed);
  return round.paperSize === "custom" && round.customWidthMm === 105 && round.customHeightMm === 148;
})());
check("23. form fields include custom mm", receiptFormFieldsFromLayout(DEFAULT_RECEIPT_LAYOUT).receiptCustomWidthMm === DEFAULT_RECEIPT_LAYOUT.customWidthMm);
check("24. preview white paper", preview.includes("bg-white") && preview.includes("data-receipt-paper"));
check("25. EN strings", copy.includes('"receiptPaperSizeA5": "A5"') && copy.includes('"receiptPaperSizeCustom": "Custom"') && copy.includes('"receiptCustomWidthRequired"'));
check("26. LO strings", copy.includes('"receiptPaperSizeCustom": "ກຳນົດເອງ"') && copy.includes('"receiptCustomWidth": "ຄວາມກວ້າງ"'));
check("27. save includes custom dims", form.includes("receiptCustomWidthMm: settings.receiptCustomWidthMm") && form.includes("receiptCustomHeightMm: settings.receiptCustomHeightMm"));
check("28. A5 preview taller than wide aspect", (() => {
  const box = resolvePreviewPaperStyle("a5");
  return typeof box.heightPx === "number" && box.heightPx > box.widthPx;
})());
check("29. A4 preview taller than A5 at same max", (() => {
  const a5 = resolvePreviewPaperStyle("a5");
  const a4 = resolvePreviewPaperStyle("a4");
  return typeof a5.heightPx === "number" && typeof a4.heightPx === "number" && a4.heightPx > a5.heightPx;
})());
check("30. validate on save path", form.includes("validateCustomPaperDimensions"));

console.log(`\nReceipt paper-size extension check: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
