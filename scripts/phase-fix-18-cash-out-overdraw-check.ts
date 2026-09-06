import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CASH_OUT_EXCEEDS_EXPECTED_MESSAGE,
  assertCashOutWithinExpected,
  calculateExpectedCash,
} from "../features/cash-sessions/cash-session-calculator";
import { cashOutExceedsExpected } from "../features/pos/cash-movement";
import { createPosPermissionPolicy, evaluatePosPermission } from "../features/pos/permissions";
import { createScriptPrismaClient } from "../lib/db/script-prisma";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";
import { t } from "../lib/i18n/ui";

const TARGET_REF = "ieutdqnlfiiaawctapor";
const OPENING = 10_000;

loadProjectEnvFiles();
process.env.IGO_DEMO_MODE = "false";
const url = resolveScriptDatabaseUrl("test-write");
if (url.includes(TARGET_REF)) {
  throw new Error("Refusing FIX-18: test URL is Production");
}

const prisma = createScriptPrismaClient("test-write");
(globalThis as unknown as { prisma?: typeof prisma }).prisma = prisma;

const {
  getOpenCashSession,
  openCashSession,
  recordCashSessionMovement,
} = await import("../features/cash-sessions/prisma-repository");
const { getOwnShiftReport } = await import("../features/reports/own-shift-report-service");
const { PermissionDeniedError } = await import("../lib/auth/permissions");

const results: Array<{ detail?: string; name: string; status: "FAIL" | "PASS" }> = [];

