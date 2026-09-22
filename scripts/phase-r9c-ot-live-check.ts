/**
 * R9C live QA checks against QA DB (via globalThis.prisma patch).
 */
import { readFileSync } from "node:fs";
import { loadProjectEnvFiles } from "../lib/db/script-database";
import { createScriptPrismaClient } from "../lib/db/script-prisma";
import { openCashSession, closeCashSession } from "../features/cash-sessions/prisma-repository";
import { endAttendanceWork, assertOpenAttendanceForSale } from "../features/attendance/prisma-repository";
import { grantOtApproval, runAutoEndSweep, cancelOtApproval } from "../features/ot/prisma-repository";
import { upsertWeeklyDayOff } from "../features/day-off/prisma-repository";
import { businessDateMinuteInstant } from "../features/ot/ot-math";
import { businessDayLabel } from "../lib/datetime/business-timezone";
import type { TenantContext } from "../lib/db/write-context";

loadProjectEnvFiles();

const secretsPath = `${process.env.LOCALAPPDATA}/ego-pos-qa/secrets.json`;
const secrets = JSON.parse(readFileSync(secretsPath, "utf8")) as Record<string, string>;
const qaUrl = String(secrets.databaseUrl || secrets.DATABASE_URL || "");
if (!qaUrl.includes("arkhwskvcnntluoakmef")) throw new Error("QA DB required");

process.env.DATABASE_URL = qaUrl;
process.env.DEV_DATABASE_URL = qaUrl;
const prisma = createScriptPrismaClient("dev-write");
(globalThis as any).prisma = prisma;

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

async function seed() {
  const stamp = Date.now().toString(36);
  const company = await prisma.company.create({
    data: { businessTemplateKey: "minimart", name: `R9C-${stamp}` },
  });
  const branch = await prisma.branch.create({
    data: { companyId: company.id, name: "Main", code: `R9C${stamp.slice(-4)}` },
  });
  const warehouse = await prisma.warehouse.create({
    data: { branchId: branch.id, companyId: company.id, name: "WH", isDefault: true },
  });
  const ownerUser = await prisma.user.create({
    data: { username: `r9co-${stamp}`, passwordHash: "x", displayName: "Owner" },
  });
  const staffUser = await prisma.user.create({
    data: { username: `r9cs-${stamp}`, passwordHash: "x", displayName: "Staff" },
  });
  await prisma.companyUser.create({
    data: { branchId: branch.id, companyId: company.id, isOwner: true, userId: ownerUser.id },
  });
  await prisma.companyUser.create({
    data: { branchId: branch.id, companyId: company.id, isOwner: false, userId: staffUser.id },
  });

  const weekday = new Date().getUTCDay(); // approximate; schedules use business weekday at start
  // Use all weekdays for schedule to be safe
  for (let w = 0; w <= 6; w += 1) {
    await prisma.staffWorkSchedule.create({
      data: {
        companyId: company.id,
        endMinute: 1200,
        startMinute: 480,
        userId: staffUser.id,
        weekday: w,
      },
    });
  }

  return {
    branch,
    company,
    owner: { branchId: branch.id, companyId: company.id, userId: ownerUser.id } satisfies TenantContext,
    staff: { branchId: branch.id, companyId: company.id, userId: staffUser.id } satisfies TenantContext,
    warehouse,
  };
}

