import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  formatBusinessDateLabel,
  formatBusinessDateTimeLabel,
  formatBusinessMediumDateTime,
} from "../lib/datetime/business-timezone";

const PERIOD_START = "2026-08-28T17:00:00.000Z";
const GENERATED_AT = "2026-08-29T07:20:15.036Z";
const SHIFT_OPENED_AT = "2026-08-29T06:05:00.000Z";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const naiveUtcDate = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
}).format(new Date(PERIOD_START));
const naiveUtcLastUpdated = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
}).format(new Date(GENERATED_AT));

assert(naiveUtcDate === "28 Aug 2026", `UTC naive dashboard label changed: ${naiveUtcDate}`);
assert(formatBusinessDateLabel(PERIOD_START) === "29 Aug 2026", `business date label: ${formatBusinessDateLabel(PERIOD_START)}`);
assert(
  formatBusinessDateTimeLabel(SHIFT_OPENED_AT) === formatBusinessDateTimeLabel(new Date(SHIFT_OPENED_AT)),
  "shift open time must be timezone-stable",
);
assert(
  formatBusinessMediumDateTime(GENERATED_AT) !== naiveUtcLastUpdated,
  `reports last-updated must not follow Worker UTC (${naiveUtcLastUpdated})`,
);
assert(
  formatBusinessMediumDateTime(GENERATED_AT) === "29 Aug 2026, 14:20",
  `reports last-updated: ${formatBusinessMediumDateTime(GENERATED_AT)}`,
);

const root = process.cwd();
const quickStockIn = readFileSync(join(root, "features/inventory/components/quick-stock-in-form.tsx"), "utf8");
const reportsClient = readFileSync(join(root, "features/reports/components/reports-analytics-client.tsx"), "utf8");
const dashboardClient = readFileSync(join(root, "features/dashboard/components/dashboard-interactions-client.tsx"), "utf8");
const reportsPage = readFileSync(join(root, "app/(dashboard)/reports/page.tsx"), "utf8");

assert(!quickStockIn.includes("useState(generateClientStockInNo)"), "Quick Stock In still initializes stockInNo during render");
assert(quickStockIn.includes("setStockInNo((current) => current || generateClientStockInNo())"), "Quick Stock In must assign stockInNo after mount");
assert(!reportsClient.includes(".format(new Date())"), "Reports still formats Date.now() during render");
assert(reportsClient.includes("formatBusinessMediumDateTime(generatedAt"), "Reports must format the server snapshot timestamp");
assert(reportsPage.includes("generatedAt={new Date().toISOString()}"), "Reports page must pass a persisted generatedAt prop");
assert(dashboardClient.includes("formatBusinessDateLabel(value)"), "Dashboard date must use Asia/Vientiane formatter");
assert(dashboardClient.includes("formatBusinessDateTimeLabel(value)"), "Dashboard shift time must use Asia/Vientiane formatter");
assert(!dashboardClient.includes("suppressHydrationWarning"), "Dashboard must not hide the mismatch");
assert(!quickStockIn.includes("suppressHydrationWarning"), "Quick Stock In must not hide the mismatch");
assert(!reportsClient.includes("suppressHydrationWarning"), "Reports must not hide the mismatch");

console.log("FIX-13 hydration check PASS");