function check(name: string, run: () => void) {
  try {
    run();
    results.push({ name, status: "PASS" });
    console.log(`PASS  ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ detail, name, status: "FAIL" });
    console.log(`FAIL  ${name} — ${detail}`);
  }
}

async function checkAsync(name: string, run: () => Promise<void>) {
  try {
    await run();
    results.push({ name, status: "PASS" });
    console.log(`PASS  ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ detail, name, status: "FAIL" });
    console.log(`FAIL  ${name} — ${detail}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectRejected(run: () => Promise<unknown>, match: string) {
  try {
    await run();
    throw new Error(`expected reject containing "${match}"`);
  } catch (error) {
    if (error instanceof Error && error.message.includes(`expected reject containing`)) {
      throw error;
    }
    assert(error instanceof Error && error.message.includes(match), String(error));
  }
}

const repoSrc = readFileSync(join(process.cwd(), "features/cash-sessions/prisma-repository.ts"), "utf8");
const modalSrc = readFileSync(join(process.cwd(), "features/pos/components/cash-in-out-modal.tsx"), "utf8");
const cashOutRoute = readFileSync(join(process.cwd(), "app/api/pos/cash-sessions/cash-out/route.ts"), "utf8");
const en = JSON.parse(readFileSync(join(process.cwd(), "locales/ui/en.json"), "utf8")) as Record<string, string>;
const lo = JSON.parse(readFileSync(join(process.cwd(), "locales/ui/lo.json"), "utf8")) as Record<string, string>;

check("Server uses canonical calculateExpectedCash + transaction lock", () => {
  assert(repoSrc.includes("assertCashOutWithinExpected"), "missing overdraw assert");
  assert(repoSrc.includes("loadSessionTotals"), "must reuse loadSessionTotals");
  assert(repoSrc.includes("pg_advisory_xact_lock"), "missing advisory lock");
  assert(repoSrc.includes("cashSessionLedgerLockKey"), "missing session lock key");
  assert(cashOutRoute.includes("recordCashSessionMovement"), "route bypasses repository");
  assert(cashOutRoute.includes("WRITE_PERMISSIONS.posCashSessionManage"), "permission changed");
});

check("Client validates overdraw but server remains authoritative", () => {
  assert(modalSrc.includes("cashOutExceedsExpected"), "modal missing client guard");
  assert(modalSrc.includes("ui.cash.out.amount.cannot.exceed.expected.cas"), "modal missing message key");
  assert(!modalSrc.includes("disabled={submitting || !sessionOpen ||"), "must not rely only on disabled submit");
});

check("Invariant helper boundaries", () => {
  assert(!cashOutExceedsExpected(9_999, OPENING), "9999");
  assert(!cashOutExceedsExpected(OPENING, OPENING), "exact");
  assert(cashOutExceedsExpected(10_001, OPENING), "10001");
  try {
    assertCashOutWithinExpected(10_001, OPENING);
    throw new Error("helper accepted overdraw");
  } catch (error) {
    assert(error instanceof Error && error.message === CASH_OUT_EXCEEDS_EXPECTED_MESSAGE, String(error));
  }
  assert(
    calculateExpectedCash({
      cashInLak: 0,
      cashOutLak: 0,
      cashSalesLak: 0,
      openingCashLak: OPENING,
      refundLak: 0,
      voidCashLak: 0,
    }) === OPENING,
    "canonical opening",
  );
});

check("Localization EN + LO source", () => {
  const key = "ui.cash.out.amount.cannot.exceed.expected.cas";
  assert(en[key] === CASH_OUT_EXCEEDS_EXPECTED_MESSAGE, "en message");
  assert(Boolean(lo[key]) && !lo[key].includes("?"), "lo missing");
  assert(t(key, "en") === en[key], "en t()");
  assert(t(key, "th") === en[key], "legacy th t()");
  assert(t(key, "lo") === en[key], "lo stays English this phase");
});

check("POS policy aliases unchanged", () => {
  for (const roles of [["owner"], ["manager"], ["cashier"]]) {
    const policy = createPosPermissionPolicy({ roles, userId: "u", username: roles[0] });
    assert(evaluatePosPermission(policy, "cash_out").allowed, `${roles[0]} cash_out`);
    assert(evaluatePosPermission(policy, "cash_in").allowed, `${roles[0]} cash_in`);
  }
});

async function createOwnerTenant(label: string) {
  const token = randomBytes(4).toString("hex");
  const user = await prisma.user.create({
    data: { fullName: `FIX-18 ${label}`, passwordHash: "isolated-fixture", username: `f18${token}` },
  });
  const company = await prisma.company.create({
    data: {
      businessTemplateKey: "mini_mart",
      name: `FIX-18 ${label}`,
      ownerUserId: user.id,
      storeCode: `f18${token}`,
    },
  });
  const branch = await prisma.branch.create({
    data: { companyId: company.id, isMainBranch: true, name: "Main" },
  });
  const warehouse = await prisma.warehouse.create({
    data: { branchId: branch.id, companyId: company.id, name: "WH", type: "store" },
  });
  await prisma.companyUser.create({
    data: { branchId: branch.id, companyId: company.id, isOwner: true, status: "active", userId: user.id },
  });
  return {
    branch,
    company,
    tenant: {
      branchId: branch.id,
      companyId: company.id,
      userId: user.id,
      warehouseId: warehouse.id,
    },
    warehouse,
    user,
  };
}

async function cashOutRows(sessionId: string) {
  return prisma.cashTransaction.count({ where: { sessionId, transactionType: "cash_out" } });
}

async function insertSalePayment(
  tenant: { branchId: string; companyId: string; userId: string; warehouseId: string },
  input: { amountLak: number; method: "cash" | "transfer" | "qr"; saleNo: string },
) {
  const sale = await prisma.sale.create({
    data: {
      branchId: tenant.branchId,
      companyId: tenant.companyId,
      createdBy: tenant.userId,
      paymentStatus: "paid",
      saleNo: input.saleNo,
      saleStatus: "completed",
      totalAmount: input.amountLak,
      warehouseId: tenant.warehouseId,
    },
  });
  await prisma.salePayment.create({
    data: {
      amount: input.amountLak,
      paymentMethod: input.method,
      saleId: sale.id,
    },
  });
  return sale;
}

await checkAsync("Boundary: 0 and negative rejected, 9999 and 10000 pass, 10001 rejected", async () => {
  const { tenant } = await createOwnerTenant("bound");
  const opened = await openCashSession({ openingCashLak: OPENING }, tenant);
  await expectRejected(
    () => recordCashSessionMovement(opened.id, "cash_out", { amountLak: 0, reason: "zero" }, tenant),
    "greater than zero",
  );
  await expectRejected(
    () => recordCashSessionMovement(opened.id, "cash_out", { amountLak: -1, reason: "neg" }, tenant),
    "greater than zero",
  );
  const after9999 = await recordCashSessionMovement(
    opened.id,
    "cash_out",
    { amountLak: 9_999, reason: "FIX-18 9999" },
    tenant,
  );
  assert(after9999.expectedCashLak === 1, `after 9999 expected=${after9999.expectedCashLak}`);

  const over = await createOwnerTenant("over");
  const overSession = await openCashSession({ openingCashLak: OPENING }, over.tenant);
  await expectRejected(
    () => recordCashSessionMovement(overSession.id, "cash_out", { amountLak: 10_001, reason: "too much" }, over.tenant),
    CASH_OUT_EXCEEDS_EXPECTED_MESSAGE,
  );
  assert((await cashOutRows(overSession.id)) === 0, "10001 wrote a ledger row");
  const still = await getOpenCashSession(over.tenant);
  assert(still?.expectedCashLak === OPENING, `10001 changed expected=${still?.expectedCashLak}`);
});

await checkAsync("Exact 10000 Cash Out then Cash Out 1 rejected", async () => {
  const { tenant } = await createOwnerTenant("exact");
  const opened = await openCashSession({ openingCashLak: OPENING }, tenant);
  const drained = await recordCashSessionMovement(
    opened.id,
    "cash_out",
    { amountLak: OPENING, reason: "FIX-18 exact drain" },
    tenant,
  );
  assert(drained.expectedCashLak === 0, `expected=${drained.expectedCashLak}`);
  assert((await cashOutRows(opened.id)) === 1, "exact drain rows");
  await expectRejected(
    () => recordCashSessionMovement(opened.id, "cash_out", { amountLak: 1, reason: "over zero" }, tenant),
    CASH_OUT_EXCEEDS_EXPECTED_MESSAGE,
  );
  assert((await cashOutRows(opened.id)) === 1, "rejected overdraw wrote a row");
  const still = await getOpenCashSession(tenant);
  assert(still?.expectedCashLak === 0, `after reject expected=${still?.expectedCashLak}`);
});

await checkAsync("Cash In 5000 then Cash Out 15000 then Cash Out 1 rejected", async () => {
  const { tenant } = await createOwnerTenant("in");
  const opened = await openCashSession({ openingCashLak: OPENING }, tenant);
  const afterIn = await recordCashSessionMovement(opened.id, "cash_in", { amountLak: 5_000, reason: "float" }, tenant);
  assert(afterIn.expectedCashLak === 15_000, `after in=${afterIn.expectedCashLak}`);
  assert(afterIn.cashInLak === 5_000, `cashIn=${afterIn.cashInLak}`);
  const afterOut = await recordCashSessionMovement(
    opened.id,
    "cash_out",
    { amountLak: 15_000, reason: "FIX-18 full after in" },
    tenant,
  );
  assert(afterOut.expectedCashLak === 0, `after out=${afterOut.expectedCashLak}`);
  await expectRejected(
    () => recordCashSessionMovement(opened.id, "cash_out", { amountLak: 1, reason: "over" }, tenant),
    CASH_OUT_EXCEEDS_EXPECTED_MESSAGE,
  );
});

await checkAsync("Cash sale increases drawer; Cash Out cannot exceed it", async () => {
  const { tenant } = await createOwnerTenant("sale");
  const opened = await openCashSession({ openingCashLak: OPENING }, tenant);
  await insertSalePayment(tenant, { amountLak: 5_000, method: "cash", saleNo: `F18C-${randomBytes(3).toString("hex")}` });
  const afterSale = await getOpenCashSession(tenant);
  assert(afterSale?.cashSalesLak === 5_000, `cashSales=${afterSale?.cashSalesLak}`);
  assert(afterSale?.expectedCashLak === 15_000, `expected=${afterSale?.expectedCashLak}`);
  await expectRejected(
    () => recordCashSessionMovement(opened.id, "cash_out", { amountLak: 15_001, reason: "over sale" }, tenant),
    CASH_OUT_EXCEEDS_EXPECTED_MESSAGE,
  );
  const ok = await recordCashSessionMovement(
    opened.id,
    "cash_out",
    { amountLak: 15_000, reason: "FIX-18 sale drawer" },
    tenant,
  );
  assert(ok.expectedCashLak === 0, `after sale out=${ok.expectedCashLak}`);
});

await checkAsync("Non-cash sale does not increase drawer cash", async () => {
  const { tenant } = await createOwnerTenant("xfer");
  const opened = await openCashSession({ openingCashLak: OPENING }, tenant);
  await insertSalePayment(tenant, { amountLak: 8_000, method: "transfer", saleNo: `F18T-${randomBytes(3).toString("hex")}` });
  const after = await getOpenCashSession(tenant);
  assert(after?.nonCashSalesLak === 8_000, `nonCash=${after?.nonCashSalesLak}`);
  assert(after?.cashSalesLak === 0, `cashSales=${after?.cashSalesLak}`);
  assert(after?.expectedCashLak === OPENING, `expected=${after?.expectedCashLak}`);
  await expectRejected(
    () => recordCashSessionMovement(opened.id, "cash_out", { amountLak: 10_001, reason: "use transfer" }, tenant),
    CASH_OUT_EXCEEDS_EXPECTED_MESSAGE,
  );
});

await checkAsync("Refund cash lowers Expected Cash used by the guard", async () => {
  const { tenant } = await createOwnerTenant("refund");
  const opened = await openCashSession({ openingCashLak: OPENING }, tenant);
  const sale = await insertSalePayment(tenant, {
    amountLak: 5_000,
    method: "cash",
    saleNo: `F18R-${randomBytes(3).toString("hex")}`,
  });
  const beforeRefund = await getOpenCashSession(tenant);
  assert(beforeRefund?.expectedCashLak === 15_000, `before refund=${beforeRefund?.expectedCashLak}`);
  await prisma.refund.create({
    data: {
      companyId: tenant.companyId,
      createdBy: tenant.userId,
      refundAmount: 5_000,
      refundMethod: "cash",
      refundNo: `RF18-${randomBytes(3).toString("hex")}`,
      saleId: sale.id,
      totalAmount: 5_000,
    },
  });
  const afterRefund = await getOpenCashSession(tenant);
  assert(afterRefund?.expectedCashLak === OPENING, `after refund=${afterRefund?.expectedCashLak}`);
  await expectRejected(
    () => recordCashSessionMovement(opened.id, "cash_out", { amountLak: 10_001, reason: "after refund" }, tenant),
    CASH_OUT_EXCEEDS_EXPECTED_MESSAGE,
  );
});

await checkAsync("Concurrent 7000 + 7000: one succeeds, no negative drawer", async () => {
  const { tenant } = await createOwnerTenant("conc");
  const opened = await openCashSession({ openingCashLak: OPENING }, tenant);
  const settled = await Promise.allSettled([
    recordCashSessionMovement(opened.id, "cash_out", { amountLak: 7_000, reason: "FIX-18 concurrent A" }, tenant),
    recordCashSessionMovement(opened.id, "cash_out", { amountLak: 7_000, reason: "FIX-18 concurrent B" }, tenant),
  ]);
  const succeeded = settled.filter((row) => row.status === "fulfilled").length;
  const rejected = settled.filter((row) => row.status === "rejected").length;
  assert(succeeded === 1, `successful=${succeeded}`);
  assert(rejected === 1, `rejected=${rejected}`);
  const rejectedReason = settled.find((row) => row.status === "rejected");
  assert(
    rejectedReason?.status === "rejected" &&
      rejectedReason.reason instanceof Error &&
      rejectedReason.reason.message.includes(CASH_OUT_EXCEEDS_EXPECTED_MESSAGE),
    `reject reason=${rejectedReason?.status === "rejected" ? String(rejectedReason.reason) : "none"}`,
  );
  const rows = await cashOutRows(opened.id);
  assert(rows === 1, `ledger rows=${rows}`);
  const after = await getOpenCashSession(tenant);
  assert(after?.expectedCashLak === 3_000, `final expected=${after?.expectedCashLak}`);
  assert((after?.expectedCashLak ?? -1) >= 0, "negative drawer");
});

await checkAsync("Stale client 8000 after server expected dropped to 5000 is rejected", async () => {
  const { tenant } = await createOwnerTenant("stale");
  const opened = await openCashSession({ openingCashLak: OPENING }, tenant);
  const first = await recordCashSessionMovement(
    opened.id,
    "cash_out",
    { amountLak: 5_000, reason: "FIX-18 other txn" },
    tenant,
  );
  assert(first.expectedCashLak === 5_000, `server now=${first.expectedCashLak}`);
  await expectRejected(
    () => recordCashSessionMovement(opened.id, "cash_out", { amountLak: 8_000, reason: "stale client" }, tenant),
    CASH_OUT_EXCEEDS_EXPECTED_MESSAGE,
  );
  const after = await getOpenCashSession(tenant);
  assert(after?.expectedCashLak === 5_000, `stale reject changed expected=${after?.expectedCashLak}`);
  assert((await cashOutRows(opened.id)) === 1, "stale write");
});

await checkAsync("Own Shift Report records valid Cash Out once; reject writes nothing", async () => {
  const { tenant } = await createOwnerTenant("shift");
  const opened = await openCashSession({ openingCashLak: OPENING }, tenant);
  await recordCashSessionMovement(opened.id, "cash_out", { amountLak: 2_000, reason: "FIX-18 report" }, tenant);
  const report = await getOwnShiftReport(tenant);
  assert(report.cashDrawer.cashOutLak === 2_000, `report out=${report.cashDrawer.cashOutLak}`);
  assert(report.cashDrawer.expectedCashLak === 8_000, `report expected=${report.cashDrawer.expectedCashLak}`);
  const beforeRows = await cashOutRows(opened.id);
  await expectRejected(
    () => recordCashSessionMovement(opened.id, "cash_out", { amountLak: 9_000, reason: "phantom" }, tenant),
    CASH_OUT_EXCEEDS_EXPECTED_MESSAGE,
  );
  const afterReport = await getOwnShiftReport(tenant);
  assert(afterReport.cashDrawer.cashOutLak === 2_000, `phantom out=${afterReport.cashDrawer.cashOutLak}`);
  assert((await cashOutRows(opened.id)) === beforeRows, "phantom ledger");
});

await checkAsync("Cash Out does not change sales KPIs", async () => {
  const { tenant } = await createOwnerTenant("kpi");
  const opened = await openCashSession({ openingCashLak: OPENING }, tenant);
  await insertSalePayment(tenant, { amountLak: 4_000, method: "cash", saleNo: `F18K-${randomBytes(3).toString("hex")}` });
  const beforeSales = await prisma.sale.aggregate({
    _count: { _all: true },
    _sum: { discountAmount: true, profitAmount: true, totalAmount: true },
    where: { companyId: tenant.companyId },
  });
  await recordCashSessionMovement(opened.id, "cash_out", { amountLak: 1_000, reason: "FIX-18 kpi" }, tenant);
  const afterSales = await prisma.sale.aggregate({
    _count: { _all: true },
    _sum: { discountAmount: true, profitAmount: true, totalAmount: true },
    where: { companyId: tenant.companyId },
  });
  assert(afterSales._count._all === beforeSales._count._all, "sale count");
  assert(Number(afterSales._sum.totalAmount ?? 0) === Number(beforeSales._sum.totalAmount ?? 0), "sales total");
  assert(Number(afterSales._sum.discountAmount ?? 0) === Number(beforeSales._sum.discountAmount ?? 0), "discount");
  assert(Number(afterSales._sum.profitAmount ?? 0) === Number(beforeSales._sum.profitAmount ?? 0), "profit");
});

await checkAsync("Closed, missing, foreign tenant, and non-owner are blocked", async () => {
  const owner = await createOwnerTenant("sec");
  const other = await createOwnerTenant("other");
  const opened = await openCashSession({ openingCashLak: OPENING }, owner.tenant);

  await expectRejected(
    () => recordCashSessionMovement("does-not-exist", "cash_out", { amountLak: 1_000, reason: "missing" }, owner.tenant),
    "not found",
  );
  await expectRejected(
    () => recordCashSessionMovement(opened.id, "cash_out", { amountLak: 1_000, reason: "cross" }, other.tenant),
    "not found",
  );

  const stranger = await prisma.user.create({
    data: { fullName: "FIX-18 stranger", passwordHash: "isolated-fixture", username: `f18s${randomBytes(3).toString("hex")}` },
  });
  await prisma.companyUser.create({
    data: { companyId: owner.company.id, isOwner: false, status: "active", userId: stranger.id },
  });
  try {
    await recordCashSessionMovement(
      opened.id,
      "cash_out",
      { amountLak: 1_000, reason: "wrong owner" },
      { ...owner.tenant, userId: stranger.id },
    );
    throw new Error("non-owner accepted");
  } catch (error) {
    assert(error instanceof PermissionDeniedError, String(error));
  }

  await prisma.cashSession.update({
    data: { closedAt: new Date(), closingCash: OPENING, expectedCash: OPENING },
    where: { id: opened.id },
  });
  await expectRejected(
    () => recordCashSessionMovement(opened.id, "cash_out", { amountLak: 1_000, reason: "closed" }, owner.tenant),
    "already closed",
  );
});

await checkAsync("Rejected overdraw leaves no partial mutation", async () => {
  const { tenant } = await createOwnerTenant("atomic");
  const opened = await openCashSession({ openingCashLak: OPENING }, tenant);
  const beforeAudit = await prisma.auditLog.count({ where: { companyId: tenant.companyId } });
  await expectRejected(
    () => recordCashSessionMovement(opened.id, "cash_out", { amountLak: 11_000, reason: "atomic" }, tenant),
    CASH_OUT_EXCEEDS_EXPECTED_MESSAGE,
  );
  assert((await cashOutRows(opened.id)) === 0, "ledger");
  const after = await getOpenCashSession(tenant);
  assert(after?.expectedCashLak === OPENING, `expected=${after?.expectedCashLak}`);
  const afterAudit = await prisma.auditLog.count({ where: { companyId: tenant.companyId } });
  assert(afterAudit === beforeAudit, `audit grew ${beforeAudit} -> ${afterAudit}`);
});

const passed = results.filter((row) => row.status === "PASS").length;
const failed = results.length - passed;
console.log(JSON.stringify({ failed, passed, total: results.length }));
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
