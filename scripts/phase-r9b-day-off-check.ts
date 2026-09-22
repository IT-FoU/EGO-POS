/**
 * R9B Day Off — foundation + critical rules.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeRemainingQuota,
  countUsedQuotaDays,
  resolveConfiguredQuotaDays,
} from "../features/day-off/day-off-math";
import { STORE_ROLES, hasStorePermission, STORE_ACTIONS } from "../features/permissions/store-permissions";

const ROOT = process.cwd();
let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`PASS: ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function read(path: string) {
  return readFileSync(join(ROOT, path), "utf8");
}

const migration = read("prisma/migrations/20260922200000_add_staff_day_off/migration.sql");
const schema = read("prisma/schema.prisma");
const repo = read("features/day-off/prisma-repository.ts");
const attendanceRepo = read("features/attendance/prisma-repository.ts");
const cashRepo = read("features/cash-sessions/prisma-repository.ts");

check("1. Migration exists", existsSync("prisma/migrations/20260922200000_add_staff_day_off/migration.sql"));
check(
  "2. Four day-off tables",
  migration.includes("staff_weekly_day_offs") &&
    migration.includes("staff_day_off_quota_policies") &&
    migration.includes("staff_day_off_months") &&
    migration.includes("staff_day_off_requests"),
);
check(
  "3. Attendance alteration only day_off fields",
  migration.includes('ADD COLUMN "day_off_kind"') &&
    migration.includes('ADD COLUMN "day_off_request_id"') &&
    !/ALTER TABLE "cash_sessions"/i.test(migration) &&
    !/ALTER TABLE "sales"/i.test(migration),
);
check(
  "4. No OT/payroll/cron/backfill",
  !/\bot_\w+|payroll|CREATE.*CRON|backfill/i.test(migration.replace(/--.*$/gm, "")),
);
check(
  "5. Partial uniques pending/approved",
  migration.includes("staff_day_off_requests_one_pending_per_date_key") &&
    migration.includes("staff_day_off_requests_one_approved_per_date_key"),
);
check(
  "6. Quota math remaining never below zero",
  computeRemainingQuota(2, 5) === 0 && computeRemainingQuota(2, 1) === 1,
);
check(
  "7. Used counts consumed not returned",
  countUsedQuotaDays([
    { kind: "quota", status: "approved", quotaConsumed: true, quotaReturned: false },
    { kind: "quota", status: "approved", quotaConsumed: true, quotaReturned: true },
    { kind: "special", status: "approved", quotaConsumed: false, quotaReturned: false },
  ]) === 1,
);
check(
  "8. Policy resolve override → default → 0",
  resolveConfiguredQuotaDays({ companyDefault: 2, employeeOverride: 3 }) === 3 &&
    resolveConfiguredQuotaDays({ companyDefault: 2, employeeOverride: null }) === 2 &&
    resolveConfiguredQuotaDays({ companyDefault: null, employeeOverride: null }) === 0,
);
check(
  "9. Read-only quota does not create snapshot",
  (() => {
    const start = repo.indexOf("export async function getQuotaSummaryReadOnly");
    const end = repo.indexOf("/** Write path");
    const slice = repo.slice(start, end > start ? end : start + 800);
    return slice.includes("getQuotaSummaryReadOnly") && !slice.includes("ensureMonthSnapshotInTx");
  })(),
);
check(
  "10. Snapshot only on write paths",
  repo.includes("createEmployeeQuotaRequest") &&
    repo.includes("ensureMonthSnapshotInTx") &&
    repo.includes("approveDayOffRequest"),
);
check(
  "11. Employee cannot cancel approved (message)",
  repo.includes("Employees cannot cancel an approved Day Off."),
);
check(
  "12. Weekly blocks quota approval",
  repo.includes("This date is already a Weekly Day Off."),
);
check(
  "13. Start Work applies day off without blocking",
  attendanceRepo.includes("applyDayOffOnStartWorkInTx") &&
    cashRepo.includes("createOpenAttendanceInTx") &&
    cashRepo.includes("assertOpenAttendanceForSale"),
);
check(
  "14. Sale gate still cash + attendance",
  cashRepo.includes("assertOpenCashSessionForSale") && cashRepo.includes("assertOpenAttendanceForSale"),
);
check(
  "15. My Day Off + Approvals + Settings surfaces",
  existsSync("features/pos/components/my-day-off-modal.tsx") &&
    existsSync("app/(dashboard)/staff/day-off/page.tsx") &&
    existsSync("features/day-off/components/day-off-settings-panel.tsx"),
);
check(
  "16. Prisma models present",
  schema.includes("model StaffWeeklyDayOff") &&
    schema.includes("model StaffDayOffQuotaPolicy") &&
    schema.includes("model StaffDayOffMonth") &&
    schema.includes("model StaffDayOffRequest") &&
    schema.includes("dayOffKind"),
);
check("17. Owner has staff.manage", hasStorePermission(STORE_ROLES.OWNER, STORE_ACTIONS.STAFF_MANAGE));
check("18. Manager has staff.manage", hasStorePermission(STORE_ROLES.MANAGER, STORE_ACTIONS.STAFF_MANAGE));
check("19. Cashier lacks staff.manage", !hasStorePermission(STORE_ROLES.CASHIER, STORE_ACTIONS.STAFF_MANAGE));
check(
  "20. Quota return once fields",
  repo.includes("quotaReturned = true") || repo.includes("quotaReturned: true") || repo.includes("patch.quotaReturned = true"),
);

console.log(`\nR9B day-off: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
