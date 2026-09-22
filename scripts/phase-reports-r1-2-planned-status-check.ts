/**
 * REPORTS R1.2 — Planned status clarification.
 * Marks Owner-verified missing reports as Planned and stops misleading reuse.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canViewFullStoreReports } from "../features/permissions/store-ui-permissions";
import {
  REPORT_CENTER_ENTRIES,
  REPORT_CENTER_PLANNED_HREFS,
  findReportCenterEntryByHref,
  isPlannedReportCenterEntry,
} from "../features/reports/report-center-catalog";
import {
  reportsCopyHasNoReplacementChars,
  reportsCopyKeyParity,
  tReports,
} from "../lib/i18n/reports-copy";
import { CASH_SESSION_SALE_STATUSES } from "../features/pos/post-sale-shared";

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

const plannedIds: string[] = [];
const availableIds = REPORT_CENTER_ENTRIES.filter((entry) => !plannedIds.includes(entry.id)).map((entry) => entry.id);
const centerClient = read("features/reports/components/report-center-client.tsx");
const salesCatchAll = read("app/(dashboard)/reports/sales/[report]/page.tsx");
const productsCatchAll = read("app/(dashboard)/reports/products/[report]/page.tsx");
const inventoryCatchAll = read("app/(dashboard)/reports/inventory/[report]/page.tsx");
const genericSales = read("app/(dashboard)/reports/sales/page.tsx");
const genericProducts = read("app/(dashboard)/reports/products/page.tsx");
const genericInventory = read("app/(dashboard)/reports/inventory/page.tsx");
const shell = read("features/reports/components/report-page-shell.tsx");
const calculator = read("features/cash-sessions/cash-session-calculator.ts");

check("1. No remaining Planned reports", REPORT_CENTER_PLANNED_HREFS.length === 0 && plannedIds.every((id) => REPORT_CENTER_ENTRIES.some((entry) => entry.id === id && entry.planned)));
check(
  "2. Planned hrefs stay dedicated",
  REPORT_CENTER_PLANNED_HREFS.length === 0,
);
check(
  "3. Center badge uses Planned helper for any remaining planned entries",
  centerClient.includes('tReports("planned"') &&
    centerClient.includes("isPlannedReportCenterEntry") &&
    centerClient.includes('tReports("reportReady"') &&
    !/available = Boolean\(entry.reuse\)/.test(centerClient),
);
check(
  "4. Available reports are not Planned",
  availableIds.length === 16 &&
    availableIds.every((id) => {
      const entry = REPORT_CENTER_ENTRIES.find((row) => row.id === id);
      return Boolean(entry && !isPlannedReportCenterEntry(entry));
    }),
);
check(
  "5. Catch-alls render planned shell, not generic redirects or payment snapshot",
  salesCatchAll.includes("ReportComingSoon") &&
    productsCatchAll.includes("ReportComingSoon") &&
    inventoryCatchAll.includes("ReportComingSoon") &&
    !salesCatchAll.includes("redirect(") &&
    !productsCatchAll.includes("redirect(") &&
    !inventoryCatchAll.includes("redirect(") &&
    !salesCatchAll.includes("hub.paymentBreakdown") &&
    !salesCatchAll.includes("getReportsSnapshot"),
);
check(
  "6. Generic sales/products/inventory pages remain",
  genericSales.includes("getReportsSnapshot") &&
    genericProducts.includes("getReportsSnapshot") &&
    genericInventory.includes("getReportsSnapshot") &&
    genericSales.includes("ReportDetailNav"),
);
check(
  "7. Planned shell still has Back, title, chips, empty copy, no fake rows",
  shell.includes("comingSoonTable") &&
    shell.includes("ReportPlannedChips") &&
    shell.includes("backToReports") &&
    !shell.includes("fake") &&
    !salesCatchAll.includes("formatLak"),
);
check(
  "8. EN/LO Planned vs Available",
  reportsCopyKeyParity() &&
    reportsCopyHasNoReplacementChars() &&
    tReports("planned", "en") === "Planned" &&
    tReports("planned", "lo") === "ວາງແຜນໄວ້" &&
    tReports("reportReady", "en") === "Available" &&
    tReports("reportReady", "lo") !== tReports("reportReady", "en") &&
    !thaiScript.test(tReports("planned", "lo")),
);
check("9. Permissions unchanged", canViewFullStoreReports("owner") && !canViewFullStoreReports("cashier"));
check(
  "10. Batch H cash refund KPI unchanged",
  CASH_SESSION_SALE_STATUSES.includes("refunded") && calculator.includes("computeCashRefundLak"),
);

if (failed) {
  console.error(`\nphase-reports-r1-2-planned-status-check: FAIL (${passed} passed, ${failed} failed)`);
  process.exit(1);
}

console.log(`\nphase-reports-r1-2-planned-status-check: PASS (${passed})`);
