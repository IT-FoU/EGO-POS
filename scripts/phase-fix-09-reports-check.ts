import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { buildCashSessionTotals, summarizeSalePayments } from "../features/cash-sessions/cash-session-calculator";
import { getPrismaDashboardSnapshot } from "../features/dashboard/dashboard-service";
import { writeStockIn } from "../features/inventory/prisma-repository";
import { CASH_SESSION_SALE_STATUSES } from "../features/pos/post-sale-shared";
import { writeCompletePrismaSale, type CompletePrismaSaleInput } from "../features/pos/prisma-repository";
import { writeVoidPrismaSale } from "../features/pos/post-sale-repository";
import { writeExchangePrismaSale, writeReturnPrismaSale } from "../features/pos/return-repository";
import type { PaymentMode } from "../features/pos/types";
import { writePrismaProductCreate } from "../features/products/prisma-repository";
import { getPrismaReportsSnapshot } from "../features/reports/prisma-repository";
import { assertPermission, PermissionDeniedError, READ_PERMISSIONS } from "../lib/auth/permissions";
import { startOfBusinessDay, BUSINESS_TIME_ZONE } from "../lib/datetime/business-timezone";
import type { TenantContext } from "../lib/db/write-context";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";

const TARGET_REF = "ieutdqnlfiiaawctapor";
const GOFLO_REF = "luivrsuotrdkgxkhxxbq";
const OLD_PRO_REF = "urqizygucheilflanlea";
const TX_OPTS = { maxWait: 20_000, timeout: 180_000 } as const;
const OPENING_CASH = 100_000;
const ALL = { datePreset: "all" as const };

class RollbackError extends Error {
  constructor() {
    super("FIX-09 isolated fixture rollback");
    this.name = "RollbackError";
  }
}

