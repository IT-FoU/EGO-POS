/**
 * R9B Day Off live DB checks (dev-write). No Production.
 */
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";
import { createScriptPrismaClient } from "../lib/db/script-prisma";
import {
  approveDayOffRequest,
  cancelDayOffRequest,
  createEmployeeQuotaRequest,
  getQuotaSummaryReadOnly,
  grantSpecialDayOff,
  upsertQuotaPolicy,
  upsertWeeklyDayOff,
} from "../features/day-off/prisma-repository";
import { openCashSession } from "../features/cash-sessions/prisma-repository";
import type { TenantContext } from "../lib/db/write-context";

loadProjectEnvFiles();
resolveScriptDatabaseUrl("dev-write");
const prisma = createScriptPrismaClient("dev-write");
(globalThis as unknown as { prisma?: typeof prisma }).prisma = prisma;

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
    data: {
      businessTemplateKey: "minimart",
      name: `R9B-${stamp}`,
      storeCode: `R9B${stamp}`.slice(0, 20),
    },
  });
  const owner = await prisma.user.create({
    data: {
      fullName: "R9B Owner",
      passwordHash: "x",
      username: `r9bo_${stamp}`,
    },
  });
  const emp = await prisma.user.create({
    data: {
      fullName: "R9B Emp",
      passwordHash: "x",
      username: `r9be_${stamp}`,
    },
  });
  const branch = await prisma.branch.create({
    data: { companyId: company.id, isMainBranch: true, name: "Main" },
  });
  const warehouse = await prisma.warehouse.create({
    data: { branchId: branch.id, companyId: company.id, name: "WH", type: "store" },
  });
  await prisma.companyUser.create({
    data: { branchId: branch.id, companyId: company.id, isOwner: true, status: "active", userId: owner.id },
  });
  await prisma.companyUser.create({
    data: { branchId: branch.id, companyId: company.id, isOwner: false, status: "active", userId: emp.id },
  });
  const ownerTenant: TenantContext = {
    branchId: branch.id,
    companyId: company.id,
    userId: owner.id,
    warehouseId: warehouse.id,
  };
  const empTenant: TenantContext = {
    branchId: branch.id,
    companyId: company.id,
    userId: emp.id,
    warehouseId: warehouse.id,
  };
  return { branch, company, emp, empTenant, owner, ownerTenant, warehouse };
}

