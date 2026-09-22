/**
 * REPORTS R7A — Shift Summary + Own Shift History.
 * Reuses Batch H / STEP9 cash-session calculator. Does not change write paths.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  calculateExpectedCash,
  calculateVariance,
} from "../features/cash-sessions/cash-session-calculator";
import { canViewFullStoreReports } from "../features/permissions/store-ui-permissions";
import { writeCompletePrismaSale, type CompletePrismaSaleInput } from "../features/pos/prisma-repository";
import { writeVoidPrismaSale } from "../features/pos/post-sale-repository";
import { writeReturnPrismaSale } from "../features/pos/return-repository";
import type { PaymentMode } from "../features/pos/types";
import { writePrismaProductCreate } from "../features/products/prisma-repository";
import {
  canAccessOwnShiftReport,
  canViewBranchShiftReports,
} from "../features/reports/own-shift-report-access";
import {
  findReportCenterEntryByHref,
  isPlannedReportCenterEntry,
} from "../features/reports/report-center-catalog";
import {
  resolveShiftVariance,
  summarizeShiftRows,
} from "../features/reports/shift-table-math";
import { parseShiftTableQuery } from "../features/reports/shift-table-query";
import {
  loadOwnShiftHistoryTable,
  loadShiftDetail,
  loadShiftSummaryTable,
} from "../features/reports/shift-table-repository";
import {
  reportsCopyHasNoReplacementChars,
  reportsCopyKeyParity,
  tReports,
} from "../lib/i18n/reports-copy";
import { posCopyKeyParity } from "../lib/i18n/pos-copy";
import type { TenantContext } from "../lib/db/write-context";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";

const ROOT = process.cwd();
const thaiScript = /[\u0E00-\u0E7F]/;
const TX_OPTS = { maxWait: 20_000, timeout: 180_000 } as const;
const OPENING_CASH = 100_000;

class RollbackError extends Error {
  constructor() {
    super("R7A isolated fixture rollback");
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

function money(value: unknown) {
  return Math.round(Number(value ?? 0));
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const r7aKeys = [
  "myShifts",
  "totalShifts",
  "openShifts",
  "closedShifts",
  "openingCash",
  "grossCashSales",
  "cashVoids",
  "cashIn",
  "cashOut",
  "expectedDrawer",
  "countedCash",
  "variance",
  "totalVariance",
  "varianceBalanced",
  "varianceOver",
  "varianceShort",
  "shiftStatusOpen",
  "shiftStatusClosed",
  "openedAt",
  "closedAt",
  "terminal",
  "shiftSession",
  "shiftDetail",
  "denominationBreakdown",
  "noDenominationBreakdown",
  "cashMovementHistory",
  "varianceStatus",
  "allVarianceStatuses",
  "sessionSearch",
  "emptyShiftTable",
  "errorShiftTable",
  "loadingShiftTable",
  "shiftSummary",
  "ownShiftHistory",
];

check("1. EN/LO reports copy key parity", reportsCopyKeyParity());
check("2. Lao reports copy has no replacement chars", reportsCopyHasNoReplacementChars());
check("3. POS copy key parity", posCopyKeyParity());
check(
  "4. R7A EN/LO keys present",
  r7aKeys.every((key) => Boolean(tReports(key, "en")) && Boolean(tReports(key, "lo"))),
);
check(
  "5. R7A Lao keys use Lao script (no Thai)",
  r7aKeys.every((key) => {
    const value = tReports(key, "lo");
    return /[\u0E80-\u0EFF]/.test(value) && !thaiScript.test(value);
  }),
);

const files = [
  "features/reports/shift-table-math.ts",
  "features/reports/shift-table-query.ts",
  "features/reports/shift-table-repository.ts",
  "features/reports/shift-table-excel.ts",
  "features/reports/shift-table-service.ts",
  "features/reports/components/shift-table-report.tsx",
  "app/(dashboard)/reports/shifts/summary/page.tsx",
  "app/(dashboard)/reports/shifts/own-history/page.tsx",
  "app/api/reports/shifts/summary/export/route.ts",
  "app/api/reports/shifts/own-history/export/route.ts",
  "app/api/reports/shifts/[id]/route.ts",
];
check(
  "6. R7A stack files exist",
  files.every((path) => existsSync(join(ROOT, path))),
);

const summaryEntry = findReportCenterEntryByHref("/reports/shifts/summary");
const ownEntry = findReportCenterEntryByHref("/reports/shifts/own-history");
const cashCountEntry = findReportCenterEntryByHref("/reports/shifts/cash-count");
check("7. Shift Summary not planned", Boolean(summaryEntry) && !isPlannedReportCenterEntry(summaryEntry!));
check("8. Own Shift History not planned", Boolean(ownEntry) && !isPlannedReportCenterEntry(ownEntry!));
check("9. Cash Shift Count remains planned (R7B)", Boolean(cashCountEntry) && isPlannedReportCenterEntry(cashCountEntry!));
const cashInOutEntry = findReportCenterEntryByHref("/reports/shifts/cash-in-out");
check("9b. Cash In/Out remains planned", Boolean(cashInOutEntry) && isPlannedReportCenterEntry(cashInOutEntry!));

const layout = read("app/(dashboard)/reports/layout.tsx");
const middleware = read("middleware.ts");
const service = read("features/reports/shift-table-service.ts");
const repository = read("features/reports/shift-table-repository.ts");
const ui = read("features/reports/components/shift-table-report.tsx");
const excel = read("features/reports/shift-table-excel.ts");
const drawer = read("features/pos/components/own-shift-report-drawer.tsx");

check(
  "10. Surgical Own Shift History layout gate",
  layout.includes("/reports/shifts/own-history") &&
    layout.includes("canAccessOwnShiftReport") &&
    layout.includes("canViewFullStoreReports"),
);
check(
  "11. Middleware injects x-igo-pathname for reports",
  middleware.includes("x-igo-pathname") && middleware.includes("/reports/:path*"),
);
check(
  "12. Own history forces tenant.userId",
  repository.includes("ownUserId: tenant.userId") && service.includes("delete (query as { cashierId?: string }).cashierId"),
);
check(
  "13. Summary requires view_full; own requires view_own_shift",
  service.includes("canViewBranchShiftReports") && service.includes("canAccessOwnShiftReport"),
);
check(
  "14. Excel filenames + money numeric",
  excel.includes("EGO-POS-Shift-Summary") &&
    excel.includes("EGO-POS-Own-Shift-History") &&
    excel.includes('kind: "money"'),
);
check(
  "15. UI read-only (no mutation writes)",
  !ui.includes("method: \"POST\"") && !ui.includes("closeCashSession") && !ui.includes("writeVoid"),
);
check(
  "16. POS Own Shift links to Own Shift History",
  drawer.includes("/reports/shifts/own-history"),
);
check(
  "17. Permission: cashier full reports denied; own-shift allowed",
  !canViewFullStoreReports(["cashier"]) &&
    canAccessOwnShiftReport("cashier") &&
    !canViewBranchShiftReports("cashier") &&
    canViewBranchShiftReports("owner") &&
    canViewBranchShiftReports("manager"),
);

{
  const expected = calculateExpectedCash({
    openingCashLak: 100_000,
    cashSalesLak: 50_000,
    cashInLak: 10_000,
    cashOutLak: 5_000,
    refundLak: 8_000,
    voidCashLak: 7_000,
  });
  check("18. Expected drawer equation", expected === 100_000 + 50_000 + 10_000 - 5_000 - 8_000 - 7_000);

  const openVar = resolveShiftVariance({
    closedAt: null,
    countedCashLak: null,
    expectedCashLak: expected,
    persistedVarianceLak: null,
  });
  check("19. Open shift variance is null/open", openVar.kind === "open" && openVar.varianceLak == null);

  const balanced = resolveShiftVariance({
    closedAt: new Date(),
    countedCashLak: expected,
    expectedCashLak: expected,
    persistedVarianceLak: 0,
  });
  check("20. Balanced variance", balanced.kind === "balanced" && balanced.varianceLak === 0);

  const over = resolveShiftVariance({
    closedAt: new Date(),
    countedCashLak: expected + 1000,
    expectedCashLak: expected,
    persistedVarianceLak: 1000,
  });
  check("21. Over variance keeps positive sign", over.kind === "over" && over.varianceLak === 1000);

  const short = resolveShiftVariance({
    closedAt: new Date(),
    countedCashLak: expected - 2000,
    expectedCashLak: expected,
    persistedVarianceLak: -2000,
  });
  check("22. Short variance keeps negative sign", short.kind === "short" && short.varianceLak === -2000);
  check("23. Variance = counted - expected", calculateVariance(expected + 500, expected) === 500);

  const query = parseShiftTableQuery(
    { datePreset: "this_week", status: "closed", varianceStatus: "short", q: "sess" },
    { datePreset: "today" },
  );
  check(
    "24. Query presets + filters",
    query.datePreset === "this_week" &&
      query.status === "closed" &&
      query.varianceStatus === "short" &&
      query.sessionQuery === "sess",
  );

  const summary = summarizeShiftRows([
    {
      cashInLak: 1000,
      cashOutLak: 200,
      cashRefundsLak: 300,
      cashVoidsLak: 400,
      countedCashLak: 10_000,
      expectedDrawerLak: 9_000,
      grossCashSalesLak: 5_000,
      openingCashLak: 8_000,
      status: "closed",
      varianceLak: 1_000,
    },
    {
      cashInLak: 0,
      cashOutLak: 0,
      cashRefundsLak: 0,
      cashVoidsLak: 0,
      countedCashLak: null,
      expectedDrawerLak: 8_000,
      grossCashSalesLak: 0,
      openingCashLak: 8_000,
      status: "open",
      varianceLak: null,
    },
  ]);
  check(
    "25. Summary aggregates open/closed + variance without inventing open counted",
    summary.totalShifts === 2 &&
      summary.openShifts === 1 &&
      summary.closedShifts === 1 &&
      summary.countedCashLak === 10_000 &&
      summary.totalVarianceLak === 1_000 &&
      summary.grossCashSalesLak === 5_000,
  );
}

loadProjectEnvFiles();
process.env.IGO_DEMO_MODE = "false";

type Tx = any;

async function createIsolatedTenant(tx: Tx, label: string, opts?: { isOwner?: boolean }) {
  const token = randomBytes(6).toString("hex");
  const user = await tx.user.create({
    data: { fullName: `R7A ${label}`, passwordHash: "isolated-fixture", username: `r7au${token}` },
  });
  const company = await tx.company.create({
    data: { businessTemplateKey: "mini-mart", name: `R7A ${label}`, ownerUserId: user.id, storeCode: `r7a${token}` },
  });
  const branch = await tx.branch.create({
    data: { companyId: company.id, isMainBranch: true, name: "Main" },
  });
  const warehouse = await tx.warehouse.create({
    data: { branchId: branch.id, companyId: company.id, name: "WH-A", type: "store" },
  });
  await tx.companyUser.create({
    data: {
      branchId: branch.id,
      companyId: company.id,
      isOwner: opts?.isOwner !== false,
      status: "active",
      userId: user.id,
    },
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
  return { branch, company, session, tenant, user, warehouseId: warehouse.id };
}

async function addCashier(tx: Tx, companyId: string, branchId: string, label: string) {
  const token = randomBytes(6).toString("hex");
  const user = await tx.user.create({
    data: { fullName: `R7A Cashier ${label}`, passwordHash: "isolated-fixture", username: `r7ac${token}` },
  });
  await tx.companyUser.create({
    data: { branchId, companyId, isOwner: false, status: "active", userId: user.id },
  });
  return user;
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
  const ctx = await createIsolatedTenant(tx, "shifts");
  const productA = await writePrismaProductCreate(tx, pieceInput("EGO R7A Alpha", 10000, "R7A-A", "0711111111111"), ctx.tenant);
  const productB = await writePrismaProductCreate(tx, pieceInput("EGO R7A Bravo", 5000, "R7A-B", "0722222222222"), ctx.tenant);
  await tx.inventoryBalance.upsert({
    create: { companyId: ctx.tenant.companyId, productId: productA.id, quantity: 80, warehouseId: ctx.warehouseId },
    update: { quantity: 80 },
    where: { warehouseId_productId: { productId: productA.id, warehouseId: ctx.warehouseId } },
  });
  await tx.inventoryBalance.upsert({
    create: { companyId: ctx.tenant.companyId, productId: productB.id, quantity: 80, warehouseId: ctx.warehouseId },
    update: { quantity: 80 },
    where: { warehouseId_productId: { productId: productB.id, warehouseId: ctx.warehouseId } },
  });
  const unitA = productA.units.find((unit: { isBaseUnit: boolean }) => unit.isBaseUnit) ?? productA.units[0];
  const unitB = productB.units.find((unit: { isBaseUnit: boolean }) => unit.isBaseUnit) ?? productB.units[0];
  return { ...ctx, productA, productB, unitA, unitB };
}

function checkoutInput(
  tenant: TenantContext,
  items: Array<{ productId: string; quantity: number; sellingPrice: number; unitId?: string }>,
  payment: {
    paymentMode: PaymentMode;
    totalAmount: number;
    cashAmount?: number;
    cardAmount?: number;
    qrAmount?: number;
    transferAmount?: number;
  },
): CompletePrismaSaleInput {
  return {
    branchId: tenant.branchId ?? "",
    cardAmount: payment.cardAmount ?? 0,
    cashAmount: payment.cashAmount ?? (payment.paymentMode === "cash" ? payment.totalAmount : 0),
    changeAmount: 0,
    discountAmount: 0,
    discountPercent: 0,
    items: items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      sellingPrice: item.sellingPrice,
      unitId: item.unitId,
    })),
    paymentMode: payment.paymentMode,
    qrAmount: payment.qrAmount ?? 0,
    saleNo: "",
    taxAmount: 0,
    taxRate: 0,
    totalAmount: payment.totalAmount,
    transferAmount: payment.transferAmount ?? 0,
    warehouseId: tenant.warehouseId ?? "",
  };
}

async function sell(
  tx: Tx,
  seed: Awaited<ReturnType<typeof seedStore>>,
  payment: {
    paymentMode: PaymentMode;
    totalAmount: number;
    cashAmount?: number;
    qrAmount?: number;
    transferAmount?: number;
    cardAmount?: number;
  },
  qty = 1,
  product: "A" | "B" = "A",
  tenantOverride?: TenantContext,
) {
  const productRow = product === "A" ? seed.productA : seed.productB;
  const unit = product === "A" ? seed.unitA : seed.unitB;
  const price = product === "A" ? 10000 : 5000;
  const tenant = tenantOverride ?? seed.tenant;
  return writeCompletePrismaSale(
    tx,
    checkoutInput(
      tenant,
      [{ productId: productRow.id, quantity: qty, sellingPrice: price, unitId: unit.id }],
      payment,
    ),
    tenant,
  );
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

  await isolated("26. Open shift: no fake closed/count/variance; expected live", async (tx) => {
    const seed = await seedStore(tx);
    await sell(tx, seed, { paymentMode: "cash", totalAmount: 10_000, cashAmount: 10_000 });
    const query = parseShiftTableQuery({ datePreset: "this_month" }, { datePreset: "this_month" });
    const table = await loadShiftSummaryTable(seed.tenant, query, tx);
    const row = table.rows.find((item) => item.id === seed.session.id);
    assert(row, "open session row");
    assert(row.status === "open", "status open");
    assert(row.closedAt == null, "closedAt null");
    assert(row.countedCashLak == null, "counted null");
    assert(row.varianceLak == null, "variance null");
    assert(row.grossCashSalesLak === 10_000, `gross=${row.grossCashSalesLak}`);
    assert(row.expectedDrawerLak === OPENING_CASH + 10_000, `expected=${row.expectedDrawerLak}`);
  });

  await isolated("27. Closed balanced / over / short + denomination", async (tx) => {
    const seed = await seedStore(tx);
    await sell(tx, seed, { paymentMode: "cash", totalAmount: 10_000, cashAmount: 10_000 });
    const expected = OPENING_CASH + 10_000;
    const breakdown = { closing: { "50000": 2, "10000": 1 } };
    await tx.cashSession.update({
      data: {
        cashDifference: 0,
        closedAt: new Date(),
        closingCash: expected,
        countBreakdown: breakdown,
        expectedCash: expected,
      },
      where: { id: seed.session.id },
    });

    const overSession = await tx.cashSession.create({
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
    const shortSession = await tx.cashSession.create({
      data: {
        branchId: seed.tenant.branchId,
        cashDifference: -3_000,
        cashierId: seed.tenant.userId,
        closedAt: new Date(),
        closingCash: expected - 3_000,
        companyId: seed.tenant.companyId,
        expectedCash: expected,
        openedAt: new Date(Date.now() - 7_200_000),
        openingCash: OPENING_CASH,
      },
    });

    const query = parseShiftTableQuery({ datePreset: "this_month", status: "closed" }, { datePreset: "this_month" });
    const table = await loadShiftSummaryTable(seed.tenant, query, tx);
    const balanced = table.rows.find((row) => row.id === seed.session.id);
    const over = table.rows.find((row) => row.id === overSession.id);
    const short = table.rows.find((row) => row.id === shortSession.id);
    assert(balanced?.varianceKind === "balanced" && balanced.varianceLak === 0, "balanced");
    assert(over?.varianceKind === "over" && over.varianceLak === 5_000, "over");
    assert(short?.varianceKind === "short" && short.varianceLak === -3_000, "short keeps negative");

    const detail = await loadShiftDetail(seed.tenant, seed.session.id, undefined, tx);
    assert(detail?.countBreakdown?.closing?.["50000"] === 2, "denomination qty");
    assert(detail?.countBreakdown?.closing?.["10000"] === 1, "denomination 10k");
  });

  await isolated("28. Cash sale / refund / void / in / out / mixed", async (tx) => {
    const seed = await seedStore(tx);
    await sell(tx, seed, { paymentMode: "cash", totalAmount: 10_000, cashAmount: 10_000 });
    const mixed = await sell(tx, seed, {
      cashAmount: 4_000,
      paymentMode: "mixed",
      totalAmount: 10_000,
      transferAmount: 6_000,
    });
    const refundSale = await sell(tx, seed, { paymentMode: "cash", totalAmount: 10_000, cashAmount: 10_000 });
    await writeReturnPrismaSale(tx, seed.tenant, {
      items: [{ condition: "sellable", quantity: 1, saleItemId: refundSale.items[0].id }],
      refundMethod: "cash",
      saleId: refundSale.id,
    });
    const voidSale = await sell(tx, seed, { paymentMode: "cash", totalAmount: 5_000, cashAmount: 5_000 }, 1, "B");
    await writeVoidPrismaSale(tx, seed.tenant, { reason: "R7A void", saleId: voidSale.id });
    await tx.cashTransaction.create({
      data: {
        amount: 2_000,
        companyId: seed.tenant.companyId,
        createdBy: seed.tenant.userId,
        reason: "float",
        sessionId: seed.session.id,
        transactionType: "cash_in",
      },
    });
    await tx.cashTransaction.create({
      data: {
        amount: 1_000,
        companyId: seed.tenant.companyId,
        createdBy: seed.tenant.userId,
        reason: "petty",
        sessionId: seed.session.id,
        transactionType: "cash_out",
      },
    });

    const query = parseShiftTableQuery({ datePreset: "this_month" }, { datePreset: "this_month" });
    const table = await loadShiftSummaryTable(seed.tenant, query, tx);
    const row = table.rows.find((item) => item.id === seed.session.id);
    assert(row, "row");
    assert(row.grossCashSalesLak >= 24_000, `gross=${row.grossCashSalesLak}`);
    assert(row.cashRefundsLak === 10_000, `refunds=${row.cashRefundsLak}`);
    assert(row.cashVoidsLak === 5_000, `voids=${row.cashVoidsLak}`);
    assert(row.cashInLak === 2_000, `in=${row.cashInLak}`);
    assert(row.cashOutLak === 1_000, `out=${row.cashOutLak}`);
    const expected = calculateExpectedCash({
      cashInLak: row.cashInLak,
      cashOutLak: row.cashOutLak,
      cashSalesLak: row.grossCashSalesLak,
      openingCashLak: row.openingCashLak,
      refundLak: row.cashRefundsLak,
      voidCashLak: row.cashVoidsLak,
    });
    assert(row.expectedDrawerLak === expected, `expected=${row.expectedDrawerLak} calc=${expected}`);
    assert(mixed.id, "mixed sale created");
  });

  await isolated("29. Own-history isolation + manager summary sees all cashiers", async (tx) => {
    const seed = await seedStore(tx);
    const other = await addCashier(tx, seed.tenant.companyId!, seed.tenant.branchId!, "B");
    const otherSession = await tx.cashSession.create({
      data: {
        branchId: seed.tenant.branchId,
        cashierId: other.id,
        companyId: seed.tenant.companyId,
        openedAt: new Date(Date.now() - 60_000),
        openingCash: 50_000,
      },
    });
    await sell(tx, seed, { paymentMode: "cash", totalAmount: 10_000, cashAmount: 10_000 });

    const query = parseShiftTableQuery(
      { cashierId: other.id, datePreset: "this_month" },
      { datePreset: "this_month" },
    );
    const own = await loadOwnShiftHistoryTable(seed.tenant, query, tx);
    assert(
      own.rows.every((row) => row.cashierId === seed.tenant.userId),
      `leaked=${own.rows.map((row) => row.cashierId).join(",")}`,
    );
    assert(!own.rows.some((row) => row.id === otherSession.id), "foreign session blocked");

    const summary = await loadShiftSummaryTable(
      seed.tenant,
      parseShiftTableQuery({ datePreset: "this_month" }, { datePreset: "this_month" }),
      tx,
    );
    assert(
      summary.rows.some((row) => row.cashierId === seed.tenant.userId) &&
        summary.rows.some((row) => row.cashierId === other.id),
      "manager summary sees both",
    );

    const foreignDetail = await loadShiftDetail(seed.tenant, otherSession.id, { ownOnly: true }, tx);
    assert(foreignDetail == null, "ownOnly detail blocks foreign shift");

    const noDenom = await loadShiftDetail(seed.tenant, seed.session.id, undefined, tx);
    assert(noDenom?.countBreakdown == null, "open shift without breakdown");
  });

  await isolated("30. Shift without denomination breakdown after close", async (tx) => {
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
    const detail = await loadShiftDetail(seed.tenant, seed.session.id, undefined, tx);
    assert(detail?.countBreakdown == null, "no breakdown recorded");
    assert(detail?.countedCashLak === OPENING_CASH, "counted persisted");
  });

  await prisma.$disconnect();
  console.log(`\nR7A result: ${passed} passed, ${failed} failed`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
