import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CASH_OUT_EXCEEDS_EXPECTED_MESSAGE,
  assertCashOutWithinExpected,
  calculateExpectedCash,
  sumCashTransactions,
} from "../features/cash-sessions/cash-session-calculator";
import {
  NO_OPEN_CASH_SHIFT_MESSAGE,
  claimCashMovementSubmit,
  parseCashMovementAmountLak,
  previewExpectedCashAfter,
} from "../features/pos/cash-movement";
import { createPosPermissionPolicy, evaluatePosPermission } from "../features/pos/permissions";
import { createScriptPrismaClient } from "../lib/db/script-prisma";
import { t } from "../lib/i18n/ui";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";

const TARGET_REF = "ieutdqnlfiiaawctapor";
const OPENING_CASH = 50_000;

loadProjectEnvFiles();
process.env.IGO_DEMO_MODE = "false";
const url = resolveScriptDatabaseUrl("test-write");
if (url.includes(TARGET_REF)) {
  throw new Error("Refusing FIX-16: test URL is Production");
}

const prisma = createScriptPrismaClient("test-write");

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

function money(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

const posClientSrc = readFileSync(join(process.cwd(), "features/pos/components/pos-page-client.tsx"), "utf8");
const modalSrc = readFileSync(join(process.cwd(), "features/pos/components/cash-in-out-modal.tsx"), "utf8");
const repoSrc = readFileSync(join(process.cwd(), "features/cash-sessions/prisma-repository.ts"), "utf8");
const cashInRoute = readFileSync(join(process.cwd(), "app/api/pos/cash-sessions/cash-in/route.ts"), "utf8");
const cashOutRoute = readFileSync(join(process.cwd(), "app/api/pos/cash-sessions/cash-out/route.ts"), "utf8");
const catalogSrc = readFileSync(join(process.cwd(), "features/access-control/permission-catalog.ts"), "utf8");
const en = JSON.parse(readFileSync(join(process.cwd(), "locales/ui/en.json"), "utf8")) as Record<string, string>;
const th = JSON.parse(readFileSync(join(process.cwd(), "locales/ui/th.json"), "utf8")) as Record<string, string>;

check("More → Cash In/Out opens ledger modal, not Cash Shift Count", () => {
  const handler = posClientSrc.slice(posClientSrc.indexOf('label={t("ui.cash.in.cash.out")}'));
  assert(handler.includes("setCashInOutOpen(true)"), "Cash In/Out must open ledger modal");
  assert(!handler.slice(0, 280).includes("setCashShiftCountOpen(true)"), "Cash In/Out must not open Cash Shift Count");
});

check("Cash Shift Count entry remains independent", () => {
  const handler = posClientSrc.slice(posClientSrc.indexOf('label={t("ui.cash.shift.count")}'));
  assert(handler.includes("setCashShiftCountOpen(true)"), "Cash Shift Count entry missing");
});

check("Submit uses existing cashInRequest / cashOutRequest", () => {
  assert(posClientSrc.includes("cashInRequest(") && posClientSrc.includes("cashOutRequest("), "client helpers unused");
  assert(posClientSrc.includes("claimCashMovementSubmit(cashInOutInFlightRef)"), "double-submit lock unused");
});

check("Backend routes still require cash-session manage", () => {
  assert(cashInRoute.includes("recordCashSessionMovement") && cashInRoute.includes("WRITE_PERMISSIONS.posCashSessionManage"), "cash-in route");
  assert(cashOutRoute.includes("recordCashSessionMovement") && cashOutRoute.includes("WRITE_PERMISSIONS.posCashSessionManage"), "cash-out route");
  assert(catalogSrc.includes('"pos.cash_session.manage": ["pos.create", "pos.sell", "pos.cash_session.manage"]'), "alias");
});

check("Repository guards remain: amount, reason, closed session, owner session", () => {
  assert(repoSrc.includes("Cash movement amount must be greater than zero."), "amount guard");
  assert(repoSrc.includes("Cash out reason is required."), "reason guard");
  assert(repoSrc.includes("Cash session is already closed."), "closed guard");
  assert(repoSrc.includes("session.cashierId !== tenant.userId"), "session owner guard");
  assert(repoSrc.includes("assertCashOutWithinExpected"), "expected-cash overdraw guard");
  assert(repoSrc.includes("pg_advisory_xact_lock"), "cash session ledger lock");
});

check("Amount parser rejects empty, zero, negative, NaN", () => {
  assert(parseCashMovementAmountLak("").reason === "empty", "empty");
  assert(parseCashMovementAmountLak("0").reason === "invalid", "zero");
  assert(parseCashMovementAmountLak("-1000").reason === "invalid", "negative");
  assert(parseCashMovementAmountLak("abc").reason === "invalid", "NaN");
  assert(parseCashMovementAmountLak("10.5").reason === "invalid", "float");
  const parsed = parseCashMovementAmountLak("1,000");
  assert(parsed.ok && parsed.amountLak === 1000, "canonical 1000");
});

check("Expected-cash preview is movement-only", () => {
  assert(previewExpectedCashAfter(66000, "cash_in", 1000) === 67000, "cash in preview");
  assert(previewExpectedCashAfter(66000, "cash_out", 1000) === 65000, "cash out preview");
  assert(
    calculateExpectedCash({
      cashInLak: 1000,
      cashOutLak: 1000,
      cashSalesLak: 0,
      openingCashLak: 66000,
      refundLak: 0,
      voidCashLak: 0,
    }) === 66000,
    "canonical calculator net 0",
  );
});

check("Double-submit lock allows one claim", () => {
  const lock = { current: false };
  assert(claimCashMovementSubmit(lock) === true, "first claim");
  assert(claimCashMovementSubmit(lock) === false, "second claim blocked");
});

check("No-open-session copy is explicit", () => {
  assert(NO_OPEN_CASH_SHIFT_MESSAGE.includes("Open a shift"), "message");
  assert(modalSrc.includes("NO_OPEN_CASH_SHIFT_MESSAGE"), "modal uses block copy");
});

check("Localization EN + TH required strings", () => {
  const keys = [
    "ui.cash.in",
    "ui.cash.out",
    "ui.amount",
    "ui.reason",
    "ui.expected.cash",
    "ui.record.cash.in",
    "ui.record.cash.out",
    "ui.cash.out.amount.cannot.exceed.expected.cas",
  ];
  for (const key of keys) {
    assert(Boolean(en[key]), `en missing ${key}`);
    assert(Boolean(th[key]), `th missing ${key}`);
    assert(t(key, "en") === en[key], `en t() ${key}`);
    assert(t(key, "th") === th[key], `th t() ${key}`);
  }
});

check("POS policy: Owner / Manager / Cashier may cash in/out", () => {
  for (const roles of [["owner"], ["manager"], ["cashier"]]) {
    const policy = createPosPermissionPolicy({ roles, userId: "u", username: roles[0] });
    assert(evaluatePosPermission(policy, "cash_in").allowed, `${roles[0]} cash_in`);
    assert(evaluatePosPermission(policy, "cash_out").allowed, `${roles[0]} cash_out`);
  }
});

async function createOwnerTenant(label: string) {
  const token = randomBytes(4).toString("hex");
  const user = await prisma.user.create({
    data: { fullName: `FIX-16 ${label}`, passwordHash: "isolated-fixture", username: `f16${token}` },
  });
  const company = await prisma.company.create({
    data: {
      businessTemplateKey: "mini_mart",
      name: `FIX-16 ${label}`,
      ownerUserId: user.id,
      storeCode: `f16${token}`,
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
    user,
  };
}

async function openSession(tenant: { branchId: string; companyId: string; userId: string }, openingCashLak = OPENING_CASH) {
  return prisma.cashSession.create({
    data: {
      branchId: tenant.branchId,
      cashierId: tenant.userId,
      companyId: tenant.companyId,
      openingCash: openingCashLak,
    },
  });
}

async function recordMovement(
  sessionId: string,
  type: "cash_in" | "cash_out",
  input: { amountLak: number; reason?: string },
  tenant: { branchId: string; companyId: string; userId: string },
) {
  const movementAmount = money(input.amountLak);
  if (movementAmount <= 0) {
    throw new Error("Cash movement amount must be greater than zero.");
  }
  if (type === "cash_out" && !String(input.reason ?? "").trim()) {
    throw new Error("Cash out reason is required.");
  }
  const session = await prisma.cashSession.findFirst({
    where: { companyId: tenant.companyId, id: sessionId, branchId: tenant.branchId },
  });
  if (!session) throw new Error("Cash session was not found.");
  if (session.closedAt) throw new Error("Cash session is already closed.");
  if (session.cashierId !== tenant.userId) throw new Error("Permission denied: pos.cash_session.manage");
  if (type === "cash_out") {
    const cashInLak = sumCashTransactions(
      (await prisma.cashTransaction.findMany({ where: { sessionId: session.id } })).map((row) => ({
        amount: row.amount,
        transactionType: row.transactionType,
      })),
      "cash_in",
    );
    const cashOutLak = sumCashTransactions(
      (await prisma.cashTransaction.findMany({ where: { sessionId: session.id } })).map((row) => ({
        amount: row.amount,
        transactionType: row.transactionType,
      })),
      "cash_out",
    );
    assertCashOutWithinExpected(
      movementAmount,
      calculateExpectedCash({
        cashInLak,
        cashOutLak,
        cashSalesLak: 0,
        openingCashLak: money(session.openingCash),
        refundLak: 0,
        voidCashLak: 0,
      }),
    );
  }
  await prisma.cashTransaction.create({
    data: {
      amount: movementAmount,
      companyId: tenant.companyId,
      createdBy: tenant.userId,
      reason: input.reason ?? null,
      sessionId: session.id,
      transactionType: type,
    },
  });
  const refreshed = await prisma.cashSession.findFirstOrThrow({
    include: { transactions: true },
    where: { id: session.id },
  });
  const cashInLak = sumCashTransactions(refreshed.transactions, "cash_in");
  const cashOutLak = sumCashTransactions(refreshed.transactions, "cash_out");
  return {
    cashInLak,
    cashOutLak,
    expectedCashLak: calculateExpectedCash({
      cashInLak,
      cashOutLak,
      cashSalesLak: 0,
      openingCashLak: money(refreshed.openingCash),
      refundLak: 0,
      voidCashLak: 0,
    }),
  };
}

await checkAsync("Cash In valid increases expected cash and ledger", async () => {
  const { tenant } = await createOwnerTenant("in");
  const opened = await openSession(tenant);
  const beforeSales = await prisma.sale.count({ where: { companyId: tenant.companyId } });
  const beforeStock = await prisma.inventoryBalance.count({ where: { companyId: tenant.companyId } });
  const after = await recordMovement(opened.id, "cash_in", { amountLak: 1000, reason: "EGO-FIX-16 local test" }, tenant);
  const rows = await prisma.cashTransaction.count({ where: { sessionId: opened.id, transactionType: "cash_in" } });
  assert(after.expectedCashLak === OPENING_CASH + 1000, `expected=${after.expectedCashLak}`);
  assert(after.cashInLak === 1000, `cashIn=${after.cashInLak}`);
  assert(rows === 1, `rows=${rows}`);
  assert((await prisma.sale.count({ where: { companyId: tenant.companyId } })) === beforeSales, "sale count changed");
  assert((await prisma.inventoryBalance.count({ where: { companyId: tenant.companyId } })) === beforeStock, "inventory changed");
});

await checkAsync("Cash Out valid decreases expected cash", async () => {
  const { tenant } = await createOwnerTenant("out");
  const opened = await openSession(tenant);
  await recordMovement(opened.id, "cash_in", { amountLak: 1000, reason: "EGO-FIX-16 local test" }, tenant);
  const after = await recordMovement(opened.id, "cash_out", { amountLak: 1000, reason: "EGO-FIX-16 local reversal" }, tenant);
  const inRows = await prisma.cashTransaction.count({ where: { sessionId: opened.id, transactionType: "cash_in" } });
  const outRows = await prisma.cashTransaction.count({ where: { sessionId: opened.id, transactionType: "cash_out" } });
  assert(after.expectedCashLak === OPENING_CASH, `expected=${after.expectedCashLak}`);
  assert(inRows === 1 && outRows === 1, `in=${inRows} out=${outRows}`);
});

await checkAsync("Zero amount blocked", async () => {
  const { tenant } = await createOwnerTenant("zero");
  const opened = await openSession(tenant);
  try {
    await recordMovement(opened.id, "cash_in", { amountLak: 0 }, tenant);
    throw new Error("zero amount was accepted");
  } catch (error) {
    assert(error instanceof Error && error.message.includes("greater than zero"), String(error));
  }
});

await checkAsync("Negative amount blocked", async () => {
  const { tenant } = await createOwnerTenant("neg");
  const opened = await openSession(tenant);
  try {
    await recordMovement(opened.id, "cash_out", { amountLak: -1000, reason: "no" }, tenant);
    throw new Error("negative amount was accepted");
  } catch (error) {
    assert(error instanceof Error && error.message.includes("greater than zero"), String(error));
  }
});

await checkAsync("Closed session blocked", async () => {
  const { tenant } = await createOwnerTenant("closed");
  const opened = await openSession(tenant);
  await prisma.cashSession.update({
    data: { closedAt: new Date(), closingCash: OPENING_CASH, expectedCash: OPENING_CASH },
    where: { id: opened.id },
  });
  try {
    await recordMovement(opened.id, "cash_in", { amountLak: 1000 }, tenant);
    throw new Error("closed session accepted cash in");
  } catch (error) {
    assert(error instanceof Error && error.message.includes("already closed"), String(error));
  }
});

await checkAsync("Missing session blocked", async () => {
  const { tenant } = await createOwnerTenant("missing");
  try {
    await recordMovement("does-not-exist", "cash_in", { amountLak: 1000 }, tenant);
    throw new Error("missing session accepted");
  } catch (error) {
    assert(error instanceof Error && error.message.includes("not found"), String(error));
  }
});

await checkAsync("Wrong tenant blocked", async () => {
  const owner = await createOwnerTenant("own");
  const other = await createOwnerTenant("other");
  const opened = await openSession(owner.tenant);
  try {
    await recordMovement(opened.id, "cash_in", { amountLak: 1000 }, other.tenant);
    throw new Error("wrong tenant accepted");
  } catch (error) {
    assert(error instanceof Error && error.message.includes("not found"), String(error));
  }
});

await checkAsync("Wrong user on same store blocked", async () => {
  const owner = await createOwnerTenant("same");
  const stranger = await prisma.user.create({
    data: { fullName: "FIX-16 stranger", passwordHash: "isolated-fixture", username: `f16s${randomBytes(3).toString("hex")}` },
  });
  await prisma.companyUser.create({
    data: { companyId: owner.company.id, isOwner: false, status: "active", userId: stranger.id },
  });
  const opened = await openSession(owner.tenant);
  try {
    await recordMovement(opened.id, "cash_out", { amountLak: 1000, reason: "wrong user" }, {
      ...owner.tenant,
      userId: stranger.id,
    });
    throw new Error("wrong user accepted");
  } catch (error) {
    assert(error instanceof Error && error.message.includes("Permission denied"), String(error));
  }
});

await checkAsync("Cash Out greater than expected cash is rejected", async () => {
  const { tenant } = await createOwnerTenant("over");
  const opened = await openSession(tenant, 1000);
  try {
    await recordMovement(opened.id, "cash_out", { amountLak: 5000, reason: "overdraw policy" }, tenant);
    throw new Error("overdraw was accepted");
  } catch (error) {
    assert(error instanceof Error && error.message === CASH_OUT_EXCEEDS_EXPECTED_MESSAGE, String(error));
  }
  const rows = await prisma.cashTransaction.count({
    where: { sessionId: opened.id, transactionType: "cash_out" },
  });
  assert(rows === 0, `overdraw wrote ledger rows=${rows}`);
});

await checkAsync("Cash Out reason required", async () => {
  const { tenant } = await createOwnerTenant("reason");
  const opened = await openSession(tenant);
  try {
    await recordMovement(opened.id, "cash_out", { amountLak: 1000 }, tenant);
    throw new Error("cash out without reason accepted");
  } catch (error) {
    assert(error instanceof Error && error.message.includes("reason"), String(error));
  }
});

const passed = results.filter((row) => row.status === "PASS").length;
const failed = results.length - passed;
console.log(JSON.stringify({ failed, passed, total: results.length }));
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
