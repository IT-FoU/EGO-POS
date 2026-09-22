/**
 * REPORTS R7B — Cash Shift Count + Cash In/Out.
 * Reuses R7A / Batch H / STEP9 calculators. Does not change write paths.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { canViewFullStoreReports } from "../features/permissions/store-ui-permissions";
import { writeCompletePrismaSale, type CompletePrismaSaleInput } from "../features/pos/prisma-repository";
import type { PaymentMode } from "../features/pos/types";
import { writePrismaProductCreate } from "../features/products/prisma-repository";
import { canViewBranchShiftReports } from "../features/reports/own-shift-report-access";
import {
  findReportCenterEntryByHref,
  isPlannedReportCenterEntry,
} from "../features/reports/report-center-catalog";
import {
  countedMinusExpected,
  deriveVarianceKind,
  summarizeCashCountRows,
  summarizeCashMovements,
} from "../features/reports/cash-report-math";
import { parseCashCountTableQuery, parseCashMovementTableQuery } from "../features/reports/cash-report-query";
import {
  loadCashCountDetail,
  loadCashCountTable,
  loadCashMovementTable,
} from "../features/reports/cash-report-repository";
import { loadShiftSummaryTable } from "../features/reports/shift-table-repository";
import { parseShiftTableQuery } from "../features/reports/shift-table-query";
import {
  reportsCopyHasNoReplacementChars,
  reportsCopyKeyParity,
  tReports,
} from "../lib/i18n/reports-copy";
import type { TenantContext } from "../lib/db/write-context";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";

const ROOT = process.cwd();
const thaiScript = /[\u0E00-\u0E7F]/;
const TX_OPTS = { maxWait: 20_000, timeout: 180_000 } as const;
const OPENING_CASH = 100_000;

class RollbackError extends Error {
  constructor() {
    super("R7B isolated fixture rollback");
    this.name = "RollbackError";
  }
}

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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const r7bKeys = [
  "totalCounts",
  "expectedCash",
  "totalOver",
  "totalShort",
  "countedBy",
  "countedAt",
  "countDateTime",
  "cashCountDetail",
  "denomination",
  "amount",
  "emptyCashCountTable",
  "errorCashCountTable",
  "loadingCashCountTable",
  "totalMovements",
  "cashInTransactions",
  "cashOutTransactions",
  "totalCashIn",
  "totalCashOut",
  "netCashMovement",
  "actor",
  "noLinkedShift",
  "cashMovementDetail",
  "emptyCashMovementTable",
  "errorCashMovementTable",
  "loadingCashMovementTable",
];

check("1. EN/LO reports copy key parity", reportsCopyKeyParity());
check("2. Lao reports copy has no replacement chars", reportsCopyHasNoReplacementChars());
check(
  "3. R7B EN/LO keys present",
  r7bKeys.every((key) => Boolean(tReports(key, "en")) && Boolean(tReports(key, "lo"))),
);
check(
  "4. R7B Lao keys use Lao script (no Thai)",
  r7bKeys.every((key) => {
    const value = tReports(key, "lo");
    return /[\u0E80-\u0EFF]/.test(value) && !thaiScript.test(value);
  }),
);

const files = [
  "features/reports/cash-report-math.ts",
  "features/reports/cash-report-query.ts",
  "features/reports/cash-report-repository.ts",
  "features/reports/cash-report-excel.ts",
  "features/reports/cash-report-service.ts",
  "features/reports/components/cash-report-views.tsx",
  "app/(dashboard)/reports/shifts/cash-counts/page.tsx",
  "app/(dashboard)/reports/shifts/cash-movements/page.tsx",
  "app/api/reports/shifts/cash-counts/export/route.ts",
  "app/api/reports/shifts/cash-movements/export/route.ts",
];
check("5. R7B stack files exist", files.every((path) => existsSync(join(ROOT, path))));

const countEntry = findReportCenterEntryByHref("/reports/shifts/cash-counts");
const moveEntry = findReportCenterEntryByHref("/reports/shifts/cash-movements");
check("6. Cash Shift Count route live", Boolean(countEntry) && !isPlannedReportCenterEntry(countEntry!));
check("7. Cash In/Out route live", Boolean(moveEntry) && !isPlannedReportCenterEntry(moveEntry!));

const ui = read("features/reports/components/cash-report-views.tsx");
const excel = read("features/reports/cash-report-excel.ts");
const service = read("features/reports/cash-report-service.ts");
check(
  "8. Spreadsheet style + Excel filenames",
  ui.includes("border-zinc-300") &&
    ui.includes("overflow-x-auto") &&
    excel.includes("EGO-POS-Cash-Shift-Count") &&
    excel.includes("EGO-POS-Cash-In-Out"),
);
check("9. Read-only UI (no write mutations)", !ui.includes("method: \"POST\"") && !ui.includes("closeCashSession"));
check(
  "10. Owner/Manager only via REPORTS_VIEW_FULL",
  service.includes("canViewBranchShiftReports") &&
    !canViewFullStoreReports(["cashier"]) &&
    canViewBranchShiftReports("owner") &&
    canViewBranchShiftReports("manager") &&
    !canViewBranchShiftReports("cashier"),
);

{
  check("11. Variance sign preserved", countedMinusExpected(110, 100) === 10 && countedMinusExpected(90, 100) === -10);
  check("12. Variance kinds", deriveVarianceKind(0) === "balanced" && deriveVarianceKind(1) === "over" && deriveVarianceKind(-1) === "short");
  const countSummary = summarizeCashCountRows([
    { countedCashLak: 100, expectedCashLak: 100, varianceKind: "balanced", varianceLak: 0 },
    { countedCashLak: 120, expectedCashLak: 100, varianceKind: "over", varianceLak: 20 },
    { countedCashLak: 80, expectedCashLak: 100, varianceKind: "short", varianceLak: -20 },
  ]);
  check(
    "13. Count summary Over/Short totals",
    countSummary.totalOverLak === 20 &&
      countSummary.totalShortLak === 20 &&
      countSummary.totalVarianceLak === 0 &&
      countSummary.balancedCounts === 1,
  );
  const moveSummary = summarizeCashMovements([
    { amountLak: 5000, type: "cash_in" },
    { amountLak: 2000, type: "cash_out" },
    { amountLak: 1000, type: "cash_in" },
  ]);
  check(
    "14. Net Cash Movement = In - Out",
    moveSummary.cashInLak === 6000 && moveSummary.cashOutLak === 2000 && moveSummary.netMovementLak === 4000,
  );
  const cq = parseCashCountTableQuery({ datePreset: "this_week", varianceStatus: "over" }, { datePreset: "today" });
  const mq = parseCashMovementTableQuery({ datePreset: "this_month", type: "cash_out", reason: "petty" }, { datePreset: "today" });
  check("15. Query parsers", cq.varianceStatus === "over" && mq.type === "cash_out" && mq.reasonQuery === "petty");
}

check(
  "16. Multiple-count model = one closing count per CashSession",
  read("features/reports/cash-report-repository.ts").includes("One closing count per CashSession"),
);

loadProjectEnvFiles();
process.env.IGO_DEMO_MODE = "false";

type Tx = any;

async function createIsolatedTenant(tx: Tx, label: string) {
  const token = randomBytes(6).toString("hex");
  const user = await tx.user.create({
    data: { fullName: `R7B ${label}`, passwordHash: "isolated-fixture", username: `r7bu${token}` },
  });
  const company = await tx.company.create({
    data: { businessTemplateKey: "mini-mart", name: `R7B ${label}`, ownerUserId: user.id, storeCode: `r7b${token}` },
  });
  const branch = await tx.branch.create({
    data: { companyId: company.id, isMainBranch: true, name: "Main" },
  });
  const warehouse = await tx.warehouse.create({
    data: { branchId: branch.id, companyId: company.id, name: "WH-A", type: "store" },
  });
  await tx.companyUser.create({
    data: { branchId: branch.id, companyId: company.id, isOwner: true, status: "active", userId: user.id },
  });
  const session = await tx.cashSession.create({
    data: { branchId: branch.id, cashierId: user.id, companyId: company.id, openingCash: OPENING_CASH },
  });
  const tenant: TenantContext = {
    branchId: branch.id,
    companyId: company.id,
    userId: user.id,
    warehouseId: warehouse.id,
  };
  return { session, tenant, warehouseId: warehouse.id };
}

function pieceInput(nameEn: string, price: number, sku: string, barcode: string) {
  return {
    barcode,
    costPriceLak: Math.round(price * 0.6),
    nameEn,
    nameLo: nameEn,
    sellingPriceLak: price,
    sku,
    units: [
      {
        barcode,
        conversionQty: 1,
        costPriceLak: Math.round(price * 0.6),
        isBaseUnit: true,
        isDefaultSaleUnit: true,
        isPurchaseUnit: true,
        sellingPriceLak: price,
        unitName: "Piece",
      },
    ],
  };
}

async function seedStore(tx: Tx) {
  const ctx = await createIsolatedTenant(tx, "cash");
  const productA = await writePrismaProductCreate(tx, pieceInput("EGO R7B Alpha", 10000, "R7B-A", "0811111111111"), ctx.tenant);
  await tx.inventoryBalance.upsert({
    create: { companyId: ctx.tenant.companyId, productId: productA.id, quantity: 80, warehouseId: ctx.warehouseId },
    update: { quantity: 80 },
    where: { warehouseId_productId: { productId: productA.id, warehouseId: ctx.warehouseId } },
  });
  const unitA = productA.units.find((unit: { isBaseUnit: boolean }) => unit.isBaseUnit) ?? productA.units[0];
  return { ...ctx, productA, unitA };
}

async function sell(tx: Tx, seed: Awaited<ReturnType<typeof seedStore>>, totalAmount: number) {
  const input: CompletePrismaSaleInput = {
    branchId: seed.tenant.branchId ?? "",
    cardAmount: 0,
    cashAmount: totalAmount,
    changeAmount: 0,
    discountAmount: 0,
    discountPercent: 0,
    items: [{ productId: seed.productA.id, quantity: 1, sellingPrice: totalAmount, unitId: seed.unitA.id }],
    paymentMode: "cash" as PaymentMode,
    qrAmount: 0,
    saleNo: "",
    taxAmount: 0,
    taxRate: 0,
    totalAmount,
    transferAmount: 0,
    warehouseId: seed.tenant.warehouseId ?? "",
  };
  return writeCompletePrismaSale(tx, input, seed.tenant);
}

async function main() {
  const url = resolveScriptDatabaseUrl("test-write");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  async function isolated(name: string, run: (tx: Tx) => Promise<void>) {
    try {
      await prisma.$transaction(async (tx) => {
        await run(tx);
        throw new RollbackError();
      }, TX_OPTS);
      check(name, false, "expected rollback");
    } catch (error) {
      if (error instanceof RollbackError) {
        check(name, true);
        return;
      }
      failed += 1;
      console.error(`FAIL: ${name} — ${(error as Error).message}`);
      process.exitCode = 1;
    }
  }

  await isolated("17. Open shift without final count", async (tx) => {
    const seed = await seedStore(tx);
    await sell(tx, seed, 10_000);
    const query = parseCashCountTableQuery({ datePreset: "this_month", status: "open" }, { datePreset: "this_month" });
    const table = await loadCashCountTable(seed.tenant, query, tx);
    const row = table.rows.find((item) => item.id === seed.session.id);
    assert(row, "open row");
    assert(row.countedCashLak == null && row.varianceLak == null, "no fake count");
    assert(row.expectedCashLak === OPENING_CASH + 10_000, `expected=${row.expectedCashLak}`);
  });

  await isolated("18. Balanced / over / short + denomination + R7A reconcile", async (tx) => {
    const seed = await seedStore(tx);
    await sell(tx, seed, 10_000);
    const expected = OPENING_CASH + 10_000;
    await tx.cashSession.update({
      data: {
        cashDifference: 0,
        closedAt: new Date(),
        closingCash: expected,
        countBreakdown: { closing: { "50000": 2, "10000": 1 } },
        expectedCash: expected,
      },
      where: { id: seed.session.id },
    });
    await tx.cashSession.create({
      data: {
        branchId: seed.tenant.branchId,
        cashDifference: 5_000,
        cashierId: seed.tenant.userId,
        closedAt: new Date(),
        closingCash: expected + 5_000,
        companyId: seed.tenant.companyId,
        expectedCash: expected,
        openedAt: new Date(Date.now() - 3_600_000),
        openingCash: OPENING_CASH,
      },
    });
    await tx.cashSession.create({
      data: {
        branchId: seed.tenant.branchId,
        cashDifference: -2_000,
        cashierId: seed.tenant.userId,
        closedAt: new Date(),
        closingCash: expected - 2_000,
        companyId: seed.tenant.companyId,
        expectedCash: expected,
        openedAt: new Date(Date.now() - 7_200_000),
        openingCash: OPENING_CASH,
      },
    });

    const query = parseCashCountTableQuery({ datePreset: "this_month", status: "closed" }, { datePreset: "this_month" });
    const table = await loadCashCountTable(seed.tenant, query, tx);
    assert(table.rows.some((row) => row.varianceKind === "balanced"), "balanced");
    assert(table.rows.some((row) => row.varianceKind === "over" && row.varianceLak === 5_000), "over");
    assert(table.rows.some((row) => row.varianceKind === "short" && row.varianceLak === -2_000), "short");

    const detail = await loadCashCountDetail(seed.tenant, seed.session.id, tx);
    assert(detail?.countBreakdown?.closing?.["50000"] === 2, "denomination");

    const r7a = await loadShiftSummaryTable(
      seed.tenant,
      parseShiftTableQuery({ datePreset: "this_month", status: "closed" }, { datePreset: "this_month" }),
      tx,
    );
    assert(Math.abs(table.summary.expectedCashLak - r7a.summary.expectedDrawerLak) < 1, "expected vs R7A");
    assert(Math.abs(table.summary.countedCashLak - r7a.summary.countedCashLak) < 1, "counted vs R7A");
    assert(Math.abs(table.summary.totalVarianceLak - r7a.summary.totalVarianceLak) < 1, "variance vs R7A");
  });

  await isolated("19. Historical count without breakdown", async (tx) => {
    const seed = await seedStore(tx);
    await tx.cashSession.update({
      data: {
        cashDifference: 0,
        closedAt: new Date(),
        closingCash: OPENING_CASH,
        expectedCash: OPENING_CASH,
      },
      where: { id: seed.session.id },
    });
    const detail = await loadCashCountDetail(seed.tenant, seed.session.id, tx);
    assert(detail?.countBreakdown == null || !detail.countBreakdown?.closing, "no breakdown");
  });

  await isolated("20. Cash in/out net + R7A reconcile + session linkage", async (tx) => {
    const seed = await seedStore(tx);
    await tx.cashTransaction.create({
      data: {
        amount: 5_000,
        companyId: seed.tenant.companyId,
        createdBy: seed.tenant.userId,
        reason: "float top-up",
        sessionId: seed.session.id,
        transactionType: "cash_in",
      },
    });
    await tx.cashTransaction.create({
      data: {
        amount: 2_000,
        companyId: seed.tenant.companyId,
        createdBy: seed.tenant.userId,
        reason: "petty cash",
        sessionId: seed.session.id,
        transactionType: "cash_out",
      },
    });
    await tx.cashTransaction.create({
      data: {
        amount: 1_000,
        companyId: seed.tenant.companyId,
        createdBy: seed.tenant.userId,
        reason: "float top-up",
        sessionId: seed.session.id,
        transactionType: "cash_in",
      },
    });

    const query = parseCashMovementTableQuery({ datePreset: "this_month" }, { datePreset: "this_month" });
    const table = await loadCashMovementTable(seed.tenant, query, tx);
    assert(table.summary.cashInLak === 6_000, `in=${table.summary.cashInLak}`);
    assert(table.summary.cashOutLak === 2_000, `out=${table.summary.cashOutLak}`);
    assert(table.summary.netMovementLak === 4_000, `net=${table.summary.netMovementLak}`);
    assert(table.rows.every((row) => row.sessionId === seed.session.id), "session linked");
    assert(table.rows.some((row) => row.reason === "petty cash"), "reason preserved");

    const r7a = await loadShiftSummaryTable(
      seed.tenant,
      parseShiftTableQuery({ datePreset: "this_month" }, { datePreset: "this_month" }),
      tx,
    );
    const shift = r7a.rows.find((row) => row.id === seed.session.id);
    assert(shift, "r7a shift");
    assert(shift.cashInLak === 6_000 && shift.cashOutLak === 2_000, "R7A cash in/out match");
  });

  await prisma.$disconnect();
  console.log(`\nR7B result: ${passed} passed, ${failed} failed`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
