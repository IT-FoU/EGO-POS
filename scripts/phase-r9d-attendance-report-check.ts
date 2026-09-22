/**
 * R9D — Staff Attendance Report static QA checks.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  REPORT_CENTER_CATEGORIES,
  REPORT_CENTER_ENTRIES,
  findReportCenterEntryByHref,
} from "../features/reports/report-center-catalog";
import {
  aggregateSessionsToDay,
  buildDayOffOnlyRow,
  dayOffLabelFromKind,
  formatHoursMinutes,
  summarizeAttendanceDays,
} from "../features/reports/attendance-report-math";
import { reportsCopyHasNoReplacementChars, reportsCopyKeyParity, tReports } from "../lib/i18n/reports-copy";

const ROOT = process.cwd();

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

check("route page exists", existsSync("app/(dashboard)/reports/staff/attendance/page.tsx"));
check("export route exists", existsSync("app/api/reports/staff/attendance/export/route.ts"));
check("detail route exists", existsSync("app/api/reports/staff/attendance/detail/route.ts"));
check("catalog entry", Boolean(findReportCenterEntryByHref("/reports/staff/attendance")));
check("staff category", REPORT_CENTER_CATEGORIES.some((c) => c.id === "staff"));
check("staff attendance entry", REPORT_CENTER_ENTRIES.some((e) => e.id === "staff-attendance"));

const service = read("features/reports/attendance-report-service.ts");
const repo = read("features/reports/attendance-report-repository.ts");
const math = read("features/reports/attendance-report-math.ts");
const excel = read("features/reports/attendance-report-excel.ts");
const view = read("features/reports/components/attendance-report-view.tsx");

check("Owner/Manager gate REPORTS_VIEW_FULL", service.includes("REPORTS_VIEW_FULL") && service.includes("canViewBranchShiftReports"));
check("read-only — no create snapshot", !repo.includes("staffDayOffMonth.create") && !repo.includes("create("));
check("persisted late/ot/regular", repo.includes("lateMinutes") && repo.includes("otMinutes") && repo.includes("regularMinutes"));
check("NULL OT not coerced to 0 in math display", formatHoursMinutes(null) === "—" && formatHoursMinutes(0) === "0m");
check("weekday_resolved schedule note", repo.includes("weekday_resolved") && view.includes("scheduleWeekdayResolved"));
check("Excel filename prefix", excel.includes("EGO-POS-Staff-Attendance-"));
check("Employee Summary sheet", excel.includes("Employee Summary"));
check("day-level grain helpers", math.includes("aggregateSessionsToDay") && math.includes("buildDayOffOnlyRow"));

// A–style math fixtures
const worked = aggregateSessionsToDay({
  branchId: "b1",
  branchName: "Main",
  businessDate: "2026-09-22",
  employeeName: "Ada",
  scheduleResolved: true,
  scheduledEnd: "20:00",
  scheduledStart: "08:00",
  sessions: [
    {
      attendanceId: "a1",
      autoEnd: false,
      cashSessionId: null,
      dayOffKind: null,
      dayOffRequestId: null,
      endSource: "manual",
      endedAt: "2026-09-22T13:00:00.000Z",
      lateMinutes: 0,
      note: null,
      otApprovalId: null,
      otMinutes: 0,
      regularMinutes: 480,
      startedAt: "2026-09-22T01:00:00.000Z",
      status: "closed",
    },
  ],
  userId: "u1",
});
check("A. normal worked day", worked.workStatus === "worked" && worked.regularMinutes === 480 && worked.otMinutes === 0);

const late = aggregateSessionsToDay({
  ...worked,
  sessions: [{ ...worked.sessions[0]!, lateMinutes: 17, attendanceId: "a2" }],
  userId: "u1",
  businessDate: "2026-09-22",
  branchId: "b1",
  branchName: "Main",
  employeeName: "Ada",
  scheduleResolved: true,
  scheduledStart: "08:00",
  scheduledEnd: "20:00",
});
check("B. late day", late.lateMinutes === 17);

const autoSched = aggregateSessionsToDay({
  branchId: "b1",
  branchName: "Main",
  businessDate: "2026-09-22",
  employeeName: "Ada",
  scheduleResolved: true,
  scheduledEnd: "20:00",
  scheduledStart: "08:00",
  sessions: [
    {
      attendanceId: "a3",
      autoEnd: true,
      cashSessionId: null,
      dayOffKind: null,
      dayOffRequestId: null,
      endSource: "auto_schedule",
      endedAt: "2026-09-22T13:00:00.000Z",
      lateMinutes: 0,
      note: null,
      otApprovalId: null,
      otMinutes: 0,
      regularMinutes: 480,
      startedAt: "2026-09-22T01:00:00.000Z",
      status: "closed",
    },
  ],
  userId: "u1",
});
check("E. auto_schedule End", autoSched.autoEnd && autoSched.autoEndKind === "auto_schedule");

const autoOt = aggregateSessionsToDay({
  branchId: "b1",
  branchName: "Main",
  businessDate: "2026-09-22",
  employeeName: "Ada",
  scheduleResolved: true,
  scheduledEnd: "20:00",
  scheduledStart: "08:00",
  sessions: [
    {
      attendanceId: "a4",
      autoEnd: true,
      cashSessionId: null,
      dayOffKind: null,
      dayOffRequestId: null,
      endSource: "auto_ot",
      endedAt: "2026-09-22T14:00:00.000Z",
      lateMinutes: 0,
      note: null,
      otApprovalId: "ot1",
      otMinutes: 60,
      regularMinutes: 480,
      startedAt: "2026-09-22T01:00:00.000Z",
      status: "closed",
    },
  ],
  userId: "u1",
});
check("F/G. auto_ot + OT", autoOt.autoEndKind === "auto_ot" && autoOt.otMinutes === 60);

const preR9c = aggregateSessionsToDay({
  branchId: "b1",
  branchName: "Main",
  businessDate: "2026-09-01",
  employeeName: "Ada",
  scheduleResolved: true,
  scheduledEnd: "20:00",
  scheduledStart: "08:00",
  sessions: [
    {
      attendanceId: "a5",
      autoEnd: false,
      cashSessionId: null,
      dayOffKind: null,
      dayOffRequestId: null,
      endSource: "manual",
      endedAt: "2026-09-01T13:00:00.000Z",
      lateMinutes: 0,
      note: null,
      otApprovalId: null,
      otMinutes: null,
      regularMinutes: 480,
      startedAt: "2026-09-01T01:00:00.000Z",
      status: "closed",
    },
  ],
  userId: "u1",
});
check("I. pre-R9C OT NULL", preR9c.otMinutes === null);

const weeklyOnly = buildDayOffOnlyRow({
  branchId: "b1",
  branchName: "Main",
  businessDate: "2026-09-21",
  dayOffLabel: "weekly",
  dayOffRequestId: null,
  employeeName: "Ada",
  scheduleResolved: false,
  scheduledEnd: null,
  scheduledStart: null,
  userId: "u1",
});
check("J. weekly Day Off no work", weeklyOnly.workStatus === "day_off" && weeklyOnly.dayOffLabel === "weekly");

check("M. Worked on Day Off label", dayOffLabelFromKind("weekly", true) === "worked_on_day_off");

const multi = aggregateSessionsToDay({
  branchId: "b1",
  branchName: "Main",
  businessDate: "2026-09-22",
  employeeName: "Ada",
  scheduleResolved: true,
  scheduledEnd: "20:00",
  scheduledStart: "08:00",
  sessions: [
    {
      attendanceId: "m1",
      autoEnd: false,
      cashSessionId: "c1",
      dayOffKind: null,
      dayOffRequestId: null,
      endSource: "manual",
      endedAt: "2026-09-22T05:00:00.000Z",
      lateMinutes: 5,
      note: null,
      otApprovalId: null,
      otMinutes: 0,
      regularMinutes: 120,
      startedAt: "2026-09-22T01:00:00.000Z",
      status: "closed",
    },
    {
      attendanceId: "m2",
      autoEnd: false,
      cashSessionId: "c2",
      dayOffKind: null,
      dayOffRequestId: null,
      endSource: "manual",
      endedAt: "2026-09-22T13:00:00.000Z",
      lateMinutes: 0,
      note: null,
      otApprovalId: null,
      otMinutes: 30,
      regularMinutes: 200,
      startedAt: "2026-09-22T06:00:00.000Z",
      status: "closed",
    },
  ],
  userId: "u1",
});
check(
  "P. multiple sessions same day aggregate",
  multi.sessionCount === 2 &&
    multi.regularMinutes === 320 &&
    multi.otMinutes === 30 &&
    multi.lateMinutes === 5 &&
    multi.startedAt === "2026-09-22T01:00:00.000Z",
);

const openRow = aggregateSessionsToDay({
  branchId: "b1",
  branchName: "Main",
  businessDate: "2026-09-22",
  employeeName: "Ada",
  scheduleResolved: true,
  scheduledEnd: "20:00",
  scheduledStart: "08:00",
  sessions: [
    {
      attendanceId: "o1",
      autoEnd: false,
      cashSessionId: null,
      dayOffKind: null,
      dayOffRequestId: null,
      endSource: null,
      endedAt: null,
      lateMinutes: 0,
      note: null,
      otApprovalId: null,
      otMinutes: null,
      regularMinutes: null,
      startedAt: "2026-09-22T01:00:00.000Z",
      status: "open",
    },
  ],
  userId: "u1",
});
check("Q. open attendance", openRow.workStatus === "open" && openRow.regularMinutes === null && openRow.endedAt === null);

const summary = summarizeAttendanceDays([worked, weeklyOnly, autoOt, openRow]);
check("summary no double-count employees", summary.employees === 1);
check("summary work days includes open", summary.workDays === 3);
check("summary day off days", summary.dayOffDays === 1);

const keys = [
  "staffAttendance",
  "otHours",
  "onTime",
  "weeklyDayOff",
  "quotaDayOff",
  "specialDayOff",
  "workedOnDayOff",
  "autoEnd",
  "autoSchedule",
  "autoOt",
  "workStatus",
  "noWorkRecord",
  "notRecorded",
  "employeeSummary",
  "dayOffUsed",
  "dayOffRemaining",
  "noQuotaActivity",
  "exportExcel",
  "total",
];
for (const key of keys) {
  check(`i18n EN ${key}`, Boolean(tReports(key, "en")) && tReports(key, "en") !== key);
  check(`i18n LO ${key}`, Boolean(tReports(key, "lo")) && tReports(key, "lo") !== key && tReports(key, "lo") !== tReports(key, "en"));
}
check("i18n key parity", reportsCopyKeyParity() === true);
check("no Thai replacement chars in LO", reportsCopyHasNoReplacementChars() === true);

console.log(`\nR9D checks: ${passed} passed, ${failed} failed`);
