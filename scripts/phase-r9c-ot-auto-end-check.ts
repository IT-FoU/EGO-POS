/**
 * R9C OT + Auto End static architecture checks.
 */
import { existsSync, readFileSync } from "node:fs";
import {
  computeRegularAndOtMinutes,
  resolveAutoEndAt,
  resolveCreditedEndedAt,
  businessDateMinuteInstant,
  minutesBetween,
} from "../features/ot/ot-math";

const fails: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) console.log(`PASS: ${name}`);
  else {
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
    fails.push(name);
  }
}

function read(path: string) {
  return readFileSync(path, "utf8");
}

const mig = "prisma/migrations/20260922210000_add_staff_ot_and_auto_end/migration.sql";
check("1. Migration exists", existsSync(mig));
const sql = existsSync(mig) ? read(mig) : "";
check("2. OT tables", sql.includes("staff_ot_weekly_policies") && sql.includes("staff_ot_approvals"));
check("3. Attendance OT fields", sql.includes("ot_minutes") && sql.includes("auto_end_at") && sql.includes("ot_approval_id"));
check("4. end_source widened", sql.includes("auto_schedule") && sql.includes("auto_ot"));
check("5. No payroll/resume", !/payroll|resume_attendance|counted_until/i.test(sql.replace(/--.*$/gm, "")));
check("6. Partial approved unique", sql.includes("staff_ot_approvals_one_approved_per_date_key"));
check("7. Open auto_end index", sql.includes("staff_attendance_sessions_open_auto_end_at_idx"));

check("8. Custom worker", existsSync("cloudflare-custom-worker.ts") && read("cloudflare-custom-worker.ts").includes("scheduled"));
check("9. QA cron config", read("wrangler.qa.jsonc").includes("*/5 * * * *") && read("wrangler.qa.jsonc").includes("cloudflare-custom-worker.ts"));
check("10. Auto-end route secured", read("app/api/internal/attendance/auto-end/route.ts").includes("x-ego-cron-secret"));

check("11. My OT + Approvals + Settings", existsSync("features/pos/components/my-ot-modal.tsx") && existsSync("app/(dashboard)/staff/ot/page.tsx") && existsSync("features/ot/components/ot-settings-panel.tsx"));
check("12. Prisma models", read("prisma/schema.prisma").includes("model StaffOtApproval") && read("prisma/schema.prisma").includes("otMinutes"));
check("13. No Resume Attendance", !read("features/ot/prisma-repository.ts").includes("resumeAttendance") && !read("features/attendance/prisma-repository.ts").includes("resumeAttendance"));

// Math: normal day 08:00-20:00, OT 20:00-22:00, work 08:00-21:15
const label = "2026-09-22";
const schedule = { endMinute: 1200, startMinute: 480, userId: null, weekday: 1 };
const ot = { endMinute: 1320, startMinute: 1200 };
const start = businessDateMinuteInstant(label, 480);
const end2115 = businessDateMinuteInstant(label, 1275);
const split = computeRegularAndOtMinutes({
  businessDateLabel: label,
  dayOffKind: null,
  endedAt: end2115,
  otApproval: ot,
  schedule,
  startedAt: start,
});
check("14. Normal OT split regular 720", split.regularMinutes === 720, `got ${split.regularMinutes}`);
check("15. Normal OT split ot 75", split.otMinutes === 75, `got ${split.otMinutes}`);

const lateStart = businessDateMinuteInstant(label, 510);
const lateSplit = computeRegularAndOtMinutes({
  businessDateLabel: label,
  dayOffKind: null,
  endedAt: end2115,
  otApproval: ot,
  schedule,
  startedAt: lateStart,
});
check("16. Late start regular 690", lateSplit.regularMinutes === 690, `got ${lateSplit.regularMinutes}`);
check("17. Late does not reduce OT", lateSplit.otMinutes === 75, `got ${lateSplit.otMinutes}`);

const earlyStart = businessDateMinuteInstant(label, 450);
const earlySplit = computeRegularAndOtMinutes({
  businessDateLabel: label,
  dayOffKind: null,
  endedAt: businessDateMinuteInstant(label, 1200),
  otApproval: null,
  schedule,
  startedAt: earlyStart,
});
check("18. Early start is regular", earlySplit.regularMinutes === 750 && earlySplit.otMinutes === 0, `r=${earlySplit.regularMinutes} ot=${earlySplit.otMinutes}`);

const noOtPast = computeRegularAndOtMinutes({
  businessDateLabel: label,
  dayOffKind: null,
  endedAt: end2115,
  otApproval: null,
  schedule,
  startedAt: start,
});
check("19. No approval past end → ot 0 credited to schedule", noOtPast.otMinutes === 0 && noOtPast.regularMinutes === 720, `r=${noOtPast.regularMinutes} ot=${noOtPast.otMinutes}`);

const dayOff = computeRegularAndOtMinutes({
  businessDateLabel: label,
  dayOffKind: "weekly",
  endedAt: businessDateMinuteInstant(label, 1080),
  otApproval: { startMinute: 480, endMinute: 1080 },
  schedule: null,
  startedAt: start,
});
check("20. Day Off all OT", dayOff.regularMinutes === 0 && dayOff.otMinutes === 600, `r=${dayOff.regularMinutes} ot=${dayOff.otMinutes}`);

const autoNormal = resolveAutoEndAt({ businessDateLabel: label, dayOffKind: null, otApproval: null, schedule });
check("21. Auto end schedule", autoNormal?.getTime() === businessDateMinuteInstant(label, 1200).getTime());

const autoOt = resolveAutoEndAt({ businessDateLabel: label, dayOffKind: null, otApproval: ot, schedule });
check("22. Auto end OT", autoOt?.getTime() === businessDateMinuteInstant(label, 1320).getTime());

const autoDayOffNone = resolveAutoEndAt({ businessDateLabel: label, dayOffKind: "quota", otApproval: null, schedule });
check("23. Day Off no grant → no auto end", autoDayOffNone == null);

const autoDayOffGrant = resolveAutoEndAt({
  businessDateLabel: label,
  dayOffKind: "special",
  otApproval: { startMinute: 480, endMinute: 1080 },
  schedule,
});
check("24. Day Off grant uses OT end not schedule", autoDayOffGrant?.getTime() === businessDateMinuteInstant(label, 1080).getTime());

const noSchedule = resolveAutoEndAt({ businessDateLabel: label, dayOffKind: null, otApproval: null, schedule: null });
check("25. No schedule → no auto end", noSchedule == null);

const credited = resolveCreditedEndedAt({
  businessDateLabel: label,
  dayOffKind: null,
  endedAt: end2115,
  otApproval: null,
  schedule,
});
check("26. Credited clamp without OT", credited.getTime() === businessDateMinuteInstant(label, 1200).getTime());
check("27. minutesBetween helper", minutesBetween(start, end2115) === 795);

check("28. Sale gate still attendance", read("features/cash-sessions/prisma-repository.ts").includes("assertOpenAttendanceForSale"));
check("29. EN/LO My OT keys", read("lib/i18n/pos-copy.ts").includes('"ui.my.ot"') && read("lib/i18n/pos-copy.ts").includes("ui.work.shift.ended"));
check("30. package test script", read("package.json").includes("test:r9c-ot"));

console.log(`\nR9C static: ${30 - fails.length} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
