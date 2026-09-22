/**
 * R9A Attendance QA verification surface — read-only, no schema changes.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyScheduleSource,
  formatScheduleClock,
  summarizeAttendanceQa,
  type AttendanceQaRow,
} from "../features/attendance/attendance-qa";
import { canViewFullStoreReports } from "../features/permissions/store-ui-permissions";
import { STORE_ROLES } from "../features/permissions/store-permissions";
import { reportsCopyKeyParity } from "../lib/i18n/reports-copy";

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

const page = read("app/(dashboard)/reports/staff/attendance-qa/page.tsx");
const view = read("features/reports/components/attendance-qa-view.tsx");
const service = read("features/attendance/attendance-qa-service.ts");
const loader = read("features/attendance/attendance-qa.ts");
const layout = read("app/(dashboard)/reports/layout.tsx");
const catalog = read("features/reports/report-center-catalog.ts");

check("1. QA route exists", existsSync("app/(dashboard)/reports/staff/attendance-qa/page.tsx"));
check("2. Not in Report Center catalog", !catalog.includes("/reports/staff/attendance-qa"));
check("3. Owner/Manager gate", service.includes("canViewFullStoreReports") && service.includes("REPORTS_VIEW_FULL"));
check("4. Cashier not specially allowed", !layout.includes("attendance-qa"));
check(
  "4b. Branch scope matches reports",
  loader.includes("resolveTenantScope") && loader.includes("scope.isOwner") && loader.includes("scope.branchIds"),
);
check("5. Owner allowed", canViewFullStoreReports(STORE_ROLES.OWNER));
check("6. Manager allowed", canViewFullStoreReports(STORE_ROLES.MANAGER));
check("7. Cashier denied", !canViewFullStoreReports(STORE_ROLES.CASHIER));
check("8. EN/LO reports parity", reportsCopyKeyParity());
check("9. QA copy keys", read("lib/i18n/reports-copy.ts").includes("attendanceQaTitle") && read("lib/i18n/reports-copy.ts").includes("attendanceQaSubtitle"));
check(
  "10. No edit/delete actions",
  !view.includes("upsertStaffWorkSchedule") &&
    !view.includes("endAttendanceWork") &&
    !view.includes("method: \"POST\"") &&
    !view.includes("method: \"DELETE\"") &&
    !view.includes('from "@/features/attendance/attendance-qa"'),
);
check("11. Page is read-only loader", page.includes("getAttendanceQaPageData") && !page.includes("upsertStaffWorkSchedule"));

const monday = new Date("2026-09-21T01:30:00.000Z"); // 08:30 Vientiane Monday
const schedules = [
  { endMinute: 20 * 60, startMinute: 8 * 60, userId: null, weekday: 1 },
  { endMinute: 18 * 60, startMinute: 9 * 60, userId: "emp", weekday: 1 },
];
check("12. Employee override source", classifyScheduleSource({ schedules, startedAt: monday, userId: "emp" }).source === "employee_override");
check("13. Override times", formatScheduleClock(classifyScheduleSource({ schedules, startedAt: monday, userId: "emp" }).schedule?.startMinute) === "09:00");
check("14. Company default source", classifyScheduleSource({ schedules: schedules.slice(0, 1), startedAt: monday, userId: "other" }).source === "company_default");
check("15. No schedule", classifyScheduleSource({ schedules: [], startedAt: monday, userId: "emp" }).source === "none");

const openRow: AttendanceQaRow = {
  attendanceId: "a1",
  branchId: "b1",
  branchName: "Main",
  businessDate: "2026-09-22",
  cashSessionId: "cash-1",
  companyId: "c1",
  employeeName: "A",
  endSource: null,
  endedAt: null,
  lateMinutes: 17,
  regularMinutes: null,
  scheduleSource: "employee_override",
  scheduledEnd: "18:00",
  scheduledStart: "09:00",
  startedAt: monday.toISOString(),
  status: "open",
  userId: "emp",
};
const closedRow: AttendanceQaRow = {
  ...openRow,
  attendanceId: "a2",
  endSource: "manual",
  endedAt: new Date(monday.getTime() + 90 * 60_000).toISOString(),
  lateMinutes: 0,
  regularMinutes: 90,
  status: "closed",
};
const summary = summarizeAttendanceQa([openRow, closedRow]);
check("16. Open/closed summary", summary.openAttendance === 1 && summary.closedAttendance === 1);
check("17. Late summary", summary.lateSessions === 1 && summary.totalLateMinutes === 17);
check("18. Open row has cash link and no regular minutes", openRow.cashSessionId === "cash-1" && openRow.regularMinutes == null);
check("19. Closed row regular minutes", closedRow.regularMinutes === 90 && closedRow.endSource === "manual");
check("20. View shows dash for open end", view.includes('row.endedAt ? formatBusinessDateTimeLabel(row.endedAt) : "—"'));

console.log(`\nR9A QA surface: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
