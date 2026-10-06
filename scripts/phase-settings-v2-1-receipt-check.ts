/**
 * Settings V2.1 — Receipt & Printing enhancement (QA only).
 * Static + in-memory checks. No DB migration. No Production.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readSettingsUi } from "./settings-ui-sources";
import {
  DEFAULT_RECEIPT_LAYOUT,
  RECEIPT_LAYOUT_JSON_KEY,
  RECEIPT_PAPER_WIDTH_PX,
  parseReceiptLayoutPrefs,
  receiptFormFieldsFromLayout,
  receiptLayoutFromFormFields,
  withReceiptLayoutPrefs,
} from "../features/settings/receipt-layout";
import { receiptBusinessLogoSrc } from "../features/pos/receipt-branding";
import { resolveReceiptQrImage } from "../features/pos/receipt-qr";

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
const repo = read("features/settings/prisma-repository.ts");
const layout = read("features/settings/receipt-layout.ts");
const pos = read("features/pos/components/pos-page-client.tsx");
const posRepo = read("features/pos/prisma-repository.ts");
const page = read("app/(dashboard)/settings/[section]/page.tsx");

check("1. no migration files for receipt visibility", !layout.includes("prisma migrate") && layout.includes("RECEIPT_LAYOUT_JSON_KEY"));
check("2. layout stored in unitPricingDefaults JSON", repo.includes("withReceiptLayoutPrefs") && repo.includes("parseReceiptLayoutPrefs"));
check("3. white receipt paper preview", preview.includes('bg-white') && preview.includes("data-receipt-paper") && preview.includes("text-neutral-900"));
check("4. paper size 58/80 widths differ", RECEIPT_PAPER_WIDTH_PX["58mm"] < RECEIPT_PAPER_WIDTH_PX["80mm"]);
check("5. preview uses paper width", preview.includes("resolvePreviewPaperStyle") && preview.includes("data-receipt-paper-size"));
check("6. live show/hide company name", preview.includes("receiptShowCompanyName") && form.includes("showStoreNameOnReceipt"));
check("7. live show/hide branch", preview.includes("receiptShowBranchName") && form.includes("showBranchNameOnReceipt"));
check("8. contact visibility controls", form.includes("showAddressOnReceipt") && form.includes("showPhoneOnReceipt") && form.includes("showEmailOnReceipt"));
check("9. tax number visibility", form.includes("showTaxNumberOnReceipt") && preview.includes("receiptShowTaxNumber"));
check("10. cashier / receipt / datetime", form.includes("showCashierOnReceipt") && form.includes("showReceiptNumberOnReceipt") && form.includes("showDateTimeOnReceipt"));
check("11. header/footer visibility", form.includes("showHeaderOnReceipt") && form.includes("showFooterOnReceipt"));
check("12. logo uses receiptBusinessLogoSrc (not LogoContainer placeholder)", preview.includes("receiptBusinessLogoSrc") && !preview.includes("LogoContainer"));
check("13. logo src helper OFF", receiptBusinessLogoSrc(false, "https://cdn.example/logo.png") === null);
check("14. logo src helper ON", receiptBusinessLogoSrc(true, "https://cdn.example/logo.png") === "https://cdn.example/logo.png");
check("15. missing logo safe", receiptBusinessLogoSrc(true, null) === null);
check("16. QR preview wiring", preview.includes("previewQrImageUrl") && page.includes("getReceiptPreviewQrImageUrl") && form.includes("initialReceiptPreviewQrUrl"));
check(
  "17. QR print flag respected",
  resolveReceiptQrImage({
    account: { id: "a1", printOnReceipt: true, qrImageUrl: "https://cdn.example/qr.png" },
    referencedAccountId: "a1",
  }) === "https://cdn.example/qr.png" &&
    resolveReceiptQrImage({
      account: { id: "a1", printOnReceipt: false, qrImageUrl: "https://cdn.example/qr.png" },
      referencedAccountId: "a1",
    }) === null,
);
check("18. POS receipt respects visibility", pos.includes("receiptShowCompanyName") && pos.includes("receiptShowBranchName") && pos.includes("data-receipt-paper"));
check("19. POS paper white", pos.includes('bg-white') && pos.includes("data-receipt-paper-size"));
check("20. POS company name not hardcoded Business only", posRepo.includes("companyRow") && posRepo.includes("companyName") && !/companyName:\s*"Business"/.test(posRepo));
const receiptSection = readFileSync(join(root, "features/settings/components/receipt-settings-section.tsx"), "utf8");
check(
  "21. no duplicate company/branch editors in receipt section",
  receiptSection.includes("receiptVisibilityHelp") &&
    !receiptSection.includes('update("companyName"') &&
    !receiptSection.includes('update("profileAddress"') &&
    !receiptSection.includes('update("profilePhone"') &&
    !receiptSection.includes('update("profileEmail"') &&
    !receiptSection.includes('update("taxNumber"') &&
    !receiptSection.includes("BranchInformationPanel"),
);
check("22. receipt save includes layout fields", form.includes("receiptPaperSize: settings.receiptPaperSize") && form.includes("receiptShowCompanyName: settings.receiptShowCompanyName"));
check("23. EN strings", copy.includes('"receiptPaperSize": "Receipt Paper Layout"') && copy.includes('"showStoreNameOnReceipt"'));
check("24. LO strings", copy.includes('"receiptPaperSize": "ຮູບແບບເຈ້ຍໃບບິນ"') && copy.includes('"showStoreNameOnReceipt": "ສະແດງຊື່ຮ້ານ"'));

const defaults = parseReceiptLayoutPrefs(null);
check("25. defaults 80mm + all visible", defaults.paperSize === "80mm" && defaults.visibility.showCompanyName === true);

const off = receiptLayoutFromFormFields({
  receiptPaperSize: "58mm",
  receiptShowCompanyName: false,
  receiptShowBranchName: false,
  receiptShowAddress: false,
});
const packed = withReceiptLayoutPrefs({ units: {}, version: 1 }, off);
const roundTrip = parseReceiptLayoutPrefs(packed);
check("26. JSON round-trip 58mm + hide", roundTrip.paperSize === "58mm" && roundTrip.visibility.showCompanyName === false && (packed as any)[RECEIPT_LAYOUT_JSON_KEY]);
check("27. form fields from layout", receiptFormFieldsFromLayout(DEFAULT_RECEIPT_LAYOUT).receiptPaperSize === "80mm");
check("28. sample products in preview", preview.includes("Sample Product A") && preview.includes("Sample Product B"));
check("29. paper size radiogroup a11y", form.includes('role="radiogroup"') && form.includes("aria-checked"));
check("30. branch loaded for receipt section", page.includes('section === "receipt"') && page.includes("needsBranch"));

console.log(`\nReceipt V2.1 check: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
