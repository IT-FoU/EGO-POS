/**
 * Receipt Show QR layout toggle. Static + pure. No database. No Production.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseReceiptLayoutPrefs, receiptLayoutFromFormFields, withReceiptLayoutPrefs } from "../features/settings/receipt-layout";
import { resolveReceiptQrImage, visibleReceiptQrImage } from "../features/pos/receipt-qr";

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

const form = read("features/settings/components/settings-form.tsx");
const preview = read("features/settings/components/receipt-settings-preview.tsx");
const pos = read("features/pos/components/pos-page-client.tsx");
const copy = read("lib/i18n/settings-copy.ts");
const reprint = read("features/pos/post-sale-repository.ts");
const posRepo = read("features/pos/prisma-repository.ts");
const account = { id: "a1", printOnReceipt: true, qrImageUrl: "https://cdn.example/qr.png" };

check("1. toggle label wired", form.includes('tSettings("showQrOnReceipt"') && form.includes("receiptShowQr") && form.includes('describedBy="receipt-show-qr-help"'));
check("2. save persists show QR", form.includes("receiptShowQr: settings.receiptShowQr"));
check("3. preview uses shared visibility helper", preview.includes("visibleReceiptQrImage"));
check("4. print and reprint share the helper", pos.includes("visibleReceiptQrImage(receiptQrImageUrl, receiptSettings.receiptShowQr)") && posRepo.includes("receiptShowQr: receiptLayout.receiptShowQr"));
check("5. no new QR uploader in receipt section", !form.includes("qr image upload") && form.includes('href="/settings/qr-payments"'));
check("6. EN and LO labels", copy.includes('"showQrOnReceipt": "Show QR on Receipt"') && copy.includes('"showQrOnReceipt": "ສະແດງ QR ໃນໃບບິນ"'));
check("7. empty-state copy", copy.includes("No eligible QR account") && copy.includes("ຍັງບໍ່ມີບັນຊີ QR"));
check("8. reprint stays on the sale branch and active account", reprint.includes("branchId: sale.branchId") && reprint.includes("isActive: true"));
check("9. account print flag still required", resolveReceiptQrImage({ account: { ...account, printOnReceipt: false }, referencedAccountId: "a1" }) === null);
check("10. eligible account still resolves", resolveReceiptQrImage({ account, referencedAccountId: "a1" }) === account.qrImageUrl);
check("11. layout OFF hides resolved QR", visibleReceiptQrImage(account.qrImageUrl, false) === null);
check("12. layout ON shows resolved QR", visibleReceiptQrImage(account.qrImageUrl, true) === account.qrImageUrl);
check("13. missing layout flag stays visible", visibleReceiptQrImage(account.qrImageUrl, undefined) === account.qrImageUrl);
check("14. stored layouts without showQr default ON", parseReceiptLayoutPrefs({ __receiptLayout: { paperSize: "80mm", visibility: { showCompanyName: true } } }).visibility.showQr === true);
check("15. explicit OFF round-trips", (() => {
  const layout = receiptLayoutFromFormFields({ receiptPaperSize: "58mm", receiptShowQr: false });
  return parseReceiptLayoutPrefs(withReceiptLayoutPrefs({}, layout)).visibility.showQr === false;
})());
check("16. thermal and document QR classes", preview.includes("max-h-20 max-w-20") && preview.includes("max-h-28 max-w-28") && preview.includes("object-contain"));

console.log(`\nReceipt QR visibility check: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
