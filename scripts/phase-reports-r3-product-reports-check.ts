/**
 * REPORTS R3 — Product reports.
 * Product Sales / Category Sales / Best-Slow Sellers using R2 lifecycle math.
 * Does not change checkout, refund, void, inventory, or Production.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { canViewFullStoreReports } from "../features/permissions/store-ui-permissions";
import { CASH_SESSION_SALE_STATUSES, REPORT_SALE_STATUSES } from "../features/pos/post-sale-shared";
import { writeCompletePrismaSale, type CompletePrismaSaleInput } from "../features/pos/prisma-repository";
import { writeVoidPrismaSale } from "../features/pos/post-sale-repository";
import { writeExchangePrismaSale, writeReturnPrismaSale } from "../features/pos/return-repository";
import type { PaymentMode } from "../features/pos/types";
import { writePrismaProductCreate } from "../features/products/prisma-repository";
import {
  computeProductLinesForSale,
  PRODUCT_TABLE_PAGE_SIZE,
  PRODUCT_TABLE_SCAN_LIMIT,
} from "../features/reports/product-table-math";
import { parseProductTableQuery } from "../features/reports/product-table-query";
import {
  buildCategorySalesExcel,
  buildProductPerformanceExcel,
  buildProductSalesExcel,
  productReportRangeStamp,
} from "../features/reports/product-table-excel";
import {
  loadCategorySalesTable,
  loadProductPerformanceTable,
  loadProductSalesTable,
} from "../features/reports/product-table-repository";
import { REPORT_CENTER_PLANNED_HREFS, findReportCenterEntryByHref, isPlannedReportCenterEntry } from "../features/reports/report-center-catalog";
import { computeSaleReportMetrics, type SaleReportFacts } from "../features/reports/sales-table-math";
import { parseSalesTableQuery } from "../features/reports/sales-table-query";
import { loadDailySalesTable } from "../features/reports/sales-table-repository";
import {
  reportsCopyHasNoReplacementChars,
  reportsCopyKeyParity,
  tReports,
} from "../lib/i18n/reports-copy";
import { businessDayLabel } from "../lib/datetime/business-timezone";
import type { TenantContext } from "../lib/db/write-context";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";

const ROOT = process.cwd();
const thaiScript = /[\u0E00-\u0E7F]/;
const TX_OPTS = { maxWait: 20_000, timeout: 180_000 } as const;
const OPENING_CASH = 100_000;

class RollbackError extends Error {
  constructor() {
    super("R3 isolated fixture rollback");
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

const r3CopyKeys = [
  "productsSold",
  "unitsSold",
  "categoriesSold",
  "colProduct",
  "colSku",
  "colUnit",
  "colCategory",
  "colBills",
  "colQtySold",
  "colRefundQty",
  "colVoidQty",
  "colNetQty",
  "colBaseQty",
  "colNetSales",
  "colLastSold",
  "colRank",
  "colProducts",
  "rankMetric",
  "rank_units",
  "rank_net",
  "rank_profit",
  "rank_bills",
  "topN",
  "bestSellers",
  "slowSellers",
  "includeZeroSales",
  "zeroSales",
  "mixedUnits",
  "unitNote",
  "backToProductSales",
  "selectedProduct",
  "emptyProductTable",
  "errorProductTable",
  "loadingProductTable",
  "categoryFilter",
  "productSearch",
  "skuBarcodeSearch",
  "searchProductPlaceholder",
  "searchSkuBarcodePlaceholder",
  "performanceView",
  "lastSoldNever",
  "exportExcel",
];

const salesPage = read("app/(dashboard)/reports/products/sales/page.tsx");
const categoryPage = read("app/(dashboard)/reports/products/categories/page.tsx");
const performancePage = read("app/(dashboard)/reports/products/performance/page.tsx");
const math = read("features/reports/product-table-math.ts");
const repo = read("features/reports/product-table-repository.ts");
const ui = read("features/reports/components/product-table-report.tsx");
const excel = read("features/reports/product-table-excel.ts");
const reprint = read("features/pos/post-sale-repository.ts");
const calculator = read("features/cash-sessions/cash-session-calculator.ts");

check(
  "1. R3 routes are live, not Planned shells",
  findReportCenterEntryByHref("/reports/products/sales")?.planned !== true &&
    findReportCenterEntryByHref("/reports/products/categories")?.planned !== true &&
    findReportCenterEntryByHref("/reports/products/performance")?.planned !== true &&
    !isPlannedReportCenterEntry(findReportCenterEntryByHref("/reports/products/sales")!) &&
    !REPORT_CENTER_PLANNED_HREFS.includes("/reports/products/sales" as never) &&
    salesPage.includes("ProductSalesReportView") &&
    categoryPage.includes("CategorySalesReportView") &&
    performancePage.includes("ProductPerformanceReportView") &&
    existsSync(join(ROOT, "app/(dashboard)/reports/products/sales/loading.tsx")) &&
    existsSync(join(ROOT, "app/api/reports/products/sales/export/route.ts")) &&
    existsSync(join(ROOT, "app/api/reports/products/categories/export/route.ts")) &&
    existsSync(join(ROOT, "app/api/reports/products/performance/export/route.ts")),
);
check(
  "2. Remaining Planned reports are inventory only",
  REPORT_CENTER_PLANNED_HREFS.length === 2 &&
    REPORT_CENTER_PLANNED_HREFS.includes("/reports/inventory/on-hand") &&
    REPORT_CENTER_PLANNED_HREFS.includes("/reports/inventory/low-stock"),
);
check(
  "3. R2 lifecycle reused; current product cost is not used for sold cost",
  math.includes("computeSaleReportMetrics") &&
    math.includes("refundAmountOf") &&
    math.includes("isVoidSaleStatus") &&
    repo.includes("item.costPrice") &&
    !repo.includes("product.costPriceLak") &&
    !math.includes("current product cost"),
);
check(
  "4. Hold bills are not treated as sales",
  !REPORT_SALE_STATUSES.includes("held" as never) &&
    !repo.includes("hold") &&
    !repo.includes("reservation") &&
    repo.includes("REPORT_SALE_STATUSES"),
);
check(
  "5. Spreadsheet style + full-filter Excel, no Print/PDF",
  ui.includes("border-zinc-300") &&
    ui.includes("exportExcel") &&
    ui.includes("productTableExportHref") &&
    ui.includes("colBaseQty") &&
    excel.includes("EGO-POS-Product-Sales-") &&
    excel.includes("EGO-POS-Category-Sales-") &&
    excel.includes("EGO-POS-Product-Performance-") &&
    excel.includes("allRows") === false &&
    read("features/reports/product-table-service.ts").includes("allRows: true") &&
    !ui.includes('t("print"') &&
    !ui.includes('t("pdf"'),
);
check(
  "6. Server-side page size and scan limit",
  PRODUCT_TABLE_PAGE_SIZE === 50 && PRODUCT_TABLE_SCAN_LIMIT === 5000 && repo.includes("PRODUCT_TABLE_SCAN_LIMIT"),
);
check(
  "7. Reprint does not create a sale",
  reprint.includes("action: \"reprint\"") &&
    !/action: \"reprint\"[\s\S]{0,400}sale\.create/.test(reprint),
);
check(
  "8. EN/LO complete for R3 keys",
  reportsCopyKeyParity() &&
    reportsCopyHasNoReplacementChars() &&
    r3CopyKeys.every((key) => tReports(key, "en") !== key && tReports(key, "lo") !== tReports(key, "en") && !thaiScript.test(tReports(key, "lo"))),
);
check("9. Owner + Manager keep report access; cashier denied", canViewFullStoreReports("owner") && canViewFullStoreReports("manager") && !canViewFullStoreReports("cashier"));
check(
  "10. Batch H cash refund KPI unchanged",
  CASH_SESSION_SALE_STATUSES.includes("refunded") && calculator.includes("computeCashRefundLak"),
);

{
  const sale: SaleReportFacts = {
    createdAt: new Date(),
    createdBy: "u1",
    discountAmount: 0,
    id: "s1",
    items: [{ costPrice: 600, id: "i1", profitAmount: 400, quantity: 1 }],
    payments: [{ amount: 1000, changeAmount: 0, paymentMethod: "cash" }],
    profitAmount: 400,
    receiptNo: "R-1",
    refunds: [],
    saleNo: "S-1",
    saleStatus: "completed",
    totalAmount: 1000,
  };
  const cash = computeProductLinesForSale(sale, [{
    conversionQty: 1,
    costPrice: 600,
    id: "i1",
    productId: "p1",
    profitAmount: 400,
    quantity: 1,
    totalAmount: 1000,
    unitId: "u-piece",
  }]);
  const r2 = computeSaleReportMetrics(sale);
  check("11. Cash product Net matches R2 sale Net", cash[0]?.netLak === r2.netLak && cash[0]?.grossLak === 1000);

  const pack = computeProductLinesForSale(sale, [{
    conversionQty: 10,
    costPrice: 6000,
    id: "i1",
    productId: "p1",
    profitAmount: 3000,
    quantity: 1,
    totalAmount: 1000,
    unitId: "u-pack",
  }]);
  check("12. Pack Qty Sold is 1 and Base Qty is 10", pack[0]?.qtySold === 1 && pack[0]?.baseQty === 10);

  const box = computeProductLinesForSale({ ...sale, totalAmount: 40000, profitAmount: 10000 }, [{
    conversionQty: 50,
    costPrice: 30000,
    id: "i1",
    productId: "p1",
    profitAmount: 10000,
    quantity: 1,
    totalAmount: 40000,
    unitId: "u-box",
  }]);
  check("13. Box Qty Sold is 1 and Base Qty is 50", box[0]?.qtySold === 1 && box[0]?.baseQty === 50);

  const voided = computeProductLinesForSale({ ...sale, saleStatus: "cancelled" }, [{
    conversionQty: 1,
    costPrice: 600,
    id: "i1",
    productId: "p1",
    profitAmount: 400,
    quantity: 2,
    totalAmount: 1000,
    unitId: "u-piece",
  }]);
  check(
    "14. Void is Void Qty only",
    voided[0]?.voidQty === 2 && voided[0]?.qtySold === 0 && voided[0]?.grossLak === 0 && voided[0]?.netLak === 0,
  );

  const refunded = computeProductLinesForSale({
    ...sale,
    saleStatus: "refunded",
    refunds: [{ kind: "refund", refundAmount: 1000, totalAmount: 1000, items: [{ amount: 1000, productId: "p1", quantity: 1, saleItemId: "i1" }] }],
  }, [{
    conversionQty: 1,
    costPrice: 600,
    id: "i1",
    productId: "p1",
    profitAmount: 400,
    quantity: 1,
    totalAmount: 1000,
    unitId: "u-piece",
  }]);
  check(
    "15. Full refund keeps Gross and zeros Net",
    refunded[0]?.grossLak === 1000 && refunded[0]?.refundLak === 1000 && refunded[0]?.netLak === 0 && refunded[0]?.refundQty === 1,
  );

  const held = computeProductLinesForSale({ ...sale, saleStatus: "held" }, [{
    conversionQty: 1,
    costPrice: 600,
    id: "i1",
    productId: "p1",
    profitAmount: 400,
    quantity: 1,
    totalAmount: 1000,
  }]);
  check("16. Hold status is not sold", held.length === 0 || (held[0]?.qtySold === 0 && held[0]?.netLak === 0 && held[0]?.grossLak === 0));

  const exchanged = computeProductLinesForSale({
    ...sale,
    saleStatus: "exchanged",
    refunds: [{
      exchangeItems: [{ costPrice: 600, productId: "p2", quantity: 1, totalAmount: 1000, conversionQty: 1 }],
      items: [{ amount: 1000, productId: "p1", quantity: 1, saleItemId: "i1" }],
      kind: "exchange",
      paymentAmount: 0,
      refundAmount: 0,
      totalAmount: 1000,
    }],
  }, [{
    conversionQty: 1,
    costPrice: 600,
    id: "i1",
    productId: "p1",
    profitAmount: 400,
    quantity: 1,
    totalAmount: 1000,
  }]);
  const exchangeNet = exchanged.reduce((sum, line) => sum + line.netLak, 0);
  check("17. Equal exchange Net stays original Gross", exchangeNet === 1000);
}

{
  const query = parseProductTableQuery({ dateFrom: "2026-09-01", dateTo: "2026-09-21", datePreset: "custom" }, { datePreset: "today" });
  check(
    "18. Custom range and this_week parse",
    query.datePreset === "custom" &&
      parseProductTableQuery({ datePreset: "this_week" }, { datePreset: "today" }).datePreset === "this_week" &&
      productReportRangeStamp(query).includes("2026-09-01-to-2026-09-21"),
  );
}

loadProjectEnvFiles();
process.env.IGO_DEMO_MODE = "false";

type Tx = any;

async function createIsolatedTenant(tx: Tx, label: string) {
  const token = randomBytes(6).toString("hex");
  const user = await tx.user.create({
    data: { fullName: `R3 ${label}`, passwordHash: "isolated-fixture", username: `r3u${token}` },
  });
  const company = await tx.company.create({
    data: { businessTemplateKey: "mini-mart", name: `R3 ${label}`, ownerUserId: user.id, storeCode: `r3${token}` },
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

function pieceInput(nameEn: string, price: number, sku: string, barcode: string, categoryId?: string) {
  return {
    barcode,
    categoryId,
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
  const ctx = await createIsolatedTenant(tx, "product-reports");
  const drinks = await tx.category.create({
    data: { branchId: ctx.tenant.branchId, companyId: ctx.tenant.companyId, nameEn: "Drinks", nameLo: "Drinks" },
  });
  const snacks = await tx.category.create({
    data: { branchId: ctx.tenant.branchId, companyId: ctx.tenant.companyId, nameEn: "Snacks", nameLo: "Snacks" },
  });
  const productA = await writePrismaProductCreate(tx, pieceInput("EGO R3 Alpha", 10000, "R3-A", "0411111111111", drinks.id), ctx.tenant);
  const productB = await writePrismaProductCreate(tx, pieceInput("EGO R3 Bravo", 5000, "R3-B", "0422222222222", snacks.id), ctx.tenant);
  const productC = await writePrismaProductCreate(tx, {
    barcode: "0433333333333",
    categoryId: drinks.id,
    costPriceLak: 600,
    nameEn: "EGO R3 Multi",
    nameLo: "EGO R3 Multi",
    sellingPriceLak: 1000,
    sku: "R3-C",
    units: [
      { barcode: "0433333333333", conversionQty: 1, costPriceLak: 600, isBaseUnit: true, isDefaultSaleUnit: true, isPurchaseUnit: true, sellingPriceLak: 1000, unitName: "Piece" },
      { barcode: "0433333333340", conversionQty: 10, costPriceLak: 6000, isBaseUnit: false, isDefaultSaleUnit: false, isPurchaseUnit: true, sellingPriceLak: 9000, unitName: "Pack" },
      { barcode: "0433333333357", conversionQty: 50, costPriceLak: 30000, isBaseUnit: false, isDefaultSaleUnit: false, isPurchaseUnit: true, sellingPriceLak: 40000, unitName: "Box" },
    ],
  }, ctx.tenant);
  const productD = await writePrismaProductCreate(tx, pieceInput("EGO R3 Delta Zero", 2000, "R3-D", "0444444444444", snacks.id), ctx.tenant);
  await tx.inventoryBalance.upsert({
    create: { companyId: ctx.tenant.companyId, productId: productA.id, quantity: 80, warehouseId: ctx.warehouseId },
    update: { quantity: 80 },
    where: { warehouseId_productId: { productId: productA.id, warehouseId: ctx.warehouseId } },
  });
  await tx.inventoryBalance.upsert({
    create: { companyId: ctx.tenant.companyId, productId: productB.id, quantity: 40, warehouseId: ctx.warehouseId },
    update: { quantity: 40 },
    where: { warehouseId_productId: { productId: productB.id, warehouseId: ctx.warehouseId } },
  });
  await tx.inventoryBalance.upsert({
    create: { companyId: ctx.tenant.companyId, productId: productC.id, quantity: 200, warehouseId: ctx.warehouseId },
    update: { quantity: 200 },
    where: { warehouseId_productId: { productId: productC.id, warehouseId: ctx.warehouseId } },
  });
  await tx.inventoryBalance.upsert({
    create: { companyId: ctx.tenant.companyId, productId: productD.id, quantity: 10, warehouseId: ctx.warehouseId },
    update: { quantity: 10 },
    where: { warehouseId_productId: { productId: productD.id, warehouseId: ctx.warehouseId } },
  });
  const unitA = productA.units.find((unit: { isBaseUnit: boolean }) => unit.isBaseUnit) ?? productA.units[0];
  const unitB = productB.units.find((unit: { isBaseUnit: boolean }) => unit.isBaseUnit) ?? productB.units[0];
  const unitCPiece = productC.units.find((unit: { unitName: string }) => unit.unitName === "Piece") ?? productC.units[0];
  const unitCPack = productC.units.find((unit: { unitName: string }) => unit.unitName === "Pack") ?? productC.units[1];
  const unitCBox = productC.units.find((unit: { unitName: string }) => unit.unitName === "Box") ?? productC.units[2];
  return { ...ctx, drinks, productA, productB, productC, productD, snacks, unitA, unitB, unitCBox, unitCPack, unitCPiece };
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
  items: Array<{ productId: string; quantity: number; sellingPrice: number; unitId?: string }>,
  payment: { paymentMode: PaymentMode; totalAmount: number; cashAmount?: number; qrAmount?: number; transferAmount?: number },
) {
  return writeCompletePrismaSale(tx, checkoutInput(seed.tenant, items, payment), seed.tenant);
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

  await isolated("19. Live matrix reconciles Product / Category / Best-Slow / R2 Daily", async (tx) => {
    const seed = await seedStore(tx);
    const today = businessDayLabel(new Date());
    const productQuery = parseProductTableQuery({ date: today }, { datePreset: "today" });
    const dailyQuery = parseSalesTableQuery({ date: today }, { datePreset: "today" });

    await sell(tx, seed, [{ productId: seed.productA.id, quantity: 1, sellingPrice: 10000, unitId: seed.unitA.id }], { paymentMode: "cash", totalAmount: 10000, cashAmount: 10000 });
    await sell(tx, seed, [{ productId: seed.productA.id, quantity: 1, sellingPrice: 10000, unitId: seed.unitA.id }], { paymentMode: "mixed", totalAmount: 10000, cashAmount: 4000, transferAmount: 6000 });
    const piece = await sell(tx, seed, [{ productId: seed.productC.id, quantity: 1, sellingPrice: 1000, unitId: seed.unitCPiece.id }], { paymentMode: "cash", totalAmount: 1000, cashAmount: 1000 });
    const pack = await sell(tx, seed, [{ productId: seed.productC.id, quantity: 1, sellingPrice: 9000, unitId: seed.unitCPack.id }], { paymentMode: "cash", totalAmount: 9000, cashAmount: 9000 });
    const box = await sell(tx, seed, [{ productId: seed.productC.id, quantity: 1, sellingPrice: 40000, unitId: seed.unitCBox.id }], { paymentMode: "cash", totalAmount: 40000, cashAmount: 40000 });
    const fullRefundSale = await sell(tx, seed, [{ productId: seed.productA.id, quantity: 1, sellingPrice: 10000, unitId: seed.unitA.id }], { paymentMode: "cash", totalAmount: 10000, cashAmount: 10000 });
    await writeReturnPrismaSale(tx, seed.tenant, {
      items: [{ condition: "sellable", quantity: 1, saleItemId: fullRefundSale.items[0].id }],
      refundMethod: "cash",
      saleId: fullRefundSale.id,
    });
    const partialSale = await sell(tx, seed, [{ productId: seed.productA.id, quantity: 2, sellingPrice: 10000, unitId: seed.unitA.id }], { paymentMode: "cash", totalAmount: 20000, cashAmount: 20000 });
    await writeReturnPrismaSale(tx, seed.tenant, {
      items: [{ condition: "sellable", quantity: 1, saleItemId: partialSale.items[0].id }],
      refundMethod: "cash",
      saleId: partialSale.id,
    });
    const voidSale = await sell(tx, seed, [{ productId: seed.productA.id, quantity: 1, sellingPrice: 10000, unitId: seed.unitA.id }], { paymentMode: "cash", totalAmount: 10000, cashAmount: 10000 });
    await writeVoidPrismaSale(tx, seed.tenant, { reason: "r3", saleId: voidSale.id });
    const exchangeSale = await sell(tx, seed, [{ productId: seed.productB.id, quantity: 1, sellingPrice: 5000, unitId: seed.unitB.id }], { paymentMode: "cash", totalAmount: 5000, cashAmount: 5000 });
    await writeExchangePrismaSale(tx, seed.tenant, {
      paidAmountLak: 0,
      refundMethod: "cash",
      replacementItems: [{ productId: seed.productB.id, quantity: 1, unitId: seed.unitB.id }],
      returnedItems: [{ condition: "sellable", quantity: 1, saleItemId: exchangeSale.items[0].id }],
      saleId: exchangeSale.id,
    });

    await expectFailure(tx, () => writeReturnPrismaSale(tx, seed.tenant, {
      items: [{ condition: "sellable", quantity: 1, saleItemId: fullRefundSale.items[0].id }],
      refundMethod: "cash",
      saleId: fullRefundSale.id,
    }), /Cannot return more than the remaining|already refunded|remaining/i, "duplicate refund");

    const saleCount = await tx.sale.count({ where: { companyId: seed.tenant.companyId } });
    assert(saleCount === 9, `expected 9 sales, got ${saleCount}`);

    await tx.product.update({ data: { costPriceLak: 1 }, where: { id: seed.productA.id } });

    const products = await loadProductSalesTable(seed.tenant, productQuery, tx, { allRows: true });
    const daily = await loadDailySalesTable(seed.tenant, dailyQuery, tx);
    assertClose(products.summary.netLak, daily.summary.netLak, "product net vs R2 daily net");
    assertClose(products.summary.grossLak, daily.summary.grossLak, "product gross vs R2");
    assertClose(products.summary.refundLak, daily.summary.refundLak, "product refund vs R2");
    assertClose(products.summary.voidLak, daily.summary.voidLak, "product void vs R2");
    assertClose(products.summary.costLak, daily.summary.costLak, "product cost vs R2");
    assertClose(products.summary.profitLak, daily.summary.profitLak, "product profit vs R2");
    assertClose(products.totalRow.netLak, products.summary.netLak, "TOTAL net equals summary");

    const alpha = products.rows.find((row) => row.productId === seed.productA.id);
    assert(alpha, "alpha row");
    assert(alpha && alpha.costLak !== 1 && alpha.costLak > 100, "historical cost snapshot, not current product cost");

    const multi = products.rows.find((row) => row.productId === seed.productC.id);
    assert(multi, "multi-unit row");
    assertClose(multi?.qtySold, 3, "piece+pack+box transaction qty");
    assertClose(multi?.baseQty, 61, "1 + 10 + 50 base qty");
    assert(multi?.unitLabel === "Mixed" || Boolean(multi?.unitLabel), "mixed or labeled units");
    void piece;
    void pack;
    void box;

    const categories = await loadCategorySalesTable(seed.tenant, parseProductTableQuery({ date: today }, { datePreset: "this_month" }), tx, { allRows: true });
    assertClose(categories.summary.netLak, products.summary.netLak, "category net vs product net");
    assertClose(categories.totalRow.netLak, categories.summary.netLak, "category TOTAL");
    const drinksRow = categories.rows.find((row) => row.categoryId === seed.drinks.id);
    const drinkProducts = products.rows.filter((row) => row.categoryId === seed.drinks.id);
    assert(drinksRow, "drinks category");
    assertClose(drinksRow?.netLak ?? 0, drinkProducts.reduce((sum, row) => sum + row.netLak, 0), "category = sum of products");
    assertClose(drinksRow?.products ?? 0, drinkProducts.length, "category product count");

    const best = await loadProductPerformanceTable(seed.tenant, parseProductTableQuery({ date: today, metric: "net", view: "best", topN: "20" }, { datePreset: "this_month" }), tx, { allRows: true });
    const slow = await loadProductPerformanceTable(seed.tenant, parseProductTableQuery({ date: today, metric: "net", view: "slow", topN: "20" }, { datePreset: "this_month" }), tx, { allRows: true });
    assertClose(best.summary.netLak, products.summary.netLak, "best summary net vs product");
    const recognized = products.rows.filter((row) => row.qtySold > 0 || row.netLak !== 0 || row.refundQty > 0);
    assert(best.rows[0] && best.rows[1] ? best.rows[0].netLak >= best.rows[1].netLak : best.rows.length >= 1, "best descending");
    assert(slow.rows[0] && slow.rows[1] ? slow.rows[0].netLak <= slow.rows[1].netLak : slow.rows.length >= 1, "slow ascending");
    for (const row of best.rows.filter((item) => !item.zeroSale)) {
      const match = recognized.find((item) => item.productId === row.productId);
      assert(match, `best row ${row.name} exists in product sales`);
      assertClose(row.netLak, match?.netLak ?? 0, `${row.name} net`);
      assertClose(row.baseQty, match?.baseQty ?? 0, `${row.name} units`);
    }

    const slowZero = await loadProductPerformanceTable(seed.tenant, parseProductTableQuery({ date: today, view: "slow", includeZero: "1" }, { datePreset: "this_month" }), tx, { allRows: true });
    const zero = slowZero.rows.find((row) => row.productId === seed.productD.id);
    assert(zero?.zeroSale === true && zero.netLak === 0 && zero.qtySold === 0, "zero-sale labeled separately");

    const drill = await loadProductSalesTable(seed.tenant, parseProductTableQuery({ date: today, productId: seed.productC.id }, { datePreset: "today" }), tx);
    assert(drill.selectedProduct?.productId === seed.productC.id, "product drill-down selected");
    assert(drill.detailRows.length >= 3, `multi-unit detail rows ${drill.detailRows.length}`);

    const generatedAt = new Date("2026-09-22T03:00:00.000Z");
    const productExcel = await buildProductSalesExcel({ data: products, generatedAt, locale: "en", storeName: "EGO POS" });
    const categoryExcel = await buildCategorySalesExcel({ data: categories, generatedAt, locale: "en", storeName: "EGO POS" });
    const performanceExcel = await buildProductPerformanceExcel({ data: best, generatedAt, locale: "en", storeName: "EGO POS" });
    assert(productExcel.filename.startsWith("EGO-POS-Product-Sales-") && productExcel.filename.endsWith(".xlsx"), productExcel.filename);
    assert(categoryExcel.filename.startsWith("EGO-POS-Category-Sales-") && categoryExcel.filename.endsWith(".xlsx"), categoryExcel.filename);
    assert(performanceExcel.filename.startsWith("EGO-POS-Product-Performance-") && performanceExcel.filename.endsWith(".xlsx"), performanceExcel.filename);
    assert(productExcel.rowCount === products.rows.length, "excel uses full filtered dataset");
    assert(productExcel.headers.includes("Cost") && productExcel.headers.includes("Profit"), "owner cost/profit export");
  });

  await prisma.$disconnect();
  if (failed) {
    console.error(`\nphase-reports-r3-product-reports-check: FAIL (${passed} passed, ${failed} failed)`);
    process.exit(1);
  }
  console.log(`\nphase-reports-r3-product-reports-check: PASS (${passed})`);
}

async function expectFailure(tx: Tx, run: () => Promise<unknown>, pattern: RegExp, label: string) {
  try {
    await run();
    throw new Error(`${label} should have failed`);
  } catch (error) {
    if (error instanceof Error && pattern.test(error.message)) return;
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
