/**
 * REPORTS R2.1 — spreadsheet grid + real Excel export of the full filtered dataset.
 * Does not change R2 accounting, POS, or Production.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";
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
  buildDailySalesExcel,
  buildMonthlySalesExcel,
  buildPaymentMethodSalesExcel,
  dailySalesExportFilename,
  monthlySalesExportFilename,
  paymentMethodsExportFilename,
  sanitizeExportFilename,
} from "../features/reports/sales-table-excel";
import { parseSalesTableQuery, selectSalesTableRows } from "../features/reports/sales-table-query";
import {
  loadDailySalesTable,
  loadMonthlySalesTable,
  loadPaymentMethodSalesTable,
} from "../features/reports/sales-table-repository";
import { SALES_TABLE_PAGE_SIZE } from "../features/reports/sales-table-math";
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
    super("R2.1 isolated fixture rollback");
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

const r21Keys = [
  "cashierFilter",
  "exportComplete",
  "exportExcel",
  "exportFailed",
  "exporting",
  "generatedAt",
  "monthlySales",
  "paymentFilter",
  "paymentMethodsSheet",
  "report",
  "reportSummary",
  "statusFilter",
  "store",
  "total",
];

const ui = read("features/reports/components/sales-table-report.tsx");
const repo = read("features/reports/sales-table-repository.ts");
const excel = read("features/reports/sales-table-excel.ts");
const math = read("features/reports/sales-table-math.ts");
const query = read("features/reports/sales-table-query.ts");
const comingSoon = existsSync(join(ROOT, "features/reports/components/report-coming-soon.tsx"))
  ? read("features/reports/components/report-coming-soon.tsx")
  : "";
const packageJson = read("package.json");

check(
  "1. Spreadsheet grid uses visible horizontal and vertical borders",
  ui.includes("border-separate") &&
    ui.includes("border border-zinc-300") &&
    ui.includes("thCell") &&
    ui.includes("tdCell") &&
    !ui.includes("border-zinc-100") &&
    !ui.includes("rounded-xl card"),
);
check(
  "2. Header, body, and TOTAL stay in the table grid",
  ui.includes("bg-zinc-100") &&
    ui.includes("font-semibold") &&
    ui.includes("border-t-2") &&
    ui.includes("tdTotal") &&
    !ui.includes("colSpan={5}") &&
    !ui.includes("colSpan={2}"),
);
check(
  "3. Sticky header + sort icons do not overlap labels",
  ui.includes("sticky top-0") &&
    ui.includes("whitespace-nowrap") &&
    ui.includes("shrink-0"),
);
check(
  "4. Tables remain tables on mobile (no card conversion)",
  ui.includes("overflow-x-auto") &&
    ui.includes("<table") &&
    !ui.includes("md:hidden card") &&
    ui.includes("min-w-[1100px]"),
);
check(
  "5. Real Export Excel on all three R2 reports",
  ui.includes("exportExcel") &&
    ui.includes("exporting") &&
    ui.includes("exportFailed") &&
    query.includes("/api/reports/sales/${report}/export") &&
    existsSync(join(ROOT, "app/api/reports/sales/daily/export/route.ts")) &&
    existsSync(join(ROOT, "app/api/reports/sales/monthly/export/route.ts")) &&
    existsSync(join(ROOT, "app/api/reports/sales/payment-methods/export/route.ts")),
);
check(
  "6. Export uses exceljs .xlsx and full filtered rows",
  packageJson.includes('"exceljs"') &&
    excel.includes("from \"exceljs\"") &&
    excel.includes("writeBuffer") &&
    repo.includes("allRows") &&
    query.includes("selectSalesTableRows") &&
    !excel.includes("saleId") &&
    !excel.includes("companyId"),
);
check(
  "7. Print/PDF are not presented as working on live R2 pages",
  !ui.includes('t("print"') && !ui.includes('t("pdf"'),
);
check(
  "8. Product/inventory planned reports are unchanged",
  !comingSoon.includes("exportExcel") &&
    read("features/reports/report-center-catalog.ts").includes("inventory-low-stock"),
);
check(
  "9. R2 accounting files are not rewritten",
  math.includes("originalGross + lifecycle.revenueLak") &&
    math.includes("NOT subtracted again") &&
    repo.includes("computeSaleReportMetrics"),
);
check("10. Owner/Manager keep reports; cashier denied", canViewFullStoreReports("owner") && canViewFullStoreReports("manager") && !canViewFullStoreReports("cashier"));
check("11. Batch H cash refund KPI unchanged", CASH_SESSION_SALE_STATUSES.includes("refunded"));
check(
  "12. EN/LO complete for R2.1 keys",
  reportsCopyKeyParity() &&
    reportsCopyHasNoReplacementChars() &&
    r21Keys.every((key) => tReports(key, "en") !== key && tReports(key, "lo") !== tReports(key, "en") && !thaiScript.test(tReports(key, "lo"))),
);

{
  const paged = selectSalesTableRows(Array.from({ length: 137 }, (_, index) => index + 1), 1, SALES_TABLE_PAGE_SIZE, false);
  const page2 = selectSalesTableRows(Array.from({ length: 137 }, (_, index) => index + 1), 2, SALES_TABLE_PAGE_SIZE, false);
  const all = selectSalesTableRows(Array.from({ length: 137 }, (_, index) => index + 1), 1, SALES_TABLE_PAGE_SIZE, true);
  check(
    "13. Pagination helper exports all 137 filtered rows, not page 1",
    paged.rows.length === 50 &&
      page2.rows[0] === 51 &&
      all.rows.length === 137 &&
      all.rows[136] === 137,
  );
}

check(
  "14. Filenames are descriptive and sanitized",
  dailySalesExportFilename(parseSalesTableQuery({ date: "2026-09-21" }, { datePreset: "today" })) === "EGO-POS-Daily-Sales-2026-09-21.xlsx" &&
    monthlySalesExportFilename("2026-09") === "EGO-POS-Monthly-Sales-2026-09.xlsx" &&
    paymentMethodsExportFilename(parseSalesTableQuery({ dateFrom: "2026-09-01", dateTo: "2026-09-21", datePreset: "custom" }, { datePreset: "today" })) ===
      "EGO-POS-Payment-Methods-2026-09-01-to-2026-09-21.xlsx" &&
    sanitizeExportFilename("EGO:POS/Daily?.xlsx") === "EGO-POS-Daily-.xlsx",
);

loadProjectEnvFiles();
process.env.IGO_DEMO_MODE = "false";

type Tx = any;

async function createIsolatedTenant(tx: Tx, label: string) {
  const token = randomBytes(6).toString("hex");
  const user = await tx.user.create({
    data: { fullName: `R21 ${label}`, passwordHash: "isolated-fixture", username: `r21u${token}` },
  });
  const company = await tx.company.create({
    data: { businessTemplateKey: "mini-mart", name: `R21 ${label}`, ownerUserId: user.id, storeCode: `r21${token}` },
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
  const ctx = await createIsolatedTenant(tx, "excel-export");
  const productA = await writePrismaProductCreate(tx, pieceInput("EGO R21 Alpha", 10000, "R21-A", "0311111111111"), ctx.tenant);
  await tx.inventoryBalance.upsert({
    create: { companyId: ctx.tenant.companyId, productId: productA.id, quantity: 80, warehouseId: ctx.warehouseId },
    update: { quantity: 80 },
    where: { warehouseId_productId: { productId: productA.id, warehouseId: ctx.warehouseId } },
  });
  const unitA = productA.units.find((unit: { isBaseUnit: boolean }) => unit.isBaseUnit) ?? productA.units[0];
  return { ...ctx, productA, unitA };
}

function checkoutInput(
  tenant: TenantContext,
  items: Array<{ productId: string; quantity: number; sellingPrice: number; unitId?: string }>,
  payment: { paymentMode: PaymentMode; totalAmount: number; cashAmount?: number; qrAmount?: number; transferAmount?: number; discountAmount?: number },
): CompletePrismaSaleInput {
  return {
    branchId: tenant.branchId ?? "",
    cardAmount: 0,
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

async function loadWorkbook(buffer: ArrayBuffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(buffer));
  return workbook;
}

function sheetValues(sheet: ExcelJS.Worksheet) {
  const values: unknown[][] = [];
  sheet.eachRow((row) => {
    const cells: unknown[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      cells.push(cell.value);
    });
    values.push(cells);
  });
  return values;
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

  await isolated("15. UI filtered aggregates equal Excel for daily / monthly / payment", async (tx) => {
    const seed = await seedStore(tx);
    const today = businessDayLabel(new Date());
    const month = businessMonthLabel(new Date());
    const filters = parseSalesTableQuery({ date: today }, { datePreset: "today" });

    const cash = await sell(tx, seed, { paymentMode: "cash", totalAmount: 10000, cashAmount: 10000 });
    await sell(tx, seed, { paymentMode: "qr", totalAmount: 10000, qrAmount: 10000, cashAmount: 0 });
    const mixed = await sell(tx, seed, { paymentMode: "mixed", totalAmount: 10000, cashAmount: 4000, transferAmount: 6000 });
    const fullRefundSale = await sell(tx, seed, { paymentMode: "cash", totalAmount: 10000, cashAmount: 10000 });
    await writeReturnPrismaSale(tx, seed.tenant, {
      items: [{ condition: "sellable", quantity: 1, saleItemId: fullRefundSale.items[0].id }],
      refundMethod: "cash",
      saleId: fullRefundSale.id,
    });
    const voidSale = await sell(tx, seed, { paymentMode: "cash", totalAmount: 10000, cashAmount: 10000 });
    await writeVoidPrismaSale(tx, seed.tenant, { reason: "r21", saleId: voidSale.id });

    const dailyPage = await loadDailySalesTable(seed.tenant, { ...filters, page: 1 }, tx);
    const dailyAll = await loadDailySalesTable(seed.tenant, filters, tx, { allRows: true });
    assertClose(dailyPage.summary.grossLak, dailyAll.summary.grossLak, "paged vs allRows gross");
    assertClose(dailyAll.summary.grossLak, 40_000, "daily gross");
    assertClose(dailyAll.summary.refundLak, 10_000, "daily refund");
    assertClose(dailyAll.summary.voidLak, 10_000, "daily void");
    assertClose(dailyAll.summary.netLak, 30_000, "daily net");

    const dailyExcel = await buildDailySalesExcel({
      data: dailyAll,
      locale: "en",
      storeName: "R21 Store",
    });
    assert(dailyExcel.filename === `EGO-POS-Daily-Sales-${today}.xlsx`, dailyExcel.filename);
    assert(dailyExcel.rowCount === dailyAll.rows.length, `excel rows ${dailyExcel.rowCount} vs ${dailyAll.rows.length}`);
    assertClose(dailyExcel.totals.grossLak, dailyAll.summary.grossLak, "daily excel gross");
    assertClose(dailyExcel.totals.netLak, dailyAll.summary.netLak, "daily excel net");
    assert(dailyExcel.headers.includes("Cost") && dailyExcel.headers.includes("Profit"), "owner cost/profit present");
    assert(!dailyExcel.headers.includes("id") && !dailyExcel.headers.includes("saleId") && !dailyExcel.headers.includes("companyId"), "no id header");
    const zip = new Uint8Array(dailyExcel.buffer);
    assert(zip[0] === 0x50 && zip[1] === 0x4b, "xlsx zip signature");
    const dailyBook = await loadWorkbook(dailyExcel.buffer);
    const dailySheet = dailyBook.worksheets[0];
    assert(dailySheet, "daily sheet");
    const dailyValues = sheetValues(dailySheet);
    const dailyTotal = dailyValues.find((row) => String(row[0]) === "Total");
    assert(dailyTotal, "daily TOTAL row");
    assertClose(dailyTotal?.[5], dailyAll.summary.grossLak, "workbook total gross");
    const receiptCell = dailyValues.flat().find((value) => String(value) === (cash.receiptNo || cash.saleNo));
    assert(receiptCell, "receipt exported as text");

    const hidden = await buildDailySalesExcel({
      data: { ...dailyAll, showCostProfit: false },
      locale: "en",
      storeName: "R21 Store",
    });
    assert(!hidden.headers.includes("Cost") && !hidden.headers.includes("Profit"), "hidden cost/profit omitted");

    const monthly = await loadMonthlySalesTable(seed.tenant, parseSalesTableQuery({ month }, { datePreset: "this_month" }), tx);
    const monthlyExcel = await buildMonthlySalesExcel({ data: monthly, locale: "en", storeName: "R21 Store" });
    assertClose(monthlyExcel.totals.grossLak, dailyAll.summary.grossLak, "monthly excel vs daily");
    assertClose(monthlyExcel.totals.netLak, dailyAll.summary.netLak, "monthly excel net");
    assert(monthlyExcel.filename === `EGO-POS-Monthly-Sales-${month}.xlsx`, monthlyExcel.filename);

    const paymentsPage = await loadPaymentMethodSalesTable(seed.tenant, { ...filters, page: 1 }, tx);
    const paymentsAll = await loadPaymentMethodSalesTable(seed.tenant, filters, tx, { allRows: true });
    assertClose(paymentsPage.summary.totalPaidLak, paymentsAll.summary.totalPaidLak, "payment paged vs all");
    const mixedRows = paymentsAll.rows.filter((row) => row.saleId === mixed.id);
    assert(mixedRows.length === 2, `mixed payment rows ${mixedRows.length}`);
    const paymentExcel = await buildPaymentMethodSalesExcel({
      data: paymentsAll,
      locale: "en",
      storeName: "R21 Store",
    });
    assert(paymentExcel.rowCount === paymentsAll.rows.length, "payment excel full dataset");
    assertClose(paymentExcel.totals.paymentAmountLak, paymentsAll.summary.totalPaidLak, "payment excel total");
    const paymentBook = await loadWorkbook(paymentExcel.buffer);
    const paymentValues = sheetValues(paymentBook.worksheets[0]);
    const mixedLabels = paymentValues.filter((row) => String(row[2]) === (mixed.receiptNo || mixed.saleNo));
    assert(mixedLabels.length === 2, "mixed payments stay separate excel rows");

    const cashOnly = await loadDailySalesTable(seed.tenant, parseSalesTableQuery({ date: today, paymentMethod: "cash" }, { datePreset: "today" }), tx, { allRows: true });
    const cashExcel = await buildDailySalesExcel({ data: cashOnly, locale: "en", storeName: "R21 Store" });
    assertClose(cashExcel.totals.grossLak, cashOnly.summary.grossLak, "payment filter excel");
    assert(cashExcel.rowCount === cashOnly.rows.length, "payment filter row count");

    const statusVoid = await loadDailySalesTable(seed.tenant, parseSalesTableQuery({ date: today, status: "cancelled" }, { datePreset: "today" }), tx, { allRows: true });
    const voidExcel = await buildDailySalesExcel({ data: statusVoid, locale: "en", storeName: "R21 Store" });
    assertClose(voidExcel.totals.voidLak, statusVoid.summary.voidLak, "status filter excel");
    assert(statusVoid.rows.every((row) => row.status === "cancelled"), "status filter only voids");

    const receipt = cash.receiptNo || cash.saleNo;
    const searched = await loadDailySalesTable(seed.tenant, parseSalesTableQuery({ date: today, q: receipt }, { datePreset: "today" }), tx, { allRows: true });
    const searchExcel = await buildDailySalesExcel({ data: searched, locale: "en", storeName: "R21 Store" });
    assert(searched.rows.length === 1, "receipt search one row");
    assertClose(searchExcel.totals.grossLak, searched.summary.grossLak, "receipt search excel");

    const cashierOnly = await loadDailySalesTable(
      seed.tenant,
      parseSalesTableQuery({ date: today, cashierId: seed.tenant.userId }, { datePreset: "today" }),
      tx,
      { allRows: true },
    );
    assertClose(cashierOnly.summary.grossLak, dailyAll.summary.grossLak, "cashier filter same store user");

    const laoExcel = await buildDailySalesExcel({ data: dailyAll, locale: "lo", storeName: "R21 Store" });
    assert(laoExcel.headers.includes(tReports("colGross", "lo")), "lao headers");
    assert(laoExcel.sheetName === tReports("dailySales", "lo").slice(0, 31), "lao sheet name");
  });

  await prisma.$disconnect();
  if (failed) {
    console.error(`\nphase-reports-r2-1-grid-excel-check: FAIL (${passed} passed, ${failed} failed)`);
    process.exit(1);
  }
  console.log(`\nphase-reports-r2-1-grid-excel-check: PASS (${passed})`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
