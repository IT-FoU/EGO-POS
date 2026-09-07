import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getInventoryCopy, tInventory } from "../lib/i18n/inventory-copy";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const results: Array<{ detail: string; name: string; ok: boolean }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const en = getInventoryCopy("en");
const lo = getInventoryCopy("lo");
const pageClient = readFileSync(
  resolve(process.cwd(), "features/inventory/components/inventory-page-client.tsx"),
  "utf8",
);
const purchasingNew = readFileSync(resolve(process.cwd(), "app/(dashboard)/purchasing/new/page.tsx"), "utf8");
const purchasingReceiving = readFileSync(
  resolve(process.cwd(), "app/(dashboard)/purchasing/receiving/page.tsx"),
  "utf8",
);
const shell = readFileSync(resolve(process.cwd(), "components/layout/dashboard-shell.tsx"), "utf8");
const inventoryCopy = readFileSync(resolve(process.cwd(), "lib/i18n/inventory-copy.ts"), "utf8");

const approvedLo = "ຮັບເຂົ້າສາງດ່ວນ";
const rejectedLo = "ຮັບສາງດ່ວນ";
const headerQuickStockIn =
  /className="inline-flex h-12[\s\S]*?href="\/inventory\/quick-stock-in"[\s\S]*?t\("quickStockIn"\)/;
const headerCount =
  /className="inline-flex h-12[\s\S]*?href="\/inventory\/count"[\s\S]*?t\("count"\)/;

check(
  "A. Top duplicate Quick Stock In and Count buttons are gone",
  !headerQuickStockIn.test(pageClient) &&
    !headerCount.test(pageClient) &&
    !pageClient.includes('t("count")') &&
    pageClient.includes("WarehouseSelector"),
);

check(
  "B. Lower action row remains with the same five destinations",
  pageClient.includes('href="/inventory/quick-stock-in"') &&
    pageClient.includes('t("quickStockIn")') &&
    pageClient.includes('href="/inventory/count"') &&
    pageClient.includes('t("stockCount")') &&
    pageClient.includes('href="/inventory/adjustment"') &&
    pageClient.includes('t("adjustment")') &&
    pageClient.includes('href="/purchasing/new"') &&
    pageClient.includes('t("purchaseOrder")') &&
    pageClient.includes('href="/purchasing/receiving"') &&
    pageClient.includes('t("goodsReceiving")') &&
    (pageClient.match(/href="\/inventory\/quick-stock-in"/g) || []).length === 1 &&
    (pageClient.match(/href="\/inventory\/count"/g) || []).length === 1,
);

check(
  "C. Lao Quick Stock In copy is exactly the approved wording",
  lo.quickStockIn === approvedLo &&
    tInventory("quickStockIn", "lo") === approvedLo &&
    lo.movementQuickStockIn === approvedLo &&
    !lo.quickStockInFailed.includes(rejectedLo) &&
    !lo.quickStockInSaved.includes(rejectedLo) &&
    !lo.quickStockInSubtitle.includes(rejectedLo) &&
    !lo.noQuickStockInToday.includes(rejectedLo) &&
    !lo.movementHistoryHint.includes(rejectedLo) &&
    !lo.todaysStockInHint.includes(rejectedLo) &&
    !inventoryCopy.includes(rejectedLo),
);

check(
  "D. English Quick Stock In is unchanged",
  en.quickStockIn === "Quick Stock In" &&
    tInventory("quickStockIn", "en") === "Quick Stock In" &&
    tInventory("quickStockIn", "th") === "Quick Stock In" &&
    en.movementQuickStockIn === "Quick Stock In",
);

check(
  "E. Purchasing destination behavior remains unchanged",
  pageClient.includes('href="/purchasing/new"') &&
    pageClient.includes('href="/purchasing/receiving"') &&
    !purchasingNew.includes("inventory-copy") &&
    !purchasingReceiving.includes("inventory-copy") &&
    (shell.includes('purchasing: "Purchasing"') || shell.includes('tPurchasing("purchasing"')) &&
    !shell.includes("tInventory(\"purchaseOrder\""),
);

const failed = results.filter((result) => !result.ok);
console.log(
  `\nLAO PHASE 04 Inventory repair: ${results.length - failed.length}/${results.length} PASS${failed.length ? ` (${failed.length} FAIL)` : ""}`,
);
if (failed.length) {
  process.exit(1);
}

assert(results.length >= 5, "expected focused Inventory repair checks");
