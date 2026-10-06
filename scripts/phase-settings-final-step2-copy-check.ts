/**
 * Settings finalization step 2 — copy and source-of-truth wording.
 * Static only: no database, network, deployment, or production access.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { settingsCopyKeyParity, tSettings } from "../lib/i18n/settings-copy";

const root = process.cwd();
let passed = 0;
let failed = 0;
const read = (path: string) => readFileSync(join(root, path), "utf8");
const check = (label: string, ok: boolean) => {
  if (ok) {
    passed += 1;
    console.log(`PASS: ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL: ${label}`);
  }
};

const landing = read("features/settings/components/settings-landing.tsx");
const form = read("features/settings/components/settings-form.tsx");
const loyaltyPanel = read("features/settings/components/loyalty-rules-panel.tsx");
const printMode = read("features/settings/receipt-print-mode.ts");
const repo = read("features/settings/prisma-repository.ts");

check(
  "1. search no longer says tickets are unavailable",
  landing.includes("can submit a support ticket when your role allows it") &&
    landing.includes("ເມື່ອບົດບາດອະນຸຍາດ") &&
    !landing.includes("not available yet") &&
    !landing.includes("ຍັງບໍ່ສາມາດສົ່ງບັດສະໜັບສະໜູນ"),
);
check(
  "2. print mode says this browser and another cashier computer",
  tSettings("printBehaviorThisBrowser", "en").includes("this browser") &&
    tSettings("printBehaviorThisBrowser", "en").includes("Another cashier computer") &&
    tSettings("printBehaviorThisBrowser", "lo").includes("ບຣາວເຊີນີ້") &&
    form.includes("printBehaviorThisBrowser") &&
    form.includes("scopeThisDevice") &&
    landing.includes("This browser"),
);
check(
  "3. paper layout does not imply a printer device",
  tSettings("receiptPaperSize", "en") === "Receipt Paper Layout" &&
    tSettings("receiptPaperSize", "lo") === "ຮູບແບບເຈ້ຍໃບບິນ" &&
    tSettings("receiptPaperSizeHelp", "en").includes("does not choose a printer device") &&
    tSettings("receiptPaperSizeHelp", "lo").includes("ບໍ່ເລືອກເຄື່ອງພິມ") &&
    landing.includes("There is no printer device setting") &&
    !tSettings("receiptPaperSize", "en").toLowerCase().includes("printer"),
);
check(
  "4. currency copy says store POS stays on LAK",
  landing.includes("Store POS currently operates in LAK") &&
    landing.includes("are not store settings") &&
    !landing.includes("baseCurrency") &&
    !form.includes('update("baseCurrency"') &&
    !form.includes('update("decimalPlaces"') &&
    !form.includes('update("roundingMethod"'),
);
check(
  "5. notifications copy says alerts are automatic",
  landing.includes("System alerts are automatic") &&
    landing.includes("no category mute controls") &&
    !landing.includes('href: "/settings/notifications"'),
);
check(
  "6. loyalty copy points at Earning Rules",
  tSettings("loyaltyHelp", "en").includes("Earning Rules") &&
    tSettings("loyaltyStackHelp", "en").includes("only place that sets how points are earned") &&
    tSettings("spendRuleHelp", "lo").includes("ກົດນີ້") &&
    loyaltyPanel.includes("spendRuleHelp") &&
    loyaltyPanel.includes("earningRules") &&
    !form.includes("loyaltySpendPerPointLak"),
);
check("7. EN/LO key parity", settingsCopyKeyParity());
check(
  "8. print mode runtime still prefers this browser and keeps the DB fallback",
  printMode.includes("ego-pos:receipt-print-mode") &&
    form.includes("writeReceiptPrintModePreference(printMode)") &&
    repo.includes("receiptPrintMode: _devicePrintMode"),
);

console.log(`\nSettings step 2 copy: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