async function main() {
  const ctx = await seed();
  const beforeMonths = await prisma.staffDayOffMonth.count({
    where: { companyId: ctx.company.id, userId: ctx.emp.id },
  });
  const read = await getQuotaSummaryReadOnly(ctx.empTenant, ctx.emp.id);
  const afterView = await prisma.staffDayOffMonth.count({
    where: { companyId: ctx.company.id, userId: ctx.emp.id },
  });
  check("L1. View quota does not create month snapshot", beforeMonths === afterView && read.snapshotExists === false);

  await upsertQuotaPolicy(ctx.ownerTenant, { monthlyQuotaDays: 2, userId: null });
  await upsertQuotaPolicy(ctx.ownerTenant, { monthlyQuotaDays: 2, userId: ctx.emp.id });

  // Pick a date that is not Sunday for weekly test later — use a fixed Tuesday in current month
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  // find a Tuesday (2)
  let day = 2;
  for (let d = 1; d <= 28; d++) {
    const probe = new Date(Date.UTC(y, m, d, 12));
    if (probe.getUTCDay() === 2) {
      day = d;
      break;
    }
  }
  const dateLabel = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const req = await createEmployeeQuotaRequest(ctx.empTenant, { requestDate: dateLabel, reason: "test" });
  const afterCreate = await prisma.staffDayOffMonth.count({
    where: { companyId: ctx.company.id, userId: ctx.emp.id },
  });
  check("L2. First quota write creates snapshot", afterCreate === afterView + 1);
  check("L3. Request pending", req.status === "pending");

  let empCancelApprovedBlocked = false;
  try {
    // approve first then emp tries cancel
    await approveDayOffRequest(ctx.ownerTenant, req.id);
    await cancelDayOffRequest(ctx.empTenant, req.id);
  } catch (error) {
    empCancelApprovedBlocked = error instanceof Error && error.message.includes("cannot cancel an approved");
  }
  check("L4. Employee cannot cancel approved", empCancelApprovedBlocked);

  const cancelled = await cancelDayOffRequest(ctx.ownerTenant, req.id, "owner cancel");
  check(
    "L5. Owner cancel approved restores unused quota",
    cancelled.status === "cancelled" && cancelled.quotaConsumed === false,
  );

  // Weekly overlap
  await upsertWeeklyDayOff(ctx.ownerTenant, { userId: ctx.emp.id, weekday: 0 }); // Sunday
  let sunday = 5;
  for (let d = 1; d <= 28; d++) {
    if (new Date(Date.UTC(y, m, d, 12)).getUTCDay() === 0) {
      sunday = d;
      break;
    }
  }
  const sundayLabel = `${y}-${String(m + 1).padStart(2, "0")}-${String(sunday).padStart(2, "0")}`;
  let weeklyBlocked = false;
  try {
    await createEmployeeQuotaRequest(ctx.empTenant, { requestDate: sundayLabel });
  } catch (error) {
    weeklyBlocked = error instanceof Error && error.message.includes("Weekly Day Off");
  }
  check("L6. Weekly blocks quota request", weeklyBlocked);

  // Special blocks quota approve same date
  const wed = (() => {
    for (let d = 1; d <= 28; d++) {
      if (new Date(Date.UTC(y, m, d, 12)).getUTCDay() === 3) return d;
    }
    return 3;
  })();
  const wedLabel = `${y}-${String(m + 1).padStart(2, "0")}-${String(wed).padStart(2, "0")}`;
  await grantSpecialDayOff(ctx.ownerTenant, { requestDate: wedLabel, userId: ctx.emp.id });
  const pendingQuota = await createEmployeeQuotaRequest(ctx.empTenant, {
    requestDate: `${y}-${String(m + 1).padStart(2, "0")}-${String(wed === 28 ? 27 : wed + 1).padStart(2, "0")}`,
  });
  // use a free Thursday for approve path of special conflict — recreate: special on thursday date then quota pending same
  let thu = 4;
  for (let d = 1; d <= 28; d++) {
    if (new Date(Date.UTC(y, m, d, 12)).getUTCDay() === 4) {
      thu = d;
      break;
    }
  }
  const thuLabel = `${y}-${String(m + 1).padStart(2, "0")}-${String(thu).padStart(2, "0")}`;
  await grantSpecialDayOff(ctx.ownerTenant, { requestDate: thuLabel, userId: ctx.emp.id });
  let specialBlocks = false;
  try {
    // pending won't create if approved exists — createEmployeeQuotaRequest throws
    await createEmployeeQuotaRequest(ctx.empTenant, { requestDate: thuLabel });
  } catch (error) {
    specialBlocks =
      error instanceof Error && error.message.includes("approved Day Off already exists");
  }
  check("L7. Special approved blocks another Day Off same date", specialBlocks);
  void pendingQuota;

  // Worked on Day Off + single quota return via Start Work (must use today's business date)
  const { businessDayLabel } = await import("../lib/datetime/business-timezone");
  const todayLabel = businessDayLabel(new Date());
  // skip if today is weekly Sunday for emp
  const todayWeekday = new Date().getUTCDay(); // rough; prefer business helper
  const { weekdayForBusinessInstant } = await import("../features/attendance/attendance-math");
  const todayWd = weekdayForBusinessInstant(new Date());
  if (todayWd === 0) {
    // remove sunday weekly for today test
    const { removeWeeklyDayOff } = await import("../features/day-off/prisma-repository");
    await removeWeeklyDayOff(ctx.ownerTenant, { userId: ctx.emp.id, weekday: 0 });
  }
  // ensure no approved on today
  await prisma.staffDayOffRequest.updateMany({
    data: {
      decidedAt: new Date(),
      decidedBy: ctx.owner.id,
      quotaConsumed: false,
      status: "cancelled",
    },
    where: { companyId: ctx.company.id, requestDate: new Date(todayLabel + "T00:00:00.000Z"), status: { in: ["pending", "approved"] }, userId: ctx.emp.id },
  });
  const todayReq = await createEmployeeQuotaRequest(ctx.empTenant, { requestDate: todayLabel });
  await approveDayOffRequest(ctx.ownerTenant, todayReq.id);
  const opened = await openCashSession({ openingCashLak: 1000 }, ctx.empTenant);
  const attendance = await prisma.staffAttendanceSession.findFirst({
    where: { cashSessionId: opened.id, companyId: ctx.company.id },
  });
  const refreshedReq = await prisma.staffDayOffRequest.findFirst({ where: { id: todayReq.id } });
  check(
    "L8. Start Work marks Worked on Day Off + returns quota once",
    attendance?.dayOffKind === "quota" &&
      attendance?.dayOffRequestId === todayReq.id &&
      refreshedReq?.quotaReturned === true &&
      refreshedReq?.workedMarkedAt != null,
    `kind=${attendance?.dayOffKind} req=${attendance?.dayOffRequestId} returned=${refreshedReq?.quotaReturned} today=${todayLabel}`,
  );
  void todayWeekday;

  console.log(`\nR9B live: ${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
