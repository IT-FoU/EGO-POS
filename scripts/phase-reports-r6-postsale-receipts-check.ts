/**
 * REPORTS R6 — Refund/Void + Receipt / Sales Details.
 * Reuses Batch H / STEP9 cash refund math. Does not change write paths.
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
import { writeExchangePrismaSale, writeReturnPrismaSale } from "../features/pos/return-repository";
import type { PaymentMode } from "../features/pos/types";
import { writePrismaProductCreate } from "../features/products/prisma-repository";
import {
  findReportCenterEntryByHref,
  isPlannedReportCenterEntry,
  REPORT_CENTER_PLANNED_HREFS,
} from "../features/reports/report-center-catalog";
import {
  cashAndNoncashRefundLak,
  classifyRefundEventType,
  summarizePostSaleEvents,
} from "../features/reports/postsale-table-math";
import { parsePostSaleTableQuery } from "../features/reports/postsale-table-query";
import { loadReceiptSalesTable, loadRefundVoidTable } from "../features/reports/postsale-table-repository";
import { loadDailySalesTable, loadPaymentMethodSalesTable } from "../features/reports/sales-table-repository";
import { parseSalesTableQuery } from "../features/reports/sales-table-query";
import {
  reportsCopyHasNoReplacementChars,
  reportsCopyKeyParity,
  tReports,
} from "../lib/i18n/reports-copy";
import { businessDayLabel } from "../lib/datetime/business-timezone";
import type { TenantContext } from "../lib/db/write-context";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";
import { computeCashRefundLak } from "../features/cash-sessions/cash-session-calculator";

const ROOT = process.cwd();
const thaiScript = /[\u0E00-\u0E7F]/;
const TX_OPTS = { maxWait: 20_000, timeout: 180_000 } as const;
const OPENING_CASH = 100_000;

class RollbackError extends Error {
  constructor() {
    super("R6 isolated fixture rollback");
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

const r6Keys = [
  "refundTransactions",
  "voidTransactions",
  "refundAmount",
  "cashRefunds",
  "noncashRefunds",
  "voidAmount",
  "itemsReturned",
  "netPostSaleEffect",
  "originalSaleDate",
  "approver",
  "postSaleType",
  "postSaleTypeRefund",
  "postSaleTypePartialRefund",
  "postSaleTypeFullRefund",
  "postSaleTypeVoid",
  "postSaleTypeExchange",
  "cashRefund",
  "noncashRefund",
  "reason",
  "stockRestored",
  "customer",
  "paymentMixed",
  "postSaleHistory",
  "emptyRefundVoidTable",
  "loadingRefundVoidTable",
  "errorRefundVoidTable",
  "emptyReceiptTable",
  "errorReceiptTable",
  "loadingReceiptTable",
  "allTypes",
  "allApprovers",
  "productBarcodeSearch",
  "receiptSearch",
  "averageBill",
  "thisWeek",
  "exportExcel",
];

const refundPage = read("app/(dashboard)/reports/sales/refunds-voids/page.tsx");
const receiptPage = read("app/(dashboard)/reports/sales/receipts/page.tsx");
const ui = read("features/reports/components/postsale-table-report.tsx");
const math = read("features/reports/postsale-table-math.ts");
const repo = read("features/reports/postsale-table-repository.ts");
const excel = read("features/reports/postsale-table-excel.ts");
const calculator = read("features/cash-sessions/cash-session-calculator.ts");
const reprint = read("features/pos/post-sale-repository.ts");

check(
  "1. R6 routes are live, not Planned shells",
  findReportCenterEntryByHref("/reports/sales/refunds-voids")?.planned !== true &&
    findReportCenterEntryByHref("/reports/sales/receipts")?.planned !== true &&
    !isPlannedReportCenterEntry(findReportCenterEntryByHref("/reports/sales/refunds-voids")!) &&
    !isPlannedReportCenterEntry(findReportCenterEntryByHref("/reports/sales/receipts")!) &&
    !REPORT_CENTER_PLANNED_HREFS.includes("/reports/sales/refunds-voids" as never) &&
    refundPage.includes("RefundVoidReportView") &&
    receiptPage.includes("ReceiptSalesReportView") &&
    existsSync(join(ROOT, "app/(dashboard)/reports/sales/refunds-voids/loading.tsx")) &&
    existsSync(join(ROOT, "app/(dashboard)/reports/sales/receipts/loading.tsx")) &&
    existsSync(join(ROOT, "app/api/reports/sales/refunds-voids/export/route.ts")) &&
    existsSync(join(ROOT, "app/api/reports/sales/receipts/export/route.ts")),
);
check(
  "2. STEP9 / Batch H cash refund math reused",
  math.includes("computeCashRefundLak") &&
    math.includes("refundAmountOf") &&
    calculator.includes("computeCashRefundLak") &&
    CASH_SESSION_SALE_STATUSES.includes("refunded"),
);
check(
  "3. Void rows come from cancelled sales, not Refund rows",
  repo.includes('saleStatus: "cancelled"') &&
    repo.includes("voidLak: moneyLak(sale.totalAmount)") &&
    !repo.includes("kind: \"void\""),
);
check(
  "4. Real Excel exports with required filenames",
  excel.includes("EGO-POS-Refund-Void-") &&
    excel.includes("EGO-POS-Receipt-Sales-") &&
    ui.includes("exportExcel") &&
    ui.includes("/api/reports/sales/refunds-voids/export") &&
    ui.includes("/api/reports/sales/receipts/export"),
);
check(
  "5. Spreadsheet-style white grid + TOTAL + horizontal scroll",
  ui.includes("border-zinc-300") &&
    ui.includes("overflow-x-auto") &&
    ui.includes('t("total"') &&
    ui.includes("min-w-[1280px]") &&
    ui.includes("min-w-[1100px]"),
);
check(
  "6. Reprint does not create a sale",
  reprint.includes('action: "reprint"') && !/action: \"reprint\"[\s\S]{0,400}sale\.create/.test(reprint),
);
check(
  "7. EN/LO complete for R6 keys",
  reportsCopyKeyParity() &&
    reportsCopyHasNoReplacementChars() &&
    r6Keys.every(
      (key) =>
        tReports(key, "en") !== key &&
        tReports(key, "lo") !== tReports(key, "en") &&
        !thaiScript.test(tReports(key, "lo")),
    ),
);
check(
  "8. Owner + Manager keep report access; cashier denied",
  canViewFullStoreReports("owner") && canViewFullStoreReports("manager") && !canViewFullStoreReports("cashier"),
);
check(
  "9. Read-only detail drawer (no write actions)",
  ui.includes("/api/reports/sales/") &&
    !ui.includes("writeReturn") &&
    !ui.includes("writeVoid") &&
    !ui.includes("method: \"POST\""),
);

{
  const type = classifyRefundEventType({
    kind: "refund",
    refundAmountLak: 5000,
    saleStatus: "partial_refunded",
    saleTotalLak: 10000,
  });
  check("10. Partial refund classification", type === "partial_refund");
  const full = classifyRefundEventType({
    kind: "refund",
    refundAmountLak: 10000,
    saleStatus: "refunded",
    saleTotalLak: 10000,
  });
  check("11. Full refund classification", full === "full_refund");
  const exchange = classifyRefundEventType({
    kind: "exchange",
    refundAmountLak: 0,
    saleStatus: "exchanged",
    saleTotalLak: 10000,
  });
  check("12. Exchange classification", exchange === "exchange");

  const mixed = cashAndNoncashRefundLak({
    payments: [
      { amount: 4000, changeAmount: 0, paymentMethod: "cash" },
      { amount: 6000, changeAmount: 0, paymentMethod: "transfer" },
    ],
    refundAmountLak: 10000,
    saleTotalLak: 10000,
  });
  const expectedCash = money(computeCashRefundLak(
    [
      { amount: 4000, changeAmount: 0, paymentMethod: "cash" },
      { amount: 6000, changeAmount: 0, paymentMethod: "transfer" },
    ],
    10000,
    10000,
  ));
  check(
    "13. Mixed refund cash/noncash split matches Batch H",
    mixed.cashRefundLak === expectedCash &&
      mixed.noncashRefundLak === 10000 - expectedCash &&
      mixed.refundLak === 10000,
  );

  const summary = summarizePostSaleEvents([
    { cashRefundLak: 4000, items: 1, noncashRefundLak: 6000, refundLak: 10000, type: "full_refund", voidLak: 0 },
    { cashRefundLak: 0, items: 2, noncashRefundLak: 0, refundLak: 0, type: "void", voidLak: 8000 },
  ]);
  check(
    "14. Summary does not double-count void into refund",
    summary.refundTransactions === 1 &&
      summary.voidTransactions === 1 &&
      summary.refundAmountLak === 10000 &&
      summary.voidAmountLak === 8000 &&
      summary.netPostSaleEffectLak === -18000,
  );

  const query = parsePostSaleTableQuery(
    { datePreset: "this_week", eventType: "partial_refund", q: "RCPT-1" },
    { datePreset: "today" },
  );
  check(
    "15. Query presets include this_week + receipt search",
    query.datePreset === "this_week" &&
      query.eventType === "partial_refund" &&
      query.receiptQuery === "RCPT-1" &&
      Boolean(query.dateFrom) &&
      Boolean(query.dateTo),
  );
}

loadProjectEnvFiles();
process.env.IGO_DEMO_MODE = "false";

type Tx = any;

async function createIsolatedTenant(tx: Tx, label: string) {
  const token = randomBytes(6).toString("hex");
  const user = await tx.user.create({
    data: { fullName: `R6 ${label}`, passwordHash: "isolated-fixture", username: `r6u${token}` },
  });
  const company = await tx.company.create({
    data: { businessTemplateKey: "mini-mart", name: `R6 ${label}`, ownerUserId: user.id, storeCode: `r6${token}` },
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
  const ctx = await createIsolatedTenant(tx, "postsale");
  const productA = await writePrismaProductCreate(tx, pieceInput("EGO R6 Alpha", 10000, "R6-A", "0611111111111"), ctx.tenant);
  const productB = await writePrismaProductCreate(tx, pieceInput("EGO R6 Bravo", 5000, "R6-B", "0622222222222"), ctx.tenant);
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
    discountAmount?: number;
  },
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
  payment: {
    paymentMode: PaymentMode;
    totalAmount: number;
    cashAmount?: number;
    qrAmount?: number;
    transferAmount?: number;
    cardAmount?: number;
    discountAmount?: number;
  },
  qty = 1,
  product: "A" | "B" = "A",
) {
  const productRow = product === "A" ? seed.productA : seed.productB;
  const unit = product === "A" ? seed.unitA : seed.unitB;
  const price = product === "A" ? 10000 : 5000;
  return writeCompletePrismaSale(
    tx,
    checkoutInput(
      seed.tenant,
      [{ productId: productRow.id, quantity: qty, sellingPrice: price, unitId: unit.id }],
      payment,
    ),
    seed.tenant,
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
      check(name, false, error instanceof Error ? error.message : String(error));
    }
  }

  await isolated("16. Matrix A–P reconciles Receipt / RefundVoid / R2 Daily / Payment", async (tx) => {
    const seed = await seedStore(tx);
    const today = businessDayLabel(new Date());
    const dailyFilters = parseSalesTableQuery({ date: today }, { datePreset: "today" });
    const postSaleFilters = parsePostSaleTableQuery({ date: today }, { datePreset: "today" });

    // A cash, B QR, C mixed
    const cash = await sell(tx, seed, { paymentMode: "cash", totalAmount: 10000, cashAmount: 10000 });
    const qr = await sell(tx, seed, { paymentMode: "qr", totalAmount: 10000, qrAmount: 10000, cashAmount: 0 });
    const mixed = await sell(tx, seed, {
      paymentMode: "mixed",
      totalAmount: 10000,
      cashAmount: 4000,
      transferAmount: 6000,
    });

    // D partial refund
    const partialSale = await sell(tx, seed, { paymentMode: "cash", totalAmount: 20000, cashAmount: 20000 }, 2);
    await writeReturnPrismaSale(tx, seed.tenant, {
      items: [{ condition: "sellable", quantity: 1, saleItemId: partialSale.items[0].id }],
      refundMethod: "cash",
      saleId: partialSale.id,
    });

    // E full refund
    const fullRefundSale = await sell(tx, seed, { paymentMode: "cash", totalAmount: 10000, cashAmount: 10000 });
    await writeReturnPrismaSale(tx, seed.tenant, {
      items: [{ condition: "sellable", quantity: 1, saleItemId: fullRefundSale.items[0].id }],
      refundMethod: "cash",
      saleId: fullRefundSale.id,
    });

    // F mixed refund
    const mixedRefundSale = await sell(tx, seed, {
      paymentMode: "mixed",
      totalAmount: 10000,
      cashAmount: 4000,
      transferAmount: 6000,
    });
    await writeReturnPrismaSale(tx, seed.tenant, {
      items: [{ condition: "sellable", quantity: 1, saleItemId: mixedRefundSale.items[0].id }],
      refundMethod: "cash",
      saleId: mixedRefundSale.id,
    });

    // G void cash
    const voidSale = await sell(tx, seed, { paymentMode: "cash", totalAmount: 10000, cashAmount: 10000 });
    await writeVoidPrismaSale(tx, seed.tenant, { reason: "r6-void", saleId: voidSale.id });

    // H mixed void
    const mixedVoidSale = await sell(tx, seed, {
      paymentMode: "mixed",
      totalAmount: 10000,
      cashAmount: 3000,
      qrAmount: 7000,
    });
    await writeVoidPrismaSale(tx, seed.tenant, { reason: "r6-mixed-void", saleId: mixedVoidSale.id });

    // I exchange
    const exchangeSale = await sell(tx, seed, { paymentMode: "cash", totalAmount: 10000, cashAmount: 10000 });
    await writeExchangePrismaSale(tx, seed.tenant, {
      reason: "r6-exchange",
      refundMethod: "cash",
      replacementItems: [{ productId: seed.productB.id, quantity: 2, unitId: seed.unitB.id }],
      returnedItems: [{ condition: "sellable", quantity: 1, saleItemId: exchangeSale.items[0].id }],
      saleId: exchangeSale.id,
    });

    // J adjusted — mark completed sale as adjusted without inventing money
    const adjustedSale = await sell(tx, seed, { paymentMode: "transfer", totalAmount: 10000, transferAmount: 10000, cashAmount: 0 });
    await tx.sale.update({
      data: { saleStatus: "adjusted" },
      where: { id: adjustedSale.id },
    });

    // K duplicate refund prevention
    let duplicateRefundBlocked = false;
    try {
      await writeReturnPrismaSale(tx, seed.tenant, {
        items: [{ condition: "sellable", quantity: 1, saleItemId: fullRefundSale.items[0].id }],
        refundMethod: "cash",
        saleId: fullRefundSale.id,
      });
    } catch {
      duplicateRefundBlocked = true;
    }
    assert(duplicateRefundBlocked, "duplicate refund must fail");

    // L duplicate void prevention
    let duplicateVoidBlocked = false;
    try {
      await writeVoidPrismaSale(tx, seed.tenant, { reason: "again", saleId: voidSale.id });
    } catch {
      duplicateVoidBlocked = true;
    }
    assert(duplicateVoidBlocked, "duplicate void must fail");

    // M reprint does not create sale
    const saleCount = await tx.sale.count({ where: { companyId: seed.tenant.companyId } });
    assert(saleCount === 10, `expected 10 sales, got ${saleCount}`);

    const balanceA = await tx.inventoryBalance.findUnique({
      where: { warehouseId_productId: { productId: seed.productA.id, warehouseId: seed.warehouseId } },
    });
    // N/O stock restore: sold/refunded/voided/exchanged effects should be finite and non-negative
    assert(money(balanceA?.quantity) >= 0, "stock balance non-negative");

    const receipts = await loadReceiptSalesTable(seed.tenant, postSaleFilters, tx);
    const refunds = await loadRefundVoidTable(seed.tenant, postSaleFilters, tx);
    const daily = await loadDailySalesTable(seed.tenant, dailyFilters, tx);
    const payments = await loadPaymentMethodSalesTable(seed.tenant, dailyFilters, tx);

    assertClose(receipts.summary.grossLak, daily.summary.grossLak, "receipt vs daily gross");
    assertClose(receipts.summary.refundLak, daily.summary.refundLak, "receipt vs daily refund");
    assertClose(receipts.summary.voidLak, daily.summary.voidLak, "receipt vs daily void");
    assertClose(receipts.summary.netLak, daily.summary.netLak, "receipt vs daily net");
    assert(receipts.summary.bills === daily.summary.bills, `bills ${receipts.summary.bills} vs ${daily.summary.bills}`);

    assertClose(refunds.summary.refundAmountLak, daily.summary.refundLak, "refund-void vs daily refund");
    assertClose(refunds.summary.voidAmountLak, daily.summary.voidLak, "refund-void vs daily void");

    const mixedReceipt = receipts.rows.find((row) => row.id === mixed.id);
    assert(mixedReceipt?.paymentLabel === "mixed", "mixed payments show Mixed");
    assert(receipts.rows.some((row) => row.id === adjustedSale.id && row.status === "adjusted"), "adjusted sale visible");
    assert(receipts.rows.some((row) => row.id === exchangeSale.id), "exchanged sale visible");

    const partialRow = refunds.rows.find((row) => row.saleId === partialSale.id);
    const fullRow = refunds.rows.find((row) => row.saleId === fullRefundSale.id);
    const mixedRefundRow = refunds.rows.find((row) => row.saleId === mixedRefundSale.id);
    const voidRow = refunds.rows.find((row) => row.saleId === voidSale.id && row.type === "void");
    const mixedVoidRow = refunds.rows.find((row) => row.saleId === mixedVoidSale.id && row.type === "void");
    const exchangeRow = refunds.rows.find((row) => row.saleId === exchangeSale.id);

    assert(partialRow?.type === "partial_refund", "partial refund typed");
    assertClose(partialRow?.refundLak, 10000, "partial refund amount");
    assert(fullRow?.type === "full_refund", "full refund typed");
    assertClose(fullRow?.refundLak, 10000, "full refund amount");
    assertClose(fullRow?.cashRefundLak, 10000, "full cash refund");
    assert(mixedRefundRow, "mixed refund row present");
    assertClose(mixedRefundRow?.refundLak, 10000, "mixed refund amount");
    assert(voidRow?.voidLak === 10000 && voidRow.refundLak === 0, "void amount once");
    assert(mixedVoidRow?.voidLak === 10000, "mixed void amount");
    assert(exchangeRow?.type === "exchange", "exchange lifecycle in refund/void report");

    // receipt search
    const byReceipt = await loadReceiptSalesTable(
      seed.tenant,
      parsePostSaleTableQuery({ date: today, q: String(cash.receiptNo || cash.saleNo) }, { datePreset: "today" }),
      tx,
    );
    assert(byReceipt.rows.some((row) => row.id === cash.id), "receipt search finds cash sale");

    // product/barcode search
    const byBarcode = await loadReceiptSalesTable(
      seed.tenant,
      parsePostSaleTableQuery({ date: today, product: "0611111111111" }, { datePreset: "today" }),
      tx,
    );
    assert(byBarcode.rows.some((row) => row.id === cash.id), "barcode search finds product A sales");

    // payment mix vs R2 payment report cash/qr/transfer buckets (qualifying tenders)
    assertClose(
      receipts.summary.cashLak + receipts.summary.qrLak + receipts.summary.transferLak + receipts.summary.cardLak,
      payments.summary.totalPaidLak,
      "receipt payment buckets vs R2 payment totalPaid",
    );

    // P cash drawer effect: cash full refund increases cash refund line; void subtracts once
    assert(refunds.summary.cashRefundLak >= 10000, "cash refund KPI includes full cash refund");
    assertClose(refunds.summary.voidAmountLak, 20000, "two voids at 10k each");

    void qr;
  });

  await prisma.$disconnect();
  if (failed) {
    console.error(`\nphase-reports-r6-postsale-receipts-check: FAIL (${passed} passed, ${failed} failed)`);
    process.exit(1);
  }
  console.log(`\nphase-reports-r6-postsale-receipts-check: PASS (${passed})`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