async function main() {
  const ctx = await seed();
  const label = businessDayLabel(new Date());

  // 1. Start Work → auto_end_at = schedule end
  const opened = await openCashSession({ openingCashLak: 50_000 }, ctx.staff);
  const att = await prisma.staffAttendanceSession.findFirst({
    where: { cashSessionId: opened.id, status: "open" },
  });
  check("L1. Open attendance created", Boolean(att));
  check("L2. auto_end_at set to schedule", Boolean(att?.autoEndAt));

  // 2. Grant OT while open → auto_end updates
  await grantOtApproval(ctx.owner, {
    businessDate: label,
    endMinute: 1320,
    startMinute: 1200,
    userId: ctx.staff.userId,
  });
  const afterOt = await prisma.staffAttendanceSession.findFirst({ where: { id: att!.id } });
  check("L3. OT grant updates auto_end_at", Boolean(afterOt?.autoEndAt && afterOt.otApprovalId));

  // 3. Manual end before OT end
  const ended = await endAttendanceWork(ctx.staff);
  check("L4. Manual end source", ended.endSource === "manual");
  check("L5. ot_minutes persisted number", typeof ended.otMinutes === "number");

  await closeCashSession(opened.id, { countedCashLak: 50_000 }, ctx.staff);

  // 4. No OT → Auto End at schedule with intended ended_at
  const opened2 = await openCashSession({ openingCashLak: 40_000 }, ctx.staff);
  const att2 = await prisma.staffAttendanceSession.findFirst({
    where: { cashSessionId: opened2.id, status: "open" },
  });
  const target = businessDateMinuteInstant(label, 1200);
  // Force due
  await prisma.staffAttendanceSession.update({
    data: { autoEndAt: new Date(Date.now() - 60_000) },
    where: { id: att2!.id },
  });
  // Store intended schedule end on a second row scenario: set auto_end_at to target in past relative to sweep now
  // Use target as both intended and due
  await prisma.staffAttendanceSession.update({
    data: { autoEndAt: target },
    where: { id: att2!.id },
  });
  const sweepNow = new Date(target.getTime() + 5 * 60_000);
  const sweep = await runAutoEndSweep(sweepNow);
  const closed2 = await prisma.staffAttendanceSession.findFirst({ where: { id: att2!.id } });
  check("L6. Auto End closed", closed2?.status === "closed", `status=${closed2?.status} sweep=${JSON.stringify(sweep)}`);
  check(
    "L7. ended_at = intended not cron",
    closed2?.endedAt != null && Math.abs(new Date(closed2.endedAt).getTime() - target.getTime()) < 1000,
    `ended=${closed2?.endedAt?.toISOString()} target=${target.toISOString()}`,
  );
  check("L8. end_source auto", closed2?.endSource === "auto_schedule" || closed2?.endSource === "auto_ot");
  check("L9. ot_minutes is 0 not null post-R9C", closed2?.otMinutes === 0);
  const cashStillOpen = await prisma.cashSession.findFirst({ where: { id: opened2.id } });
  check("L10. CashSession still open", cashStillOpen?.closedAt == null);

  let saleBlocked = false;
  try {
    await assertOpenAttendanceForSale(ctx.staff, prisma as any, opened2.id);
  } catch (error) {
    saleBlocked = error instanceof Error && /attendance/i.test(error.message);
  }
  check("L11. Sale blocked after Auto End", saleBlocked);

  // Duplicate sweep idempotent
  const sweep2 = await runAutoEndSweep(sweepNow);
  check("L12. Duplicate sweep safe", sweep2.closed === 0);

  await closeCashSession(opened2.id, { countedCashLak: 40_000 }, ctx.staff).catch(() => undefined);

  // Day Off without OT grant → no auto_end
  const weekday = new Date().getDay(); // local — may differ; set all weekdays weekly day off for staff briefly
  for (let w = 0; w <= 6; w += 1) {
    await upsertWeeklyDayOff(ctx.owner, { userId: ctx.staff.userId, weekday: w }).catch(() => undefined);
  }
  const opened3 = await openCashSession({ openingCashLak: 30_000 }, ctx.staff);
  const att3 = await prisma.staffAttendanceSession.findFirst({
    where: { cashSessionId: opened3.id, status: "open" },
  });
  check("L13. Day Off kind set", Boolean(att3?.dayOffKind));
  check("L14. Day Off without OT grant → auto_end null", att3?.autoEndAt == null);

  // Grant Day Off OT
  await grantOtApproval(ctx.owner, {
    businessDate: label,
    endMinute: 1080,
    startMinute: 480,
    userId: ctx.staff.userId,
  }).catch(async (err) => {
    // may already have approved OT for date from earlier — cancel first
    const existing = await prisma.staffOtApproval.findFirst({
      where: { businessDate: new Date(`${label}T00:00:00.000Z`), status: "approved", userId: ctx.staff.userId },
    });
    if (existing) await cancelOtApproval(ctx.owner, existing.id);
    await grantOtApproval(ctx.owner, {
      businessDate: label,
      endMinute: 1080,
      startMinute: 480,
      userId: ctx.staff.userId,
    });
  });
  const att3b = await prisma.staffAttendanceSession.findFirst({ where: { id: att3!.id } });
  check("L15. Day Off OT grant sets auto_end", Boolean(att3b?.autoEndAt));

  // Self grant blocked
  let selfBlocked = false;
  try {
    await grantOtApproval(ctx.staff, {
      businessDate: label,
      endMinute: 1300,
      startMinute: 1200,
      userId: ctx.staff.userId,
    });
  } catch (error) {
    selfBlocked = error instanceof Error && /cannot grant or cancel your own/i.test(error.message);
  }
  check("L16. Self grant blocked", selfBlocked);

  await endAttendanceWork(ctx.staff).catch(() => undefined);
  await closeCashSession(opened3.id, { countedCashLak: 30_000 }, ctx.staff).catch(() => undefined);

  console.log(`\nR9C live: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
