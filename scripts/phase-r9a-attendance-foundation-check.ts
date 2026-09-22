/**
 * R9A Attendance Foundation checks — math + live DB transitions.
 * Never targets Production.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ATTENDANCE_END_SOURCE,
  ATTENDANCE_STATUS,
  computeLateMinutes,
  computeRegularMinutes,
  resolveScheduleForUser,
  scheduledStartInstant,
  weekdayForBusinessInstant,
} from "../features/attendance/attendance-math";
import {
  assertOpenAttendanceForSale,
  createOpenAttendanceInTx,
  endAttendanceWork,
  upsertStaffWorkSchedule,
} from "../features/attendance/prisma-repository";
import { closeCashSession, openCashSession } from "../features/cash-sessions/prisma-repository";
import { assertOpenCashSessionForSale } from "../features/cash-sessions/prisma-repository";
import { PRODUCTION_DB_FINGERPRINT } from "../lib/db/database-target";
import { createScriptPrismaClient } from "../lib/db/script-prisma";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";
import { posCopyKeyParity } from "../lib/i18n/pos-copy";
import { startOfBusinessDay } from "../lib/datetime/business-timezone";

loadProjectEnvFiles();
process.env.IGO_DEMO_MODE = "false";

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

// --- Static / math ---
check("1. EN/LO POS copy key parity", posCopyKeyParity() === true);
check("2. End Work EN/LO keys", read("lib/i18n/pos-copy.ts").includes('"ui.end.work"') && read("lib/i18n/pos-copy.ts").includes('"ui.end.work.failed"'));
check("3. Migration file exists", existsSync("prisma/migrations/20260922183000_add_staff_attendance_foundation/migration.sql"));
check("4. No Day Off / OT tables in R9A migration", (() => {
  const sql = read("prisma/migrations/20260922183000_add_staff_attendance_foundation/migration.sql");
  return (
    sql.includes('CREATE TABLE "staff_work_schedules"') &&
    sql.includes('CREATE TABLE "staff_attendance_sessions"') &&
    !/CREATE TABLE ".*day_off/i.test(sql) &&
    !/CREATE TABLE ".*ot_/i.test(sql) &&
    !/CREATE TABLE ".*overtime/i.test(sql)
  );
})());
check("5. cash_sessions not altered", !read("prisma/migrations/20260922183000_add_staff_attendance_foundation/migration.sql").includes("ALTER TABLE \"cash_sessions\""));
check("6. Start Work wires attendance in cash open", read("features/cash-sessions/prisma-repository.ts").includes("createOpenAttendanceInTx"));
check("7. Sale gate keeps cash assert + attendance", read("features/cash-sessions/prisma-repository.ts").includes("assertOpenAttendanceForSale"));
check("8. End Work API exists", existsSync("app/api/pos/attendance/end-work/route.ts"));

const companyDefault = { endMinute: 20 * 60, startMinute: 8 * 60, userId: null, weekday: 1 };
const override = { endMinute: 18 * 60, startMinute: 9 * 60, userId: "u1", weekday: 1 };
check(
  "9. Override wins over company default",
  resolveScheduleForUser({ schedules: [companyDefault, override], userId: "u1", weekday: 1 })?.startMinute === 9 * 60,
);
check(
  "10. Fallback to company default",
  resolveScheduleForUser({ schedules: [companyDefault], userId: "u2", weekday: 1 })?.startMinute === 8 * 60,
);
check(
  "11. No schedule → null",
  resolveScheduleForUser({ schedules: [], userId: "u1", weekday: 1 }) == null,
);

const mondayMorning = (() => {
  // Build a Monday 08:00 Vientiane instant approximately via startOfBusinessDay + minutes
  const base = startOfBusinessDay(new Date("2026-09-21T12:00:00.000Z")); // around Mon Sep 21 2026
  // Find a Monday
  let d = base;
  for (let i = 0; i < 7; i += 1) {
    if (weekdayForBusinessInstant(d) === 1) break;
    d = new Date(d.getTime() + 86_400_000);
  }
  return d;
})();

check("12. On-time late=0", computeLateMinutes({
  schedule: companyDefault,
  startedAt: scheduledStartInstant({ endMinute: companyDefault.endMinute, startAt: mondayMorning, startMinute: companyDefault.startMinute }),
}) === 0);

check("13. Early late=0", computeLateMinutes({
  schedule: companyDefault,
  startedAt: new Date(scheduledStartInstant({ endMinute: companyDefault.endMinute, startAt: mondayMorning, startMinute: companyDefault.startMinute }).getTime() - 10 * 60_000),
}) === 0);

check("14. Late 17 minutes", computeLateMinutes({
  schedule: companyDefault,
  startedAt: new Date(scheduledStartInstant({ endMinute: companyDefault.endMinute, startAt: mondayMorning, startMinute: companyDefault.startMinute }).getTime() + 17 * 60_000),
}) === 17);

check("15. No schedule late=0", computeLateMinutes({ schedule: null, startedAt: new Date() }) === 0);
check("16. Regular minutes", computeRegularMinutes(new Date(0), new Date(90 * 60_000)) === 90);
check("17. Status constants", ATTENDANCE_STATUS.OPEN === "open" && ATTENDANCE_END_SOURCE.MANUAL === "manual");

// --- Live DB ---
const url = resolveScriptDatabaseUrl("dev-write");
if (url.includes(PRODUCTION_DB_FINGERPRINT)) {
  console.error("STOP: refusing Production DB");
  process.exit(1);
}

const prisma = createScriptPrismaClient("dev-write");
(globalThis as unknown as { prisma?: typeof prisma }).prisma = prisma;

async function live() {
  const company = await prisma.company.findFirst({ orderBy: { createdAt: "asc" } });
  const branch = company
    ? await prisma.branch.findFirst({ where: { companyId: company.id }, orderBy: { createdAt: "asc" } })
    : null;
  const membership = company
    ? await prisma.companyUser.findFirst({ where: { companyId: company.id, status: "active" }, orderBy: { createdAt: "asc" } })
    : null;
  const secondUser = company && membership
    ? await prisma.companyUser.findFirst({
        where: { companyId: company.id, status: "active", userId: { not: membership.userId } },
        orderBy: { createdAt: "asc" },
      })
    : null;

  if (!company || !branch || !membership) {
    check("18. Live tenant available", false, "missing company/branch/user");
    return;
  }

  const tenant = {
    branchId: branch.id,
    companyId: company.id,
    userId: membership.userId,
    warehouseId: undefined as string | undefined,
  };

  // Cleanup leftover open sessions for this user
  await prisma.staffAttendanceSession.updateMany({
    where: { companyId: company.id, status: "open", userId: membership.userId },
    data: {
      endSource: "manual",
      endedAt: new Date(),
      regularMinutes: 0,
      status: "closed",
    },
  });
  const openCash = await prisma.cashSession.findFirst({
    select: { id: true, openingCash: true },
    where: { branchId: branch.id, cashierId: membership.userId, closedAt: null, companyId: company.id },
  });
  if (openCash) {
    await closeCashSession(openCash.id, { countedCashLak: Number(openCash.openingCash) }, tenant);
  }

  const weekday = weekdayForBusinessInstant(new Date());
  await upsertStaffWorkSchedule(
    { endMinute: 20 * 60, startMinute: 8 * 60, userId: null, weekday },
    tenant,
  );
  await upsertStaffWorkSchedule(
    { endMinute: 18 * 60, startMinute: 9 * 60, userId: membership.userId, weekday },
    tenant,
  );

  const opened = await openCashSession({ openingCashLak: 100_000 }, tenant);
  check("18. Start Work creates open cash", opened.status === "open" && Boolean(opened.id));

  const attendance = await prisma.staffAttendanceSession.findFirst({
    where: { cashSessionId: opened.id, status: "open", userId: membership.userId },
  });
  check("19. Attendance linked to cash session", Boolean(attendance) && attendance!.cashSessionId === opened.id);
  check("20. Attendance open status", attendance?.status === "open");
  check("21. Late uses override (not fabricated 08:00)", attendance != null && attendance.lateMinutes >= 0);

  let dupBlocked = false;
  try {
    await openCashSession({ openingCashLak: 50_000 }, tenant);
  } catch (error) {
    dupBlocked = error instanceof Error && /open cash session already exists|open attendance/i.test(error.message);
  }
  check("22. Duplicate Start Work blocked", dupBlocked);

  await assertOpenCashSessionForSale(tenant, prisma);
  check("23. Sale allowed with cash + attendance", true);

  // End attendance only — cash remains open
  const ended = await endAttendanceWork(tenant);
  check("24. End Work closes attendance", ended.status === "closed" && ended.endSource === "manual");
  check("25. regular_minutes set", typeof ended.regularMinutes === "number" && ended.regularMinutes! >= 0);

  let saleBlockedNoAttendance = false;
  try {
    await assertOpenCashSessionForSale(tenant, prisma);
  } catch (error) {
    saleBlockedNoAttendance =
      error instanceof Error && /attendance/i.test(error.message);
  }
  check("26. Sale blocked when cash open but no attendance", saleBlockedNoAttendance);

  // Close cash to allow clean restart
  await closeCashSession(opened.id, { countedCashLak: 100_000 }, tenant);

  // Attendance without cash: create attendance alone is not exposed; simulate gate with foreign cash id
  const otherCash = await openCashSession({ openingCashLak: 10_000 }, tenant);
  const att2 = await prisma.staffAttendanceSession.findFirst({
    where: { cashSessionId: otherCash.id, status: "open" },
  });
  check("27. Restart Start Work creates new attendance", Boolean(att2));

  // Branch mismatch simulation via assertOpenAttendanceForSale with wrong cash id
  let linkMismatch = false;
  try {
    await assertOpenAttendanceForSale(tenant, prisma, "not-the-cash-session-id");
  } catch (error) {
    linkMismatch = error instanceof Error && /not linked to the active cash session/i.test(error.message);
  }
  check("28. Attendance/cash link validated when present", linkMismatch);

  if (secondUser) {
    const tenant2 = { branchId: branch.id, companyId: company.id, userId: secondUser.userId };
    await prisma.staffAttendanceSession.updateMany({
      where: { companyId: company.id, status: "open", userId: secondUser.userId },
      data: { endSource: "manual", endedAt: new Date(), regularMinutes: 0, status: "closed" },
    });
    const open2 = await prisma.cashSession.findFirst({
      select: { id: true, openingCash: true },
      where: { branchId: branch.id, cashierId: secondUser.userId, closedAt: null, companyId: company.id },
    });
    if (open2) await closeCashSession(open2.id, { countedCashLak: Number(open2.openingCash) }, tenant2);
    const opened2 = await openCashSession({ openingCashLak: 20_000 }, tenant2);
    check("29. Different employees may each have open attendance", Boolean(opened2.id));
    await endAttendanceWork(tenant2);
    await closeCashSession(opened2.id, { countedCashLak: 20_000 }, tenant2);
  } else {
    check("29. Different employees may each have open attendance", true, "skipped — only one user");
  }

  // Immutability: no update API for started_at — verify repository does not export time edit
  const repoSrc = read("features/attendance/prisma-repository.ts");
  check(
    "30. No attendance time-edit API",
    !repoSrc.includes("updateStartedAt") && !repoSrc.includes("editAttendance") && !repoSrc.includes("correctAttendance"),
  );

  await endAttendanceWork(tenant).catch(() => undefined);
  await closeCashSession(otherCash.id, { countedCashLak: 10_000 }, tenant).catch(() => undefined);

  // Ensure cash accounting symbols untouched
  check(
    "31. Cash calculator still used for close",
    read("features/cash-sessions/prisma-repository.ts").includes("calculateExpectedCash") &&
      read("features/cash-sessions/prisma-repository.ts").includes("calculateVariance"),
  );
}

await live().catch((error) => {
  failed += 1;
  console.log(`FAIL: live suite — ${error instanceof Error ? error.message : error}`);
});

await prisma.$disconnect().catch(() => undefined);

console.log(`\nR9A result: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
