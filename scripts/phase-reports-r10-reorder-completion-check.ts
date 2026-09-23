/**
 * REPORTS R10 — Reorder Completion (Suggested Qty, History, Bulk Settings, Inventory nav).
 * Static math + marker checks only. Does NOT touch Production.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  effectiveStockBase,
  remainingOpenPoQtyBase,
  REORDER_TABS,
  suggestedPurchaseQtyFromBase,
  suggestedQtyBase,
} from "../features/reports/reorder-report-math";
import { parseReorderTableQuery } from "../features/reports/reorder-report-query";
import {
  inventoryCopyHasNoReplacementChars,
  inventoryCopyKeyParity,
  tInventory,
} from "../lib/i18n/inventory-copy";
import {
  reportsCopyHasNoReplacementChars,
  reportsCopyKeyParity,
  tReports,
} from "../lib/i18n/reports-copy";

const ROOT = process.cwd();
const thaiScript = /[\u0E00-\u0E7F]/;

function read(relativePath: string) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

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

const r10ReportKeys = [
  "history",
  "suggestedQtyBase",
  "colTargetStock",
  "qtyMode",
  "emptyHistoryTable",
  "printA4",
  "downloadPdf",
  "deviceShare",
  "shareNotSupported",
  "availableAtOrder",
  "livePoStatus",
  "liveReceivedQty",
];

const r10InventoryKeys = [
  "reorder",
  "reorderSettings",
  "reorderSettingsSubtitle",
  "missingReorderLevel",
  "missingTargetStock",
  "applyToSelected",
];

check("1. EN/LO reports copy key parity", reportsCopyKeyParity());
check("2. Lao reports copy has no replacement chars", reportsCopyHasNoReplacementChars());
check("3. EN/LO inventory copy key parity", inventoryCopyKeyParity());
check("4. Lao inventory copy has no replacement chars", inventoryCopyHasNoReplacementChars());
check(
  "5. R10 reports EN/LO keys present",
  r10ReportKeys.every((key) => Boolean(tReports(key, "en")) && Boolean(tReports(key, "lo"))),
);
check(
  "6. R10 reports Lao keys use Lao script (no Thai)",
  r10ReportKeys.every((key) => !thaiScript.test(tReports(key, "lo"))),
);
check(
  "7. R10 inventory EN/LO keys present",
  r10InventoryKeys.every((key) => Boolean(tInventory(key, "en")) && Boolean(tInventory(key, "lo"))),
);

const stackFiles = [
  "features/reports/reorder-report-math.ts",
  "features/reports/reorder-report-repository.ts",
  "features/reports/components/reorder-report-views.tsx",
  "features/inventory/components/reorder-settings-client.tsx",
  "app/(dashboard)/inventory/reorder/page.tsx",
  "app/(dashboard)/inventory/reorder-settings/page.tsx",
  "app/api/products/bulk-reorder-settings/route.ts",
  "prisma/migrations/20260923030000_r10_reorder_settings_history/migration.sql",
];
check(
  "8. R10 stack files exist",
  stackFiles.every((path) => existsSync(join(ROOT, path))),
);

check("9. REORDER_TABS includes history", REORDER_TABS.join(",") === "need,already,history");
check("10. Query parser accepts history", parseReorderTableQuery({ tab: "history" }).tab === "history");

check(
  "11. Effective Stock = Available + open PO remaining",
  effectiveStockBase({ available: 3, openPoRemainingBase: 7 }) === 10,
);
check(
  "12. Remaining open PO base uses conversion",
  remainingOpenPoQtyBase({ conversionQty: 12, orderedQty: 2, receivedQty: 1 }) === 12,
);
check(
  "13. AUTO suggested = max(target − effective, 0)",
  suggestedQtyBase({ available: 4, openPoRemainingBase: 0, reorderQtyMode: "AUTO", targetStock: 20 }) === 16,
);
check(
  "14. AUTO suggested zero when at/above target",
  suggestedQtyBase({ available: 20, openPoRemainingBase: 0, reorderQtyMode: "AUTO", targetStock: 20 }) === 0,
);
check(
  "15. MANUAL suggested always 0",
  suggestedQtyBase({ available: 0, openPoRemainingBase: 0, reorderQtyMode: "MANUAL", targetStock: 50 }) === 0,
);
check(
  "16. Purchase qty rounds UP from base",
  suggestedPurchaseQtyFromBase(25, 12) === 3 && suggestedPurchaseQtyFromBase(24, 12) === 2,
);
check("17. Purchase qty zero when suggested base 0", suggestedPurchaseQtyFromBase(0, 12) === 0);

const repo = read("features/reports/reorder-report-repository.ts");
const views = read("features/reports/components/reorder-report-views.tsx");
const math = read("features/reports/reorder-report-math.ts");

check(
  "18. Repository writes ReorderHistorySnapshot on Create PO",
  repo.includes("reorderHistorySnapshot.createMany") && repo.includes("suggestedQtyBase"),
);
check(
  "19. Need rows keep openPoRemainingBase at 0 (active PO exclusion)",
  repo.includes("openPoRemainingBase = 0") || repo.includes("openPoRemainingBase: 0"),
);
check(
  "20. No auto-create PO language in math note",
  math.includes("Do not reintroduce active-PO products into Need"),
);
check(
  "21. Views prefill via suggestedPurchaseQtyFromBase",
  views.includes("suggestedPurchaseQtyFromBase") && views.includes('reorderQtyMode !== "AUTO"'),
);
check(
  "22. Views History tab + print/share markers",
  views.includes('tab: "history"') &&
    views.includes("printA4") &&
    views.includes("downloadPdf") &&
    views.includes("deviceShare") &&
    views.includes("navigator.share"),
);
check(
  "23. Inventory reorder redirects to reports",
  read("app/(dashboard)/inventory/reorder/page.tsx").includes("/reports/inventory/reorder"),
);
check(
  "24. Inventory page links to /inventory/reorder",
  read("features/inventory/components/inventory-page-client.tsx").includes("/inventory/reorder"),
);
check(
  "25. Bulk settings uses productsUpdate",
  read("app/api/products/bulk-reorder-settings/route.ts").includes("productsUpdate") &&
    read("features/products/prisma-repository.ts").includes("bulkUpdatePrismaReorderSettings"),
);
check(
  "26. Migration has target_stock + reorder_history_snapshots",
  read("prisma/migrations/20260923030000_r10_reorder_settings_history/migration.sql").includes("target_stock") &&
    read("prisma/migrations/20260923030000_r10_reorder_settings_history/migration.sql").includes(
      "reorder_history_snapshots",
    ),
);
check(
  "27. CreateReorderPoLine accepts snapshot metadata",
  repo.includes("suggestedQtyBase?:") && repo.includes("reorderLevel?:") && repo.includes("purchaseUnitName?:"),
);

console.log(`\nR10 result: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