function loadEnv() {
  for (const fileName of [".env", ".env.local"]) {
    if (!existsSync(fileName)) continue;
    for (const line of readFileSync(fileName, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) continue;
      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadEnv();
loadProjectEnvFiles();
process.env.IGO_DEMO_MODE = "false";

type Tx = any;

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

async function goboxCounts(prisma: PrismaClient) {
  const company = await prisma.company.findFirst({ where: { storeCode: "0001" } });
  if (!company) throw new Error("GO BOX company storeCode 0001 was not found.");
  const [products, balances, lots, movements, sales, refunds] = await Promise.all([
    prisma.product.count({ where: { companyId: company.id } }),
    prisma.inventoryBalance.count({ where: { companyId: company.id } }),
    prisma.inventoryLot.count({ where: { companyId: company.id } }),
    prisma.stockMovement.count({ where: { companyId: company.id } }),
    prisma.sale.count({ where: { companyId: company.id } }),
    prisma.refund.count({ where: { companyId: company.id } }),
  ]);
  return { balances, companyId: company.id, lots, movements, products, refunds, sales };
}

async function createIsolatedTenant(tx: Tx, label: string) {
  const token = randomBytes(6).toString("hex");
  const storeCode = `e9${token}`;
  const user = await tx.user.create({
    data: { fullName: `FIX-09 ${label}`, passwordHash: "isolated-fixture", username: `e9u${token}` },
  });
  const company = await tx.company.create({
    data: { businessTemplateKey: "mini-mart", name: `FIX-09 ${label}`, ownerUserId: user.id, storeCode },
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
  return { branchId: branch.id, storeCode, tenant, warehouseId: warehouse.id };
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

async function setBalance(tx: Tx, tenant: TenantContext, productId: string, warehouseId: string, quantity: number) {
  await tx.inventoryBalance.upsert({
    create: { companyId: tenant.companyId, productId, quantity, warehouseId },
    update: { quantity },
    where: { warehouseId_productId: { productId, warehouseId } },
  });
}

async function seedStore(tx: Tx) {
  const ctx = await createIsolatedTenant(tx, "reports");
  const productA = await writePrismaProductCreate(tx, pieceInput("EGO FIX09 Alpha", 10000, "E9-A", "0911111111111"), ctx.tenant);
  const productB = await writePrismaProductCreate(tx, pieceInput("EGO FIX09 Bravo", 5000, "E9-B", "0922222222222"), ctx.tenant);
  const productC = await writePrismaProductCreate(tx, {
    ...pieceInput("EGO FIX09 Pack", 1000, "E9-C", "0933333333333"),
    units: [
      { barcode: "0933333333333", conversionQty: 1, costPriceLak: 600, isBaseUnit: true, isDefaultSaleUnit: true, isPurchaseUnit: true, sellingPriceLak: 1000, unitName: "Piece" },
      { barcode: "0933333333340", conversionQty: 12, costPriceLak: 7200, isBaseUnit: false, isDefaultSaleUnit: false, isPurchaseUnit: true, sellingPriceLak: 11000, unitName: "Carton" },
    ],
  }, ctx.tenant);
  await setBalance(tx, ctx.tenant, productA.id, ctx.warehouseId, 40);
  await setBalance(tx, ctx.tenant, productB.id, ctx.warehouseId, 40);
  await setBalance(tx, ctx.tenant, productC.id, ctx.warehouseId, 48);
  await tx.inventoryLot.create({
    data: {
      companyId: ctx.tenant.companyId,
      expiryDate: new Date("2027-01-01"),
      lotNumber: "E9-LOT-1",
      productId: productB.id,
      quantity: 20,
      receivedAt: new Date("2026-01-01"),
      warehouseId: ctx.warehouseId,
    },
  });
  await tx.inventoryLot.create({
    data: {
      companyId: ctx.tenant.companyId,
      expiryDate: new Date("2027-06-01"),
      lotNumber: "E9-LOT-2",
      productId: productB.id,
      quantity: 20,
      receivedAt: new Date("2026-02-01"),
      warehouseId: ctx.warehouseId,
    },
  });
  const unitA = productA.units.find((unit: { isBaseUnit: boolean }) => unit.isBaseUnit) ?? productA.units[0];
  const unitB = productB.units.find((unit: { isBaseUnit: boolean }) => unit.isBaseUnit) ?? productB.units[0];
  const unitCPack = productC.units.find((unit: { conversionQty: number }) => Number(unit.conversionQty) === 12) ?? productC.units[1];
  return { ...ctx, productA, productB, productC, unitA, unitB, unitCPack };
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

async function sellCash(tx: Tx, seed: Awaited<ReturnType<typeof seedStore>>, qtyA = 1) {
  return writeCompletePrismaSale(tx, checkoutInput(seed.tenant, [{
    productId: seed.productA.id,
    quantity: qtyA,
    sellingPrice: 10000,
    unitId: seed.unitA.id,
  }], { paymentMode: "cash", totalAmount: 10000 * qtyA, cashAmount: 10000 * qtyA }), seed.tenant);
}

function paymentValue(hub: { paymentBreakdown: Array<{ label: string; value: number }> }, label: string) {
  return money(hub.paymentBreakdown.find((row) => row.label.toLowerCase() === label.toLowerCase())?.value);
}

function wiringPass() {
  const analytics = readFileSync("features/reports/components/reports-analytics-client.tsx", "utf8");
  const reports = readFileSync("features/reports/prisma-repository.ts", "utf8");
  const dash = readFileSync("features/dashboard/dashboard-service.ts", "utf8");
  assert(!analytics.includes("5940000") && !analytics.includes("56000"), "Reports client still has hardcoded KPI numbers");
  assert(reports.includes("netReportLifecycle") && reports.includes("REPORT_SALE_STATUSES"), "Lifecycle netting missing");
  assert(!reports.includes("getPrismaInventorySnapshot") && !reports.includes("getPrismaCustomersSnapshot") && !reports.includes("getPrismaProducts(") && !reports.includes("getPrismaSuppliersSnapshot"), "Reports still loads full catalogue snapshots");
  assert(reports.includes("timedReportsLoad(\"parallel-reads\"") && reports.includes("Promise.all"), "Reports first-paint reads are not parallel");
  assert(!reports.includes("salesAggregate") || !reports.includes("hasCompletedSales"), "Reports still gates on a sequential sales aggregate");
  assert(dash.includes("getPrismaDashboardSalesKpis"), "Dashboard does not reuse canonical sales KPIs");
  assert(!dash.includes("getPrismaReportsSnapshot"), "Dashboard still loads the full Reports snapshot");
  assert(!dash.includes("getPrismaInventorySnapshot"), "Dashboard still loads the inventory snapshot");
  assert(!dash.includes("getPrismaCustomersSnapshot"), "Dashboard still loads the customers snapshot");
  assert(BUSINESS_TIME_ZONE === "Asia/Vientiane", "Business timezone must be Asia/Vientiane");
  assert(!reports.includes("IGO_DEMO_MODE") && !dash.includes("mock-full-data"), "Demo report leakage in live path");
}

async function main() {
  const url = resolveScriptDatabaseUrl("test-write");

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, ssl: { rejectUnauthorized: false } }),
  });
  const before = await goboxCounts(prisma);
  const results: Array<{ name: string; status: "PASS" | "FAIL"; detail?: string }> = [];

  async function isolated(name: string, run: (tx: Tx) => Promise<void>) {
    try {
      await prisma.$transaction(async (tx) => {
        await run(tx);
        throw new RollbackError();
      }, TX_OPTS);
    } catch (error) {
      if (error instanceof RollbackError) {
        results.push({ name, status: "PASS" });
        return;
      }
      results.push({
        detail: error instanceof Error ? error.message : String(error),
        name,
        status: "FAIL",
      });
    }
  }

  wiringPass();

  await isolated("1. Normal completed cash sale", async (tx) => {
    const seed = await seedStore(tx);
    await sellCash(tx, seed);
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    const dash = await getPrismaDashboardSnapshot(seed.tenant, { key: "today" }, tx);
    assertClose(reports.analytics.totalRevenue, 10000, "cash revenue");
    assertClose(reports.grossSalesLak, 10000, "cash gross");
    assertClose(dash.cards.netSalesLak, 10000, "dash net");
    assertClose(paymentValue(reports.hub, "Cash"), 10000, "cash payment");
  });

  await isolated("2. Normal non-cash sale", async (tx) => {
    const seed = await seedStore(tx);
    await writeCompletePrismaSale(tx, checkoutInput(seed.tenant, [{
      productId: seed.productA.id, quantity: 1, sellingPrice: 10000, unitId: seed.unitA.id,
    }], { paymentMode: "qr", totalAmount: 10000, qrAmount: 10000, cashAmount: 0 }), seed.tenant);
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    assertClose(reports.analytics.totalRevenue, 10000, "qr revenue");
    assertClose(paymentValue(reports.hub, "QR"), 10000, "qr payment");
    assertClose(paymentValue(reports.hub, "Cash"), 0, "cash not inflated");
  });

  await isolated("3. Split payment", async (tx) => {
    const seed = await seedStore(tx);
    await writeCompletePrismaSale(tx, checkoutInput(seed.tenant, [{
      productId: seed.productA.id, quantity: 1, sellingPrice: 10000, unitId: seed.unitA.id,
    }], { paymentMode: "mixed", totalAmount: 10000, cashAmount: 5000, transferAmount: 5000 }), seed.tenant);
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    assertClose(reports.analytics.totalRevenue, 10000, "split revenue");
    assertClose(paymentValue(reports.hub, "Cash") + paymentValue(reports.hub, "Transfer"), 10000, "split payments");
  });

  await isolated("4. Partial refund", async (tx) => {
    const seed = await seedStore(tx);
    const sale = await writeCompletePrismaSale(tx, checkoutInput(seed.tenant, [{
      productId: seed.productA.id, quantity: 10, sellingPrice: 10000, unitId: seed.unitA.id,
    }], { paymentMode: "cash", totalAmount: 100000, cashAmount: 100000 }), seed.tenant);
    await writeReturnPrismaSale(tx, seed.tenant, {
      items: [{ condition: "sellable", quantity: 3, saleItemId: sale.items[0].id }],
      refundMethod: "cash",
      saleId: sale.id,
    });
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    assertClose(reports.grossSalesLak, 100000, "gross remains original");
    assertClose(reports.refundLak, 30000, "partial refund");
    assertClose(reports.analytics.totalRevenue, 70000, "net after partial");
  });

  await isolated("5. Multiple partial refunds", async (tx) => {
    const seed = await seedStore(tx);
    const sale = await writeCompletePrismaSale(tx, checkoutInput(seed.tenant, [{
      productId: seed.productA.id, quantity: 10, sellingPrice: 10000, unitId: seed.unitA.id,
    }], { paymentMode: "cash", totalAmount: 100000, cashAmount: 100000 }), seed.tenant);
    await writeReturnPrismaSale(tx, seed.tenant, {
      items: [{ condition: "sellable", quantity: 2, saleItemId: sale.items[0].id }],
      refundMethod: "cash",
      saleId: sale.id,
    });
    await writeReturnPrismaSale(tx, seed.tenant, {
      items: [{ condition: "sellable", quantity: 1, saleItemId: sale.items[0].id }],
      refundMethod: "cash",
      saleId: sale.id,
    });
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    assertClose(reports.refundLak, 30000, "two partials");
    assertClose(reports.analytics.totalRevenue, 70000, "net after two partials");
  });

  await isolated("6. Full refund", async (tx) => {
    const seed = await seedStore(tx);
    const sale = await sellCash(tx, seed);
    await writeReturnPrismaSale(tx, seed.tenant, {
      items: [{ condition: "sellable", quantity: 1, saleItemId: sale.items[0].id }],
      refundMethod: "cash",
      saleId: sale.id,
    });
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    assertClose(reports.analytics.totalRevenue, 0, "full refund net");
    assertClose(reports.refundLak, 10000, "full refund amount");
    assertClose(reports.grossSalesLak, 10000, "original still gross");
  });

  await isolated("7. Void", async (tx) => {
    const seed = await seedStore(tx);
    const sale = await sellCash(tx, seed);
    await writeVoidPrismaSale(tx, seed.tenant, { reason: "test", saleId: sale.id });
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    const dash = await getPrismaDashboardSnapshot(seed.tenant, { key: "today" }, tx);
    assertClose(reports.analytics.totalRevenue, 0, "void excluded from net");
    assertClose(reports.grossSalesLak, 0, "void excluded from gross");
    assert(dash.cards.voidCount >= 1, "void counted operationally");
  });

  await isolated("8. Equal exchange", async (tx) => {
    const seed = await seedStore(tx);
    const sale = await sellCash(tx, seed);
    await writeExchangePrismaSale(tx, seed.tenant, {
      paidAmountLak: 0,
      refundMethod: "cash",
      replacementItems: [{ productId: seed.productA.id, quantity: 1, unitId: seed.unitA.id }],
      returnedItems: [{ condition: "sellable", quantity: 1, saleItemId: sale.items[0].id }],
      saleId: sale.id,
    });
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    assertClose(reports.analytics.totalRevenue, 10000, "equal exchange not doubled");
  });

  await isolated("9. Exchange customer pays difference", async (tx) => {
    const seed = await seedStore(tx);
    const sale = await sellCash(tx, seed);
    await writeExchangePrismaSale(tx, seed.tenant, {
      paidAmountLak: 5000,
      refundMethod: "cash",
      replacementItems: [{ productId: seed.productB.id, quantity: 3, unitId: seed.unitB.id }],
      returnedItems: [{ condition: "sellable", quantity: 1, saleItemId: sale.items[0].id }],
      saleId: sale.id,
    });
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    assertClose(reports.analytics.totalRevenue, 15000, "customer pays +5000");
  });

  await isolated("10. Exchange store refunds difference", async (tx) => {
    const seed = await seedStore(tx);
    const sale = await writeCompletePrismaSale(tx, checkoutInput(seed.tenant, [{
      productId: seed.productB.id, quantity: 3, sellingPrice: 5000, unitId: seed.unitB.id,
    }], { paymentMode: "cash", totalAmount: 15000, cashAmount: 15000 }), seed.tenant);
    await writeExchangePrismaSale(tx, seed.tenant, {
      paidAmountLak: 0,
      refundMethod: "cash",
      replacementItems: [{ productId: seed.productA.id, quantity: 1, unitId: seed.unitA.id }],
      returnedItems: [{ condition: "sellable", quantity: 3, saleItemId: sale.items[0].id }],
      saleId: sale.id,
    });
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    assertClose(reports.analytics.totalRevenue, 10000, "store refunds to 10000");
  });

  await isolated("11. Discounted sale", async (tx) => {
    const seed = await seedStore(tx);
    const sale = await writeCompletePrismaSale(tx, checkoutInput(seed.tenant, [{
      productId: seed.productA.id, quantity: 1, sellingPrice: 10000, unitId: seed.unitA.id,
    }], { paymentMode: "cash", totalAmount: 9000, cashAmount: 9000, discountAmount: 1000 }), seed.tenant);
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    assertClose(reports.analytics.totalRevenue, money(sale.totalAmount), "discounted net uses paid total");
    assert(money(sale.totalAmount) <= 10000, "discounted sale not grossed up");
  });

  await isolated("12. Promotion-discounted historical sale", async (tx) => {
    const seed = await seedStore(tx);
    const sale = await sellCash(tx, seed);
    await tx.promotion.create({
      data: {
        companyId: seed.tenant.companyId,
        discountPercent: 50,
        endDate: new Date("2027-12-31"),
        isActive: true,
        promotionName: "E9-HIST",
        startDate: new Date("2026-01-01"),
        status: "active",
      },
    });
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    assertClose(reports.analytics.totalRevenue, money(sale.totalAmount), "historical sale not rewritten by new promo");
  });

  await isolated("13. Multi-product sale", async (tx) => {
    const seed = await seedStore(tx);
    await writeCompletePrismaSale(tx, checkoutInput(seed.tenant, [
      { productId: seed.productA.id, quantity: 1, sellingPrice: 10000, unitId: seed.unitA.id },
      { productId: seed.productB.id, quantity: 2, sellingPrice: 5000, unitId: seed.unitB.id },
    ], { paymentMode: "cash", totalAmount: 20000, cashAmount: 20000 }), seed.tenant);
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    assertClose(reports.analytics.totalRevenue, 20000, "multi-product revenue");
    assert(reports.productRows.length >= 2, "both products reported");
  });

  await isolated("14. Pack/unit sale", async (tx) => {
    const seed = await seedStore(tx);
    await writeCompletePrismaSale(tx, checkoutInput(seed.tenant, [{
      productId: seed.productC.id, quantity: 1, sellingPrice: 11000, unitId: seed.unitCPack.id,
    }], { paymentMode: "cash", totalAmount: 11000, cashAmount: 11000 }), seed.tenant);
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    assertClose(reports.analytics.totalRevenue, 11000, "pack revenue");
    const row = reports.productRows.find((item) => item.productName.includes("Pack"));
    assert(row && row.quantitySold >= 1, "pack quantity reported");
  });

  await isolated("15. Cash refund", async (tx) => {
    const seed = await seedStore(tx);
    const sale = await sellCash(tx, seed);
    await writeReturnPrismaSale(tx, seed.tenant, {
      items: [{ condition: "sellable", quantity: 1, saleItemId: sale.items[0].id }],
      refundMethod: "cash",
      saleId: sale.id,
    });
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    assertClose(paymentValue(reports.hub, "Cash"), 0, "cash refund nets cash payment");
  });

  await isolated("16. Non-cash refund", async (tx) => {
    const seed = await seedStore(tx);
    const sale = await writeCompletePrismaSale(tx, checkoutInput(seed.tenant, [{
      productId: seed.productA.id, quantity: 1, sellingPrice: 10000, unitId: seed.unitA.id,
    }], { paymentMode: "qr", totalAmount: 10000, qrAmount: 10000, cashAmount: 0 }), seed.tenant);
    await writeReturnPrismaSale(tx, seed.tenant, {
      items: [{ condition: "sellable", quantity: 1, saleItemId: sale.items[0].id }],
      refundMethod: "qr",
      saleId: sale.id,
    });
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    assertClose(paymentValue(reports.hub, "QR"), 0, "qr refund nets qr");
    assertClose(paymentValue(reports.hub, "Cash"), 0, "cash untouched");
  });

  await isolated("17. Cash session vs cash sale", async (tx) => {
    const seed = await seedStore(tx);
    await sellCash(tx, seed);
    const sales = await tx.sale.findMany({
      include: { payments: true, refunds: true },
      where: { companyId: seed.tenant.companyId },
    });
    const active = sales.filter((sale: { saleStatus: string }) =>
      (CASH_SESSION_SALE_STATUSES as readonly string[]).includes(sale.saleStatus),
    );
    const payments = active.flatMap((sale: { payments: Array<{ amount: unknown; changeAmount?: unknown; paymentMethod: string }> }) => sale.payments);
    const totals = buildCashSessionTotals({
      cashInLak: 0,
      cashOutLak: 0,
      cashSalesLak: summarizeSalePayments(payments).cashSalesLak,
      nonCashSalesLak: summarizeSalePayments(payments).nonCashSalesLak,
      openingCashLak: OPENING_CASH,
      refundLak: 0,
      voidCashLak: 0,
    });
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    assertClose(reports.analytics.totalRevenue, 10000, "sales revenue");
    assertClose(totals.cashSalesLak, 10000, "session cash sales");
    assertClose(totals.expectedCashLak, OPENING_CASH + 10000, "expected cash");
  });

  await isolated("18. Cash In excluded from revenue", async (tx) => {
    const seed = await seedStore(tx);
    await sellCash(tx, seed);
    const session = await tx.cashSession.findFirst({ where: { companyId: seed.tenant.companyId, closedAt: null } });
    await tx.cashTransaction.create({
      data: {
        amount: 25000,
        companyId: seed.tenant.companyId,
        createdBy: seed.tenant.userId,
        reason: "float top-up",
        sessionId: session.id,
        transactionType: "cash_in",
      },
    });
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    assertClose(reports.analytics.totalRevenue, 10000, "cash in is not revenue");
  });

  await isolated("19. Cash Out excluded from revenue", async (tx) => {
    const seed = await seedStore(tx);
    await sellCash(tx, seed);
    const session = await tx.cashSession.findFirst({ where: { companyId: seed.tenant.companyId, closedAt: null } });
    await tx.cashTransaction.create({
      data: {
        amount: 3000,
        companyId: seed.tenant.companyId,
        createdBy: seed.tenant.userId,
        reason: "petty",
        sessionId: session.id,
        transactionType: "cash_out",
      },
    });
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    assertClose(reports.analytics.totalRevenue, 10000, "cash out is not revenue");
  });

  await isolated("20. Opening float excluded from revenue", async (tx) => {
    const seed = await seedStore(tx);
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    assertClose(reports.analytics.totalRevenue, 0, "opening cash is not sales");
    assertClose(reports.hub.inventoryValueLak > 0 ? 1 : 0, 1, "stock exists without revenue");
  });

  await isolated("21. Gross Sales", async (tx) => {
    const seed = await seedStore(tx);
    const sale = await sellCash(tx, seed);
    await writeReturnPrismaSale(tx, seed.tenant, {
      items: [{ condition: "sellable", quantity: 1, saleItemId: sale.items[0].id }],
      refundMethod: "cash",
      saleId: sale.id,
    });
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    assertClose(reports.grossSalesLak, 10000, "gross");
  });

  await isolated("22. Refund total", async (tx) => {
    const seed = await seedStore(tx);
    const sale = await sellCash(tx, seed);
    await writeReturnPrismaSale(tx, seed.tenant, {
      items: [{ condition: "sellable", quantity: 1, saleItemId: sale.items[0].id }],
      refundMethod: "cash",
      saleId: sale.id,
    });
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    assertClose(reports.refundLak, 10000, "refund total");
  });

  await isolated("23. Net Sales", async (tx) => {
    const seed = await seedStore(tx);
    const sale = await writeCompletePrismaSale(tx, checkoutInput(seed.tenant, [{
      productId: seed.productA.id, quantity: 10, sellingPrice: 10000, unitId: seed.unitA.id,
    }], { paymentMode: "cash", totalAmount: 100000, cashAmount: 100000 }), seed.tenant);
    await writeReturnPrismaSale(tx, seed.tenant, {
      items: [{ condition: "sellable", quantity: 3, saleItemId: sale.items[0].id }],
      refundMethod: "cash",
      saleId: sale.id,
    });
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    assertClose(reports.analytics.totalRevenue, 70000, "net");
    assertClose(reports.grossSalesLak - reports.refundLak, reports.analytics.totalRevenue, "gross - refunds = net");
  });

  await isolated("24. Transaction count", async (tx) => {
    const seed = await seedStore(tx);
    await sellCash(tx, seed);
    await sellCash(tx, seed);
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    assertClose(reports.analytics.totalTransactions, 2, "txn count");
  });

  await isolated("25. Average order value", async (tx) => {
    const seed = await seedStore(tx);
    await sellCash(tx, seed);
    await writeCompletePrismaSale(tx, checkoutInput(seed.tenant, [{
      productId: seed.productA.id, quantity: 2, sellingPrice: 10000, unitId: seed.unitA.id,
    }], { paymentMode: "cash", totalAmount: 20000, cashAmount: 20000 }), seed.tenant);
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    assertClose(reports.hub.averageBillLak, 15000, "aov");
  });

  await isolated("26. COGS", async (tx) => {
    const seed = await seedStore(tx);
    await sellCash(tx, seed);
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    assertClose(reports.cogsLak, 6000, "historical line cost");
  });

  await isolated("27. Profit", async (tx) => {
    const seed = await seedStore(tx);
    await sellCash(tx, seed);
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    assertClose(reports.analytics.totalProfit, 4000, "profit 10000-6000");
  });

  await isolated("28. Product net quantity", async (tx) => {
    const seed = await seedStore(tx);
    const sale = await writeCompletePrismaSale(tx, checkoutInput(seed.tenant, [{
      productId: seed.productA.id, quantity: 5, sellingPrice: 10000, unitId: seed.unitA.id,
    }], { paymentMode: "cash", totalAmount: 50000, cashAmount: 50000 }), seed.tenant);
    await writeReturnPrismaSale(tx, seed.tenant, {
      items: [{ condition: "sellable", quantity: 2, saleItemId: sale.items[0].id }],
      refundMethod: "cash",
      saleId: sale.id,
    });
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    const row = reports.productRows.find((item) => item.productName.includes("Alpha"));
    assert(row, "product row missing");
    assertClose(row.quantitySold, 3, "net qty");
  });

  await isolated("29. Inventory balance report", async (tx) => {
    const seed = await seedStore(tx);
    await sellCash(tx, seed);
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    const item = reports.inventoryItems.find((row) => row.productId === seed.productA.id);
    assert(item, "inventory item missing");
    assertClose(item.quantity, 39, "balance after sale");
  });

  await isolated("30. Lot reconciliation", async (tx) => {
    const seed = await seedStore(tx);
    await writeCompletePrismaSale(tx, checkoutInput(seed.tenant, [{
      productId: seed.productB.id, quantity: 5, sellingPrice: 5000, unitId: seed.unitB.id,
    }], { paymentMode: "cash", totalAmount: 25000, cashAmount: 25000 }), seed.tenant);
    const lots = await tx.inventoryLot.findMany({ where: { productId: seed.productB.id } });
    const lotQty = lots.reduce((total: number, lot: { quantity: unknown }) => total + Number(lot.quantity), 0);
    const balance = await tx.inventoryBalance.findUnique({
      where: { warehouseId_productId: { productId: seed.productB.id, warehouseId: seed.warehouseId } },
    });
    assertClose(lotQty, Number(balance?.quantity), "lots vs balance");
  });

  await isolated("31. Inventory valuation", async (tx) => {
    const seed = await seedStore(tx);
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    const item = reports.inventoryItems.find((row) => row.productId === seed.productA.id);
    assert(item, "valuation item missing");
    assertClose(item.inventoryValueLak ?? 0, 40 * 6000, "qty * persisted cost");
  });

  await isolated("32. Purchase receiving effect", async (tx) => {
    const seed = await seedStore(tx);
    const before = await tx.inventoryBalance.findUnique({
      where: { warehouseId_productId: { productId: seed.productA.id, warehouseId: seed.warehouseId } },
    });
    await tx.purchase.create({
      data: {
        companyId: seed.tenant.companyId,
        purchaseNo: `E9-PO-${randomBytes(3).toString("hex")}`,
        status: "draft",
        subtotal: 12000,
        supplierId: (await tx.supplier.create({
          data: { branchId: seed.branchId, companyId: seed.tenant.companyId, name: "E9 Supplier", status: "active" },
        })).id,
        totalAmount: 12000,
        warehouseId: seed.warehouseId,
      },
    });
    const afterPo = await tx.inventoryBalance.findUnique({
      where: { warehouseId_productId: { productId: seed.productA.id, warehouseId: seed.warehouseId } },
    });
    assertClose(afterPo?.quantity, before?.quantity, "draft PO does not inflate stock");
    await writeStockIn(tx, {
      productId: seed.productA.id,
      quantity: 2,
      unitId: seed.unitA.id,
      warehouseId: seed.warehouseId,
    }, seed.tenant);
    const afterReceive = await tx.inventoryBalance.findUnique({
      where: { warehouseId_productId: { productId: seed.productA.id, warehouseId: seed.warehouseId } },
    });
    assertClose(afterReceive?.quantity, Number(before?.quantity) + 2, "receiving increases stock");
  });

  await isolated("33. Supplier payable", async (tx) => {
    const seed = await seedStore(tx);
    const supplier = await tx.supplier.create({
      data: { branchId: seed.branchId, companyId: seed.tenant.companyId, name: "E9 Payable Co", status: "active" },
    });
    await tx.supplierPayable.create({
      data: { balanceAmount: 44000, companyId: seed.tenant.companyId, supplierId: supplier.id, totalAmount: 44000 },
    });
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    const payable = reports.supplierPayables.find((row) => row.supplierId === supplier.id);
    assertClose(payable?.payableBalanceLak, 44000, "payable balance");
  });

  await isolated("34. Hourly sales", async (tx) => {
    const seed = await seedStore(tx);
    await sellCash(tx, seed);
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    const hourTotal = reports.hub.hourlySales.reduce((total, row) => total + row.transactions, 0);
    assert(hourTotal >= 1, "hourly has the sale");
  });

  await isolated("35. Daily revenue trend", async (tx) => {
    const seed = await seedStore(tx);
    await sellCash(tx, seed);
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    const trendRevenue = reports.hub.revenueProfitTrend.reduce((total, row) => total + row.revenue, 0);
    assertClose(trendRevenue, reports.analytics.totalRevenue, "trend vs kpi");
  });

  await isolated("36. Daily profit trend", async (tx) => {
    const seed = await seedStore(tx);
    await sellCash(tx, seed);
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    const trendProfit = reports.hub.revenueProfitTrend.reduce((total, row) => total + row.profit, 0);
    assertClose(trendProfit, reports.analytics.totalProfit, "profit trend vs kpi");
  });

  await isolated("37. Today boundary", async (tx) => {
    const seed = await seedStore(tx);
    const sale = await sellCash(tx, seed);
    await tx.sale.update({
      data: { createdAt: new Date(startOfBusinessDay().getTime() - 60_000) },
      where: { id: sale.id },
    });
    const today = await getPrismaReportsSnapshot(seed.tenant, { datePreset: "today" }, tx);
    const yesterday = await getPrismaReportsSnapshot(seed.tenant, { datePreset: "yesterday" }, tx);
    assertClose(today.analytics.totalRevenue, 0, "pre-midnight not today");
    assertClose(yesterday.analytics.totalRevenue, 10000, "pre-midnight is yesterday");
  });

  await isolated("38. Month/date filter", async (tx) => {
    const seed = await seedStore(tx);
    const sale = await sellCash(tx, seed);
    await tx.sale.update({
      data: { createdAt: new Date("2024-01-15T12:00:00+07:00") },
      where: { id: sale.id },
    });
    const month = await getPrismaReportsSnapshot(seed.tenant, { datePreset: "this_month" }, tx);
    const all = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    assertClose(month.analytics.totalRevenue, 0, "old sale outside this month");
    assertClose(all.analytics.totalRevenue, 10000, "all time includes old sale");
  });

  await isolated("39. Tenant isolation", async (tx) => {
    const a = await seedStore(tx);
    const b = await seedStore(tx);
    await sellCash(tx, a);
    const reportsB = await getPrismaReportsSnapshot(b.tenant, ALL, tx);
    assertClose(reportsB.analytics.totalRevenue, 0, "store B cannot see store A");
  });

  await isolated("40. Branch isolation", async (tx) => {
    const seed = await seedStore(tx);
    const branchB = await tx.branch.create({
      data: { companyId: seed.tenant.companyId, isMainBranch: false, name: "Branch B" },
    });
    await sellCash(tx, seed);
    const filtered = await getPrismaReportsSnapshot(seed.tenant, { ...ALL, branchId: branchB.id }, tx);
    assertClose(filtered.analytics.totalRevenue, 0, "branch B filter excludes main sales");
  });

  await isolated("41. Permission enforcement", async (tx) => {
    const seed = await seedStore(tx);
    const clerk = await tx.user.create({
      data: { fullName: "E9 Clerk", passwordHash: "x", username: `e9c${randomBytes(4).toString("hex")}` },
    });
    await tx.companyUser.create({
      data: {
        branchId: seed.branchId,
        companyId: seed.tenant.companyId,
        isOwner: false,
        status: "active",
        userId: clerk.id,
      },
    });
    const clerkTenant = { ...seed.tenant, userId: clerk.id };
    let denied = false;
    try {
      await assertPermission(clerkTenant, READ_PERMISSIONS.reportsView, tx);
    } catch (error) {
      denied = error instanceof PermissionDeniedError;
    }
    assert(denied, "clerk reports.view must be denied");
    let snapshotDenied = false;
    try {
      await getPrismaReportsSnapshot(clerkTenant, ALL, tx);
    } catch (error) {
      snapshotDenied = error instanceof PermissionDeniedError || (error instanceof Error && /Permission denied/i.test(error.message));
    }
    assert(snapshotDenied, "reports snapshot must enforce permission");
  });

  await isolated("42. Empty-state zero data", async (tx) => {
    const seed = await seedStore(tx);
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    const dash = await getPrismaDashboardSnapshot(seed.tenant, { key: "today" }, tx);
    assertClose(reports.analytics.totalRevenue, 0, "empty reports");
    assertClose(dash.cards.netSalesLak, 0, "empty dashboard");
    assertClose(dash.cards.profitTodayLak, 0, "empty profit");
  });

  await isolated("43. Dashboard vs Reports revenue", async (tx) => {
    const seed = await seedStore(tx);
    await sellCash(tx, seed);
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    const dash = await getPrismaDashboardSnapshot(seed.tenant, { key: "today" }, tx);
    assertClose(dash.cards.netSalesLak, reports.analytics.totalRevenue, "dash revenue");
  });

  await isolated("44. Dashboard vs Reports profit", async (tx) => {
    const seed = await seedStore(tx);
    await sellCash(tx, seed);
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    const dash = await getPrismaDashboardSnapshot(seed.tenant, { key: "today" }, tx);
    assertClose(dash.cards.profitTodayLak, reports.analytics.totalProfit, "dash profit");
  });

  await isolated("45. Dashboard vs Reports transaction count", async (tx) => {
    const seed = await seedStore(tx);
    await sellCash(tx, seed);
    await sellCash(tx, seed);
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    const dash = await getPrismaDashboardSnapshot(seed.tenant, { key: "today" }, tx);
    assertClose(dash.cards.totalBillsToday, reports.analytics.totalTransactions, "dash txn");
  });


  await isolated("46. Dashboard vs Reports after refund", async (tx) => {
    const seed = await seedStore(tx);
    const sale = await sellCash(tx, seed);
    await writeReturnPrismaSale(tx, seed.tenant, {
      items: [{ condition: "sellable", quantity: 1, saleItemId: sale.items[0].id }],
      refundMethod: "cash",
      saleId: sale.id,
    });
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    const dash = await getPrismaDashboardSnapshot(seed.tenant, { key: "today" }, tx);
    assertClose(dash.cards.netSalesLak, reports.analytics.totalRevenue, "dash refund revenue");
    assertClose(dash.cards.refundLak, reports.refundLak, "dash refund amount");
    assertClose(dash.cards.cogsLak, reports.cogsLak, "dash refund cogs");
    assertClose(dash.cards.profitTodayLak, reports.analytics.totalProfit, "dash refund profit");
  });

  await isolated("47. Dashboard vs Reports after exchange", async (tx) => {
    const seed = await seedStore(tx);
    const sale = await sellCash(tx, seed);
    await writeExchangePrismaSale(tx, seed.tenant, {
      paidAmountLak: 0,
      refundMethod: "cash",
      replacementItems: [{ productId: seed.productA.id, quantity: 1, unitId: seed.unitA.id }],
      returnedItems: [{ condition: "sellable", quantity: 1, saleItemId: sale.items[0].id }],
      saleId: sale.id,
    });
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    const dash = await getPrismaDashboardSnapshot(seed.tenant, { key: "today" }, tx);
    assertClose(dash.cards.netSalesLak, reports.analytics.totalRevenue, "dash exchange revenue");
    assertClose(dash.cards.profitTodayLak, reports.analytics.totalProfit, "dash exchange profit");
  });

  await isolated("48. Dashboard vs Reports QR payment", async (tx) => {
    const seed = await seedStore(tx);
    await writeCompletePrismaSale(tx, checkoutInput(seed.tenant, [{
      productId: seed.productA.id,
      quantity: 1,
      sellingPrice: 10000,
      unitId: seed.unitA.id,
    }], { paymentMode: "qr", totalAmount: 10000, cashAmount: 0, qrAmount: 10000 }), seed.tenant);
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    const dash = await getPrismaDashboardSnapshot(seed.tenant, { key: "today" }, tx);
    assertClose(dash.cards.netSalesLak, reports.analytics.totalRevenue, "dash qr revenue");
    const dashQr = dash.paymentBreakdown.find((row) => row.method === "qr")?.totalLak ?? 0;
    const reportQr = paymentValue(reports.hub, "QR");
    assertClose(dashQr, reportQr, "dash qr breakdown");
  });

  await isolated("49. Dashboard vs Reports inventory value", async (tx) => {
    const seed = await seedStore(tx);
    const reports = await getPrismaReportsSnapshot(seed.tenant, ALL, tx);
    const dash = await getPrismaDashboardSnapshot(seed.tenant, { key: "today" }, tx);
    assertClose(dash.cards.inventoryValueLak, reports.hub.inventoryValueLak, "dash inventory");
  });

  await isolated("50. Cashier dashboard denied", async (tx) => {
    const seed = await seedStore(tx);
    const clerk = await tx.user.create({
      data: { fullName: "E9 Dash Clerk", passwordHash: "x", username: `e9d${randomBytes(4).toString("hex")}` },
    });
    await tx.companyUser.create({
      data: {
        branchId: seed.branchId,
        companyId: seed.tenant.companyId,
        isOwner: false,
        status: "active",
        userId: clerk.id,
      },
    });
    let denied = false;
    try {
      await getPrismaDashboardSnapshot({ ...seed.tenant, userId: clerk.id }, { key: "today" }, tx);
    } catch (error) {
      denied = error instanceof PermissionDeniedError || (error instanceof Error && /Permission denied/i.test(error.message));
    }
    assert(denied, "clerk dashboard.view must be denied");
  });

  await isolated("50b. Manager dashboard allowed", async (tx) => {
    const seed = await seedStore(tx);
    const permission = await tx.permission.upsert({
      create: { key: READ_PERMISSIONS.dashboardView, module: "dashboard", name: "Dashboard" },
      update: {},
      where: { key: READ_PERMISSIONS.dashboardView },
    });
    const managerUser = await tx.user.create({
      data: { fullName: "E9 Manager", passwordHash: "x", username: `e9m${randomBytes(4).toString("hex")}` },
    });
    await tx.companyUser.create({
      data: {
        branchId: seed.branchId,
        companyId: seed.tenant.companyId,
        isOwner: false,
        status: "active",
        userId: managerUser.id,
      },
    });
    const role = await tx.role.create({
      data: { companyId: seed.tenant.companyId, name: "Manager" },
    });
    await tx.rolePermission.create({
      data: { permissionId: permission.id, roleId: role.id },
    });
    await tx.userRole.create({
      data: { companyId: seed.tenant.companyId, roleId: role.id, userId: managerUser.id },
    });
    const dash = await getPrismaDashboardSnapshot(
      { ...seed.tenant, userId: managerUser.id },
      { key: "today" },
      tx,
    );
    assertClose(dash.cards.netSalesLak, 0, "manager dashboard loads");
  });

  await isolated("51. Dashboard tenant isolation", async (tx) => {
    const a = await seedStore(tx);
    const b = await seedStore(tx);
    await sellCash(tx, a);
    const dashB = await getPrismaDashboardSnapshot(b.tenant, { key: "today" }, tx);
    assertClose(dashB.cards.netSalesLak, 0, "store B dashboard cannot see store A");
  });

  const after = await goboxCounts(prisma);
  const leaked = await prisma.company.count({ where: { storeCode: { startsWith: "e9" } } });
  assert(after.products === before.products && after.sales === before.sales && after.refunds === before.refunds, "GO BOX mutated");
  assert(leaked === 0, "leaked e9 companies");
  await prisma.$disconnect();

  const failed = results.filter((row) => row.status === "FAIL");
  console.log(JSON.stringify({
    failed: failed.length,
    gobox: after,
    matrixPassed: results.filter((row) => row.status === "PASS").length,
    matrixTotal: 52,
    passed: results.filter((row) => row.status === "PASS").length,
    results,
    total: results.length,
  }, null, 2));
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
