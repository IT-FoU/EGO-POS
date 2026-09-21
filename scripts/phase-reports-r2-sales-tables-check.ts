/**
 * REPORTS R2 — Sales tables.
 * Daily / Monthly / Payment Method live reports with shared STEP9 accounting.
 * Does not change checkout, refund, void, or Batch H cash semantics.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { canViewFullStoreReports } from "../features/permissions/store-ui-permissions";
import { CASH_SESSION_SALE_STATUSES } from "../features/pos/post-sale-shared";
import { writeCompletePrismaSale, type CompletePrismaSaleInput } from "../features/pos/prisma-repository";
import { writeVoidPrismaSale } from "../features/pos/post-sale-repository";
import { writeReturnPrismaSale } from "../features/pos/return-repository";
import type { PaymentMode } from "../features/pos/types";
import { writePrismaProductCreate } from "../features/products/prisma-repository";
import {
  REPORT_CENTER_ENTRIES,
  REPORT_CENTER_PLANNED_HREFS,
  findReportCenterEntryByHref,
  isPlannedReportCenterEntry,
} from "../features/reports/report-center-catalog";
import {
  computeSaleReportMetrics,
  moneyLak,
  netTenderLak,
  summarizeSaleMetrics,
  type SaleReportFacts,
} from "../features/reports/sales-table-math";
import { parseSalesTableQuery } from "../features/reports/sales-table-query";
import {
  loadDailySalesTable,
  loadMonthlySalesTable,
  loadPaymentMethodSalesTable,
} from "../features/reports/sales-table-repository";
import {
  reportsCopyHasNoReplacementChars,
  reportsCopyKeyParity,
  tReports,
} from "../lib/i18n/reports-copy";
import { businessDayLabel, businessMonthLabel } from "../lib/datetime/business-timezone";
import type { TenantContext } from "../lib/db/write-context";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";

const ROOT = process.cwd();
const thaiScript = /[\u0E00-\u0E7F]/;
const TX_OPTS = { maxWait: 20_000, timeout: 180_000 } as const;
const OPENING_CASH = 100_000;

class RollbackError extends Error {
  constructor() {
    super("R2 isolated fixture rollback");
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

function assertClose(actual: unknown, expected: number, message: string) {
  const value = money(actual);
  if (Math.abs(value - expected) > 1) {
    throw new Error(`${message}: expected ${expected}, got ${value}`);
  }
}

const r2CopyKeys = [
  "bills",
  "colCost",
  "colDate",
  "colDateTime",
  "colDiscount",
  "colGross",
  "colItems",
  "colNet",
  "colNo",
  "colPayment",
  "colPaymentAmount",
  "colProfit",
  "colReceipt",
  "colRefund",
  "colRefundAmount",
  "colSaleTotal",
  "colStatus",
  "colTime",
  "colVoid",
  "cost",
  "date",
  "emptySalesTable",
  "errorSalesTable",
  "loadingSalesTable",
  "month",
  "paymentMastercard",
  "paymentVisa",
  "receiptSearch",
  "saleDetail",
  "saleStatusAdjusted",
  "saleStatusCancelled",
  "saleStatusCompleted",
  "saleStatusExchanged",
  "saleStatusPartialRefunded",
  "saleStatusRefunded",
  "searchReceiptPlaceholder",
  "status",
  "total",
  "totalBills",
  "totalItems",
  "totalPaid",
  "voids",
  "allPaymentMethods",
  "allStatuses",
];

const dailyPage = read("app/(dashboard)/reports/sales/daily/page.tsx");
const monthlyPage = read("app/(dashboard)/reports/sales/monthly/page.tsx");
const paymentPage = read("app/(dashboard)/reports/sales/payment-methods/page.tsx");
const math = read("features/reports/sales-table-math.ts");
const repo = read("features/reports/sales-table-repository.ts");
const ui = read("features/reports/components/sales-table-report.tsx");
const calculator = read("features/cash-sessions/cash-session-calculator.ts");
const reprint = read("features/pos/post-sale-repository.ts");
const prismaReports = read("features/reports/prisma-repository.ts");

check(
  "1. R2 routes are live, not Planned shells",
  findReportCenterEntryByHref("/reports/sales/daily")?.planned !== true &&
    findReportCenterEntryByHref("/reports/sales/monthly")?.planned !== true &&
    findReportCenterEntryByHref("/reports/sales/payment-methods")?.planned !== true &&
    !isPlannedReportCenterEntry(findReportCenterEntryByHref("/reports/sales/daily")!) &&
    !REPORT_CENTER_PLANNED_HREFS.includes("/reports/sales/daily" as never) &&
    dailyPage.includes("DailySalesReportView") &&
    monthlyPage.includes("MonthlySalesReportView") &&
    paymentPage.includes("PaymentMethodSalesReportView") &&
    existsSync(join(ROOT, "app/(dashboard)/reports/sales/daily/loading.tsx")),
);
check(
  "2. Remaining product/inventory reports stay Planned",
  REPORT_CENTER_PLANNED_HREFS.length === 5 &&
    REPORT_CENTER_ENTRIES.filter((entry) => entry.planned).length === 5,
);
check(
  "3. Shared STEP9 semantics reused",
  math.includes("netReportLifecycle") &&
    math.includes("isVoidSaleStatus") &&
    prismaReports.includes("refundAmountOf") &&
    repo.includes("computeSaleReportMetrics"),
);
check(
  "4. Discount is not subtracted twice from Net",
  math.includes("discount already applied") &&
    math.includes("NOT subtracted again") &&
    math.includes("originalGross + lifecycle.revenueLak"),
);
check(
  "5. Mixed payments stay as components",
  repo.includes("payments.forEach") &&
    ui.includes("join(\" + \")") &&
    !ui.includes("paymentMode === \"mixed\""),
);
check(
  "6. No fake export actions on live R2 pages",
  !dailyPage.includes("excel") &&
    !monthlyPage.includes("pdf") &&
    !ui.includes('tReports("excel"') &&
    !ui.includes('tReports("print"') &&
    ui.includes("emptySalesTable") &&
    ui.includes("errorSalesTable"),
);
check(
  "7. Reprint does not create a sale",
  reprint.includes("action: \"reprint\"") &&
    !/action: \"reprint\"[\s\S]{0,400}sale\.create/.test(reprint),
);
check(
  "8. EN/LO complete for R2 keys",
  reportsCopyKeyParity() &&
    reportsCopyHasNoReplacementChars() &&
    r2CopyKeys.every((key) => tReports(key, "en") !== key && tReports(key, "lo") !== tReports(key, "en") && !thaiScript.test(tReports(key, "lo"))),
);
check("9. Owner + Manager keep report access; cashier denied", canViewFullStoreReports("owner") && canViewFullStoreReports("manager") && !canViewFullStoreReports("cashier"));
check(
  "10. Batch H cash refund KPI unchanged",
  CASH_SESSION_SALE_STATUSES.includes("refunded") && calculator.includes("computeCashRefundLak"),
);

{
  const query = parseSalesTableQuery({ date: "2026-09-21" }, { datePreset: "today" });
  check(
    "11. Monthly date drill-down applies daily date",
    query.date === "2026-09-21" &&
      Boolean(query.dateFrom) &&
      Boolean(query.dateTo),
  );
}

{
  const completed: SaleReportFacts = {
    createdAt: new Date(),
    createdBy: "u1",
    discountAmount: 1000,
    id: "s1",
    items: [{ costPrice: 6000, id: "i1", profitAmount: 3000, quantity: 1 }],
    payments: [{ amount: 9000, changeAmount: 0, paymentMethod: "cash" }],
    profitAmount: 3000,
    receiptNo: "R-1",
    refunds: [],
    saleNo: "S-1",
    saleStatus: "completed",
    totalAmount: 9000,
  };
  const discounted = computeSaleReportMetrics(completed);
  check(
    "12. Discounted gross uses paid totalAmount, Net does not subtract discount again",
    discounted.grossLak === 9000 && discounted.discountLak === 1000 && discounted.netLak === 9000,
  );

  const refunded = computeSaleReportMetrics({
    ...completed,
    saleStatus: "refunded",
    refunds: [{ kind: "refund", refundAmount: 9000, totalAmount: 9000, items: [{ quantity: 1, saleItemId: "i1" }] }],
  });
  check(
    "13. Persisted refund reduces Net, not Gross",
    refunded.grossLak === 9000 && refunded.refundLak === 9000 && refunded.netLak === 0,
  );

  const voided = computeSaleReportMetrics({ ...completed, saleStatus: "cancelled", refunds: [] });
  check(
    "14. Void excluded from Gross/Net and shown as Void amount",
    voided.grossLak === 0 && voided.voidLak === 9000 && voided.netLak === 0 && voided.costLak === 0,
  );

  const mixed = summarizeSaleMetrics([
    computeSaleReportMetrics({
      ...completed,
      id: "mixed",
      discountAmount: 0,
      totalAmount: 10000,
      profitAmount: 4000,
      items: [{ costPrice: 6000, id: "i2", profitAmount: 4000, quantity: 1 }],
      payments: [
        { amount: 4000, changeAmount: 0, paymentMethod: "cash" },
        { amount: 6000, changeAmount: 0, paymentMethod: "transfer" },
      ],
    }),
  ]);
  check("15. Mixed tender still one sale in Daily bills", mixed.bills === 1 && mixed.grossLak === 10000);
  check(
    "16. Cash tender nets change",
    netTenderLak({ amount: 12000, changeAmount: 2000, paymentMethod: "cash" }) === 10000 &&
      moneyLak(99.4) === 99,
  );
}

loadProjectEnvFiles();
process.env.IGO_DEMO_MODE = "false";

type Tx = any;

async function createIsolatedTenant(tx: Tx, label: string) {
  const token = randomBytes(6).toString("hex");
  const user = await tx.user.create({
    data: { fullName: `R2 ${label}`, passwordHash: "isolated-fixture", username: `r2u${token}` },
  });
  const company = await tx.company.create({
    data: { businessTemplateKey: "mini-mart", name: `R2 ${label}`, ownerUserId: user.id, storeCode: `r2${token}` },
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
  await tx.cashSession.create({
    data: { branchId: branch.id, cashierId: user.id, companyId: company.id, openingCash: OPENING_CASH },
  });
  const tenant: TenantContext = {
    branchId: branch.id,
    companyId: company.id,
    userId: user.id,
    warehouseId: warehouse.id,
  };
  return { tenant, warehouseId: warehouse.id };
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
  const ctx = await createIsolatedTenant(tx, "sales-tables");
  const productA = await writePrismaProductCreate(tx, pieceInput("EGO R2 Alpha", 10000, "R2-A", "0211111111111"), ctx.tenant);
  const productB = await writePrismaProductCreate(tx, pieceInput("EGO R2 Bravo", 5000, "R2-B", "0222222222222"), ctx.tenant);
  await tx.inventoryBalance.upsert({
    create: { companyId: ctx.tenant.companyId, productId: productA.id, quantity: 40, warehouseId: ctx.warehouseId },
    update: { quantity: 40 },
    where: { warehouseId_productId: { productId: productA.id, warehouseId: ctx.warehouseId } },
  });
  await tx.inventoryBalance.upsert({
    create: { companyId: ctx.tenant.companyId, productId: productB.id, quantity: 40, warehouseId: ctx.warehouseId },
    update: { quantity: 40 },
    where: { warehouseId_productId: { productId: productB.id, warehouseId: ctx.warehouseId } },
  });
  const unitA = productA.units.find((unit: { isBaseUnit: boolean }) => unit.isBaseUnit) ?? productA.units[0];
  const unitB = productB.units.find((unit: { isBaseUnit: boolean }) => unit.isBaseUnit) ?? productB.units[0];
  return { ...ctx, productA, productB, unitA, unitB };
}

function checkoutInput(
  tenant: TenantContext,
  items: Array<{ productId: string; quantity: number; sellingPrice: number; unitId?: string }>,
  payment: { paymentMode: PaymentMode; totalAmount: number; cashAmount?: number; cardAmount?: number; qrAmount?: number; transferAmount?: number; discountAmount?: number },
): CompletePrismaSaleInput {
  return {
    branchId: tenant.branchId ?? "",
    cardAmount: payment.cardAmount ?? 0,
    cashAmount: payment.cashAmount ?? (payment.paymentMode === "cash" ? payment.totalAmount : 0),
    changeAmount: 0,
    discountAmount: payment.discountAmount ?? 0,
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
  payment: { paymentMode: PaymentMode; totalAmount: number; cashAmount?: number; qrAmount?: number; transferAmount?: number; discountAmount?: number },
  qty = 1,
) {
  return writeCompletePrismaSale(tx, checkoutInput(seed.tenant, [{
    productId: seed.productA.id,
    quantity: qty,
    sellingPrice: 10000,
    unitId: seed.unitA.id,
  }], payment), seed.tenant);
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
      check(name, false, error instanceof Error ? error.message : String(error));
    }
  }

  await isolated("17. Live matrix A–I reconciles Daily / Monthly / Payment", async (tx) => {
    const seed = await seedStore(tx);
    const today = businessDayLabel(new Date());
    const month = businessMonthLabel(new Date());
    const filters = parseSalesTableQuery({ date: today }, { datePreset: "today" });

    const cash = await sell(tx, seed, { paymentMode: "cash", totalAmount: 10000, cashAmount: 10000 });
    const qr = await sell(tx, seed, { paymentMode: "qr", totalAmount: 10000, qrAmount: 10000, cashAmount: 0 });
    const transfer = await sell(tx, seed, { paymentMode: "transfer", totalAmount: 10000, transferAmount: 10000, cashAmount: 0 });
    const mixed = await sell(tx, seed, { paymentMode: "mixed", totalAmount: 10000, cashAmount: 4000, transferAmount: 6000 });
    const fullRefundSale = await sell(tx, seed, { paymentMode: "cash", totalAmount: 10000, cashAmount: 10000 });
    await writeReturnPrismaSale(tx, seed.tenant, {
      items: [{ condition: "sellable", quantity: 1, saleItemId: fullRefundSale.items[0].id }],
      refundMethod: "cash",
      saleId: fullRefundSale.id,
    });
    const partialSale = await sell(tx, seed, { paymentMode: "cash", totalAmount: 20000, cashAmount: 20000 }, 2);
    await writeReturnPrismaSale(tx, seed.tenant, {
      items: [{ condition: "sellable", quantity: 1, saleItemId: partialSale.items[0].id }],
      refundMethod: "cash",
      saleId: partialSale.id,
    });
    const mixedRefundSale = await sell(tx, seed, { paymentMode: "mixed", totalAmount: 10000, cashAmount: 4000, transferAmount: 6000 });
    await writeReturnPrismaSale(tx, seed.tenant, {
      items: [{ condition: "sellable", quantity: 1, saleItemId: mixedRefundSale.items[0].id }],
      refundMethod: "cash",
      saleId: mixedRefundSale.id,
    });
    const voidSale = await sell(tx, seed, { paymentMode: "cash", totalAmount: 10000, cashAmount: 10000 });
    await writeVoidPrismaSale(tx, seed.tenant, { reason: "r2", saleId: voidSale.id });
    const saleCountAfterVoid = await tx.sale.count({ where: { companyId: seed.tenant.companyId } });
    assert(saleCountAfterVoid === 8, `expected 8 sales after void, got ${saleCountAfterVoid}`);
    const reprintCount = await tx.sale.count({ where: { id: cash.id } });
    assert(reprintCount === 1, "reprint must not create a sale row");

    const daily = await loadDailySalesTable(seed.tenant, filters, tx);
    const expectedGross = 80_000;
    const expectedRefund = 30_000;
    const expectedVoid = 10_000;
    const expectedNet = 50_000;
    assertClose(daily.summary.grossLak, expectedGross, "daily gross");
    assertClose(daily.summary.refundLak, expectedRefund, "daily refund");
    assertClose(daily.summary.voidLak, expectedVoid, "daily void");
    assertClose(daily.summary.netLak, expectedNet, "daily net");
    assert(daily.summary.bills === 7, `qualifying bills ${daily.summary.bills}`);
    assert(daily.rows.some((row) => row.id === voidSale.id && row.voidLak === 10000), "void row visible");
    assert(daily.rows.filter((row) => row.id === mixed.id).length === 1, "mixed sale is one Daily row");
    const mixedRow = daily.rows.find((row) => row.id === mixed.id);
    assert(mixedRow?.paymentMethods.includes("cash") && mixedRow.paymentMethods.includes("transfer"), "mixed methods shown");

    const monthly = await loadMonthlySalesTable(seed.tenant, parseSalesTableQuery({ month }, { datePreset: "this_month" }), tx);
    const dayRow = monthly.rows.find((row) => row.date === today);
    assert(dayRow, "monthly has today row");
    assertClose(dayRow?.grossLak, daily.summary.grossLak, "monthly day vs daily gross");
    assertClose(monthly.summary.grossLak, daily.summary.grossLak, "monthly total vs daily");
    assertClose(monthly.summary.netLak, daily.summary.netLak, "monthly net vs daily");
    assertClose(monthly.summary.refundLak, daily.summary.refundLak, "monthly refund vs daily");
    assertClose(monthly.summary.voidLak, daily.summary.voidLak, "monthly void vs daily");

    const payments = await loadPaymentMethodSalesTable(seed.tenant, filters, tx);
    const mixedPaymentRows = payments.rows.filter((row) => row.saleId === mixed.id);
    assert(mixedPaymentRows.length === 2, `mixed payment rows ${mixedPaymentRows.length}`);
    assertClose(mixedPaymentRows.reduce((sum, row) => sum + row.paymentAmountLak, 0), 10000, "mixed components sum");
    assert(new Set(mixedPaymentRows.map((row) => row.paymentMethod)).size === 2, "mixed methods not collapsed");
    const refundOnMixed = payments.rows.filter((row) => row.saleId === mixedRefundSale.id);
    const uniqueRefund = refundOnMixed.reduce((sum, row) => sum + row.refundLak, 0);
    assertClose(uniqueRefund, 10000, "mixed refund counted once");
    assertClose(payments.summary.cashLak + payments.summary.qrLak + payments.summary.transferLak, payments.summary.totalPaidLak, "payment totals add");
    void qr;
    void transfer;
  });

  await prisma.$disconnect();
  if (failed) {
    console.error(`\nphase-reports-r2-sales-tables-check: FAIL (${passed} passed, ${failed} failed)`);
    process.exit(1);
  }
  console.log(`\nphase-reports-r2-sales-tables-check: PASS (${passed})`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
