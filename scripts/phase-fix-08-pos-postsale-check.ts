import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { buildCashSessionTotals, summarizeSalePayments } from "../features/cash-sessions/cash-session-calculator";
import { writeCompletePrismaSale, type CompletePrismaSaleInput } from "../features/pos/prisma-repository";
import { writeVoidPrismaSale } from "../features/pos/post-sale-repository";
import {
  CASH_SESSION_SALE_STATUSES,
  loadMutableSale,
  mapSaleRow,
  RECENT_SALE_STATUSES,
} from "../features/pos/post-sale-shared";
import { writeExchangePrismaSale, writeReturnPrismaSale, returnRemainingSaleCore, toReturnableSaleSnapshot } from "../features/pos/return-repository";
import type { PaymentMode } from "../features/pos/types";
import { writePrismaProductCreate } from "../features/products/prisma-repository";
import type { TenantContext } from "../lib/db/write-context";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";

const TARGET_REF = "ieutdqnlfiiaawctapor";
const GOFLO_REF = "luivrsuotrdkgxkhxxbq";
const OLD_PRO_REF = "urqizygucheilflanlea";
const TX_OPTS = { maxWait: 20_000, timeout: 120_000 } as const;
const OPENING_CASH = 100_000;

class RollbackError extends Error {
  constructor() {
    super("FIX-08 isolated fixture rollback");
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
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
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

function qty(value: unknown) {
  return Math.round(Number(value ?? 0) * 1000) / 1000;
}

function money(value: unknown) {
  return Math.round(Number(value ?? 0));
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertClose(actual: unknown, expected: number, message: string) {
  const value = qty(actual);
  if (Math.abs(value - expected) > 1e-9) {
    throw new Error(`${message}: expected ${expected}, got ${value}`);
  }
}

function assertMatch(message: string, pattern: RegExp, label: string) {
  assert(pattern.test(message), `${label}: expected ${pattern}, got ${message}`);
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
  const storeCode = `e8${token}`;
  const user = await tx.user.create({
    data: {
      fullName: `FIX-08 ${label}`,
      passwordHash: "isolated-fixture",
      username: `e8u${token}`,
    },
  });
  const company = await tx.company.create({
    data: {
      businessTemplateKey: "mini-mart",
      name: `FIX-08 ${label}`,
      ownerUserId: user.id,
      storeCode,
    },
  });
  const branch = await tx.branch.create({
    data: { companyId: company.id, isMainBranch: true, name: "Main" },
  });
  const warehouseA = await tx.warehouse.create({
    data: { branchId: branch.id, companyId: company.id, name: "WH-A", type: "store" },
  });
  const warehouseB = await tx.warehouse.create({
    data: { branchId: branch.id, companyId: company.id, name: "WH-B", type: "store" },
  });
  await tx.companyUser.create({
    data: {
      branchId: branch.id,
      companyId: company.id,
      isOwner: true,
      status: "active",
      userId: user.id,
    },
  });
  await tx.cashSession.create({
    data: {
      branchId: branch.id,
      cashierId: user.id,
      companyId: company.id,
      openingCash: OPENING_CASH,
    },
  });
  const tenant: TenantContext = {
    branchId: branch.id,
    companyId: company.id,
    userId: user.id,
    warehouseId: warehouseA.id,
  };
  return { storeCode, tenant, warehouseAId: warehouseA.id, warehouseBId: warehouseB.id };
}

function pieceInput(overrides: {
  barcode: string;
  nameEn: string;
  sellingPriceLak: number;
  sku: string;
  units?: Array<{
    barcode: string;
    conversionQty: number;
    isBaseUnit?: boolean;
    isDefaultSaleUnit?: boolean;
    sellingPriceLak: number;
    unitName: string;
  }>;
}) {
  return {
    barcode: overrides.barcode,
    costPriceLak: Math.round(overrides.sellingPriceLak * 0.6),
    nameEn: overrides.nameEn,
    nameLo: overrides.nameEn,
    sellingPriceLak: overrides.sellingPriceLak,
    sku: overrides.sku,
    units: overrides.units ?? [
      {
        barcode: overrides.barcode,
        conversionQty: 1,
        costPriceLak: Math.round(overrides.sellingPriceLak * 0.6),
        isBaseUnit: true,
        isDefaultSaleUnit: true,
        isPurchaseUnit: true,
        sellingPriceLak: overrides.sellingPriceLak,
        unitName: "Piece",
      },
    ],
  };
}

async function setBalance(tx: Tx, tenant: TenantContext, productId: string, warehouseId: string, quantity: number) {
  await tx.inventoryBalance.upsert({
    create: {
      companyId: tenant.companyId,
      productId,
      quantity,
      warehouseId,
    },
    update: { quantity },
    where: { warehouseId_productId: { productId, warehouseId } },
  });
}

function checkoutInput(
  tenant: TenantContext,
  items: Array<{ productId: string; quantity: number; sellingPrice: number; unitId?: string }>,
  payment: {
    cardAmount?: number;
    cashAmount?: number;
    paymentMode: PaymentMode;
    qrAmount?: number;
    totalAmount: number;
    transferAmount?: number;
  },
): CompletePrismaSaleInput {
  return {
    branchId: tenant.branchId ?? "",
    cardAmount: payment.cardAmount ?? 0,
    cashAmount: payment.cashAmount ?? 0,
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

async function expectFailure(tx: Tx, run: () => Promise<unknown>, pattern: RegExp, label: string) {
  await tx.$executeRawUnsafe("SAVEPOINT postsale_attempt");
  try {
    await run();
    await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT postsale_attempt");
    throw new Error(`${label}: expected failure`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith(`${label}: expected failure`)) throw error;
    await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT postsale_attempt");
    assertMatch(message, pattern, label);
  }
}

async function closeOpenCashSessions(tx: Tx, tenant: TenantContext) {
  await tx.cashSession.updateMany({
    data: {
      cashDifference: 0,
      closedAt: new Date(),
      closingCash: OPENING_CASH,
      expectedCash: OPENING_CASH,
    },
    where: { closedAt: null, companyId: tenant.companyId },
  });
}

async function seedCore(tx: Tx) {
  const ctx = await createIsolatedTenant(tx, "postsale");
  const { tenant, warehouseAId } = ctx;
  const productA = await writePrismaProductCreate(
    tx,
    pieceInput({ barcode: "0811111111111", nameEn: "EGO FIX08 Alpha", sellingPriceLak: 10000, sku: "E8-SKU-A" }),
    tenant,
  );
  const productB = await writePrismaProductCreate(
    tx,
    pieceInput({ barcode: "0822222222222", nameEn: "EGO FIX08 Bravo Lots", sellingPriceLak: 5000, sku: "E8-SKU-B" }),
    tenant,
  );
  const productC = await writePrismaProductCreate(
    tx,
    pieceInput({
      barcode: "0833333333333",
      nameEn: "EGO FIX08 Charlie Pack",
      sellingPriceLak: 1000,
      sku: "E8-SKU-C",
      units: [
        { barcode: "0833333333333", conversionQty: 1, isBaseUnit: true, isDefaultSaleUnit: true, sellingPriceLak: 1000, unitName: "Piece" },
        { barcode: "0833333333340", conversionQty: 12, isBaseUnit: false, isDefaultSaleUnit: false, sellingPriceLak: 11000, unitName: "Carton" },
      ],
    }),
    tenant,
  );
  const productD = await writePrismaProductCreate(
    tx,
    pieceInput({ barcode: "0844444444444", nameEn: "EGO FIX08 Delta High", sellingPriceLak: 15000, sku: "E8-SKU-D" }),
    tenant,
  );
  await setBalance(tx, tenant, productA.id, warehouseAId, 30);
  await setBalance(tx, tenant, productB.id, warehouseAId, 10);
  await setBalance(tx, tenant, productC.id, warehouseAId, 24);
  await setBalance(tx, tenant, productD.id, warehouseAId, 10);
  const now = Date.now();
  await tx.inventoryLot.create({
    data: {
      companyId: tenant.companyId,
      expiryDate: new Date(now + 24 * 60 * 60 * 1000),
      lotNumber: "LOT-A",
      productId: productB.id,
      quantity: 4,
      receivedAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
      warehouseId: warehouseAId,
    },
  });
  await tx.inventoryLot.create({
    data: {
      companyId: tenant.companyId,
      expiryDate: new Date(now + 365 * 24 * 60 * 60 * 1000),
      lotNumber: "LOT-B",
      productId: productB.id,
      quantity: 6,
      receivedAt: new Date(now - 24 * 60 * 60 * 1000),
      warehouseId: warehouseAId,
    },
  });
  const unitA = productA.units.find((unit) => unit.isBaseUnit) ?? productA.units[0];
  const unitB = productB.units.find((unit) => unit.isBaseUnit) ?? productB.units[0];
  const unitCCarton = productC.units.find((unit) => unit.unitName === "Carton");
  const unitD = productD.units.find((unit) => unit.isBaseUnit) ?? productD.units[0];
  assert(unitA && unitB && unitCCarton && unitD, "Seed units missing");
  return { ...ctx, productA, productB, productC, productD, unitA, unitB, unitCCarton, unitD };
}

async function sell(
  tx: Tx,
  tenant: TenantContext,
  items: Array<{ productId: string; quantity: number; sellingPrice: number; unitId?: string }>,
  payment: Parameters<typeof checkoutInput>[2],
) {
  return writeCompletePrismaSale(tx, checkoutInput(tenant, items, payment), tenant);
}

function lineOf(sale: { items: Array<{ id: string; productId: string }> }, productId: string) {
  const item = sale.items.find((row) => row.productId === productId);
  assert(item, `Sale item missing for ${productId}`);
  return item;
}

async function balanceOf(tx: Tx, productId: string, warehouseId: string) {
  const row = await tx.inventoryBalance.findUnique({
    where: { warehouseId_productId: { productId, warehouseId } },
  });
  return qty(row?.quantity);
}

async function sessionImpact(tx: Tx, tenant: TenantContext) {
  const sales = await tx.sale.findMany({
    include: { payments: true, refunds: true },
    where: { companyId: tenant.companyId, createdBy: tenant.userId },
  });
  const active = sales.filter((sale: { saleStatus: string }) =>
    (CASH_SESSION_SALE_STATUSES as readonly string[]).includes(sale.saleStatus),
  );
  const payments = active.flatMap((sale: { payments: Array<{ amount: unknown; changeAmount?: unknown; paymentMethod: string }> }) => sale.payments);
  const paymentTotals = summarizeSalePayments(payments);
  let refundLak = 0;
  let exchangeCashInLak = 0;
  for (const sale of active) {
    for (const refund of sale.refunds ?? []) {
      if (String(refund.refundMethod) === "cash") {
        refundLak += money(refund.refundAmount);
        exchangeCashInLak += money(refund.paymentAmount);
      }
    }
  }
  return buildCashSessionTotals({
    cashInLak: 0,
    cashOutLak: 0,
    cashSalesLak: paymentTotals.cashSalesLak + Math.round(exchangeCashInLak),
    nonCashSalesLak: paymentTotals.nonCashSalesLak,
    openingCashLak: OPENING_CASH,
    refundLak: Math.round(refundLak),
    voidCashLak: 0,
  });
}

function wiringPass() {
  const modal = readFileSync("features/pos/components/return-exchange-void-modal.tsx", "utf8");
  const client = readFileSync("features/pos/components/pos-page-client.tsx", "utf8");
  const ret = readFileSync("features/pos/return-repository.ts", "utf8");
  const post = readFileSync("features/pos/post-sale-repository.ts", "utf8");
  assert(modal.includes("if (!sale || busy)"), "Modal double-submit guard missing");
  assert(client.includes("postSaleInFlightRef"), "Recent Sales void in-flight guard missing");
  assert(ret.includes("writeReturnPrismaSale") && ret.includes("writeExchangePrismaSale"), "Return/exchange write cores missing");
  assert(post.includes("writeVoidPrismaSale") && post.includes("writeRefundPrismaSale"), "Void/refund write cores missing");
  assert(ret.includes("resolveCashSessionIdForReturnOrExchange"), "Cash-refund session helper wiring");
  assert(!ret.includes("assertOpenCashSessionForSale"), "Return must not reuse sale checkout session assert");
  assert(!ret.includes("IGO_DEMO_MODE") && !post.includes("completeDemoSale"), "Post-sale repository demo leakage");
}

async function main() {
  const url = resolveScriptDatabaseUrl("test-write");

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
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

  await isolated("1. Partial refund", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 5, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 50000, paymentMode: "cash", totalAmount: 50000 },
    );
    const item = lineOf(sale, fixture.productA.id);
    const result = await writeReturnPrismaSale(tx, fixture.tenant, {
      items: [{ condition: "sellable", quantity: 2, saleItemId: item.id }],
      refundMethod: "cash",
      saleId: sale.id,
    });
    assert(result.sale.status === "partial_refunded", `status ${result.sale.status}`);
    const original = await tx.saleItem.findFirstOrThrow({ where: { id: item.id } });
    assertClose(original.quantity, 5, "Original SaleItem qty must stay 5");
    const snap = toReturnableSaleSnapshot(await loadMutableSale(tx, fixture.tenant, sale.id), "c");
    assertClose(snap.items[0].remainingQuantity, 3, "Remaining refundable qty");
    assertClose(await balanceOf(tx, fixture.productA.id, fixture.warehouseAId), 27, "Partial restore +2 from 25");
    assertClose(result.receipt?.refundAmountLak, 20000, "Refund money for qty 2");
  });

  await isolated("2. Second partial refund", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 5, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 50000, paymentMode: "cash", totalAmount: 50000 },
    );
    const item = lineOf(sale, fixture.productA.id);
    await writeReturnPrismaSale(tx, fixture.tenant, {
      items: [{ condition: "sellable", quantity: 2, saleItemId: item.id }],
      refundMethod: "cash",
      saleId: sale.id,
    });
    await writeReturnPrismaSale(tx, fixture.tenant, {
      items: [{ condition: "sellable", quantity: 1, saleItemId: item.id }],
      refundMethod: "cash",
      saleId: sale.id,
    });
    const snap = toReturnableSaleSnapshot(await loadMutableSale(tx, fixture.tenant, sale.id), "c");
    assertClose(snap.items[0].remainingQuantity, 2, "After second partial remaining is 2");
    assertClose(await balanceOf(tx, fixture.productA.id, fixture.warehouseAId), 28, "Restored 3 total");
    assert((await tx.refund.count({ where: { saleId: sale.id } })) === 2, "Two refund records");
  });

  await isolated("3. Full refund", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 2, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 20000, paymentMode: "cash", totalAmount: 20000 },
    );
    const updated = await returnRemainingSaleCore(tx, fixture.tenant, await loadMutableSale(tx, fixture.tenant, sale.id));
    assert(String(updated.saleStatus) === "refunded", `full status ${updated.saleStatus}`);
    assertClose(await balanceOf(tx, fixture.productA.id, fixture.warehouseAId), 30, "Full restore");
  });

  await isolated("4. Refund beyond remaining qty denied", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 2, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 20000, paymentMode: "cash", totalAmount: 20000 },
    );
    await expectFailure(
      tx,
      () =>
        writeReturnPrismaSale(tx, fixture.tenant, {
          items: [{ condition: "sellable", quantity: 3, saleItemId: lineOf(sale, fixture.productA.id).id }],
          refundMethod: "cash",
          saleId: sale.id,
        }),
      /Cannot return more than the remaining/,
      "Over-qty refund",
    );
  });

  await isolated("5. Repeat full refund denied", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
    );
    await returnRemainingSaleCore(tx, fixture.tenant, await loadMutableSale(tx, fixture.tenant, sale.id));
    await expectFailure(
      tx,
      async () => returnRemainingSaleCore(tx, fixture.tenant, await loadMutableSale(tx, fixture.tenant, sale.id)),
      /already refunded/,
      "Repeat full refund",
    );
  });

  await isolated("6. Cash refund", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
    );
    await writeReturnPrismaSale(tx, fixture.tenant, {
      items: [{ condition: "sellable", quantity: 1, saleItemId: lineOf(sale, fixture.productA.id).id }],
      refundMethod: "cash",
      saleId: sale.id,
    });
    const refund = await tx.refund.findFirst({ where: { saleId: sale.id } });
    assert(refund?.refundMethod === "cash", "Cash refund method");
    const impact = await sessionImpact(tx, fixture.tenant);
    assertClose(impact.expectedCashLak, OPENING_CASH, "Full cash refund must drop original cash sale from session");
  });

  await isolated("7. Non-cash refund", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { paymentMode: "qr", qrAmount: 10000, totalAmount: 10000 },
    );
    await writeReturnPrismaSale(tx, fixture.tenant, {
      items: [{ condition: "sellable", quantity: 1, saleItemId: lineOf(sale, fixture.productA.id).id }],
      refundMethod: "qr",
      saleId: sale.id,
    });
    const impact = await sessionImpact(tx, fixture.tenant);
    assertClose(impact.expectedCashLak, OPENING_CASH, "QR refund must not reduce cash drawer");
    assertClose(impact.cashSalesLak, 0, "QR refund cash sales");
  });

  await isolated("8. Split-payment refund if supported", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 4000, paymentMode: "mixed", qrAmount: 6000, totalAmount: 10000 },
    );
    await writeReturnPrismaSale(tx, fixture.tenant, {
      items: [{ condition: "sellable", quantity: 1, saleItemId: lineOf(sale, fixture.productA.id).id }],
      refundMethod: "cash",
      saleId: sale.id,
    });
    const refund = await tx.refund.findFirst({ where: { saleId: sale.id } });
    assert(refund?.refundMethod === "cash", "Split refund records chosen method");
    const impact = await sessionImpact(tx, fixture.tenant);
    assertClose(impact.expectedCashLak, OPENING_CASH, "Fully refunded mixed sale leaves opening cash");
  });

  await isolated("9. Refund multi-line sale", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [
        { productId: fixture.productA.id, quantity: 2, sellingPrice: 10000, unitId: fixture.unitA.id },
        { productId: fixture.productB.id, quantity: 1, sellingPrice: 5000, unitId: fixture.unitB.id },
      ],
      { cashAmount: 25000, paymentMode: "cash", totalAmount: 25000 },
    );
    await writeReturnPrismaSale(tx, fixture.tenant, {
      items: [
        { condition: "sellable", quantity: 1, saleItemId: lineOf(sale, fixture.productA.id).id },
        { condition: "sellable", quantity: 1, saleItemId: lineOf(sale, fixture.productB.id).id },
      ],
      refundMethod: "cash",
      saleId: sale.id,
    });
    assertClose(await balanceOf(tx, fixture.productA.id, fixture.warehouseAId), 29, "A restore 1");
    assertClose(await balanceOf(tx, fixture.productB.id, fixture.warehouseAId), 10, "B restore 1 to 10");
  });

  await isolated("10. Refund package/unit", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productC.id, quantity: 2, sellingPrice: 11000, unitId: fixture.unitCCarton.id }],
      { cashAmount: 22000, paymentMode: "cash", totalAmount: 22000 },
    );
    await writeReturnPrismaSale(tx, fixture.tenant, {
      items: [{ condition: "sellable", quantity: 1, saleItemId: lineOf(sale, fixture.productC.id).id }],
      refundMethod: "cash",
      saleId: sale.id,
    });
    assertClose(await balanceOf(tx, fixture.productC.id, fixture.warehouseAId), 12, "One carton restore +12 from 0 leftover after selling 24");
  });

  await isolated("11. Refund multi-lot sale", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productB.id, quantity: 7, sellingPrice: 5000, unitId: fixture.unitB.id }],
      { cashAmount: 35000, paymentMode: "cash", totalAmount: 35000 },
    );
    await writeReturnPrismaSale(tx, fixture.tenant, {
      items: [{ condition: "sellable", quantity: 7, saleItemId: lineOf(sale, fixture.productB.id).id }],
      refundMethod: "cash",
      saleId: sale.id,
    });
    const lots = await tx.inventoryLot.findMany({ where: { productId: fixture.productB.id } });
    const total = lots.reduce((sum: number, lot: { quantity: unknown }) => sum + qty(lot.quantity), 0);
    assertClose(total, 10, "Lots restored to 10");
    assertClose(await balanceOf(tx, fixture.productB.id, fixture.warehouseAId), 10, "Lot product balance");
  });

  await isolated("12. Refund rollback failure", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
    );
    await expectFailure(
      tx,
      () =>
        writeReturnPrismaSale(tx, fixture.tenant, {
          items: [{ condition: "sellable", quantity: 9, saleItemId: lineOf(sale, fixture.productA.id).id }],
          refundMethod: "cash",
          saleId: sale.id,
        }),
      /Cannot return more than the remaining/,
      "Refund rollback",
    );
    assert((await tx.refund.count({ where: { saleId: sale.id } })) === 0, "Failed refund left a record");
    assertClose(await balanceOf(tx, fixture.productA.id, fixture.warehouseAId), 29, "Failed refund mutated stock");
  });

  await isolated("13. Valid Void", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
    );
    const result = await writeVoidPrismaSale(tx, fixture.tenant, { reason: "test void", saleId: sale.id });
    assert(result.sale.status === "voided", `void status ${result.sale.status}`);
  });

  await isolated("14. Repeat Void denied", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
    );
    await writeVoidPrismaSale(tx, fixture.tenant, { reason: "first", saleId: sale.id });
    await expectFailure(
      tx,
      () => writeVoidPrismaSale(tx, fixture.tenant, { reason: "second", saleId: sale.id }),
      /already voided/,
      "Repeat void",
    );
  });

  await isolated("15. Void stock restoration", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 3, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 30000, paymentMode: "cash", totalAmount: 30000 },
    );
    await writeVoidPrismaSale(tx, fixture.tenant, { reason: "stock", saleId: sale.id });
    assertClose(await balanceOf(tx, fixture.productA.id, fixture.warehouseAId), 30, "Void restored stock");
  });

  await isolated("16. Void lot restoration", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productB.id, quantity: 7, sellingPrice: 5000, unitId: fixture.unitB.id }],
      { cashAmount: 35000, paymentMode: "cash", totalAmount: 35000 },
    );
    await writeVoidPrismaSale(tx, fixture.tenant, { reason: "lots", saleId: sale.id });
    const lots = await tx.inventoryLot.findMany({ where: { productId: fixture.productB.id } });
    const total = lots.reduce((sum: number, lot: { quantity: unknown }) => sum + qty(lot.quantity), 0);
    assertClose(total, 10, "Void restored lots");
  });

  await isolated("17. Void cash-session reversal", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
    );
    await writeVoidPrismaSale(tx, fixture.tenant, { reason: "cash", saleId: sale.id });
    const impact = await sessionImpact(tx, fixture.tenant);
    assertClose(impact.expectedCashLak, OPENING_CASH, "Voided cash sale drops from session");
    assertClose(impact.voidCashLak, 0, "Existing policy keeps voidCashLak derived as 0");
  });

  await isolated("18. Refund then Void conflict", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 2, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 20000, paymentMode: "cash", totalAmount: 20000 },
    );
    await writeReturnPrismaSale(tx, fixture.tenant, {
      items: [{ condition: "sellable", quantity: 1, saleItemId: lineOf(sale, fixture.productA.id).id }],
      refundMethod: "cash",
      saleId: sale.id,
    });
    await expectFailure(
      tx,
      () => writeVoidPrismaSale(tx, fixture.tenant, { reason: "conflict", saleId: sale.id }),
      /cannot be voided|already has a refund/i,
      "Refund then void",
    );
  });

  await isolated("19. Void then Refund blocked", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
    );
    await writeVoidPrismaSale(tx, fixture.tenant, { reason: "first", saleId: sale.id });
    await expectFailure(
      tx,
      () =>
        writeReturnPrismaSale(tx, fixture.tenant, {
          items: [{ condition: "sellable", quantity: 1, saleItemId: lineOf(sale, fixture.productA.id).id }],
          refundMethod: "cash",
          saleId: sale.id,
        }),
      /already voided/,
      "Void then refund",
    );
  });

  await isolated("20. Equal-value exchange", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
    );
    const result = await writeExchangePrismaSale(tx, fixture.tenant, {
      paidAmountLak: 0,
      refundMethod: "cash",
      replacementItems: [{ productId: fixture.productA.id, quantity: 1, unitId: fixture.unitA.id }],
      returnedItems: [{ condition: "sellable", quantity: 1, saleItemId: lineOf(sale, fixture.productA.id).id }],
      saleId: sale.id,
    });
    assertClose(result.differenceLak ?? 0, 0, "Equal exchange difference");
    assert(result.sale.status === "exchanged", `exchange status ${result.sale.status}`);
    assertClose(await balanceOf(tx, fixture.productA.id, fixture.warehouseAId), 29, "Return +1 then deduct replacement -1 from 29 after sale");
  });

  await isolated("21. Exchange customer pays difference", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
    );
    const result = await writeExchangePrismaSale(tx, fixture.tenant, {
      paidAmountLak: 5000,
      refundMethod: "cash",
      replacementItems: [{ productId: fixture.productD.id, quantity: 1, unitId: fixture.unitD.id }],
      returnedItems: [{ condition: "sellable", quantity: 1, saleItemId: lineOf(sale, fixture.productA.id).id }],
      saleId: sale.id,
    });
    assertClose(result.differenceLak ?? 0, 5000, "Customer pays 5000");
    assertClose(result.receipt?.paymentAmountLak, 5000, "Exchange payment persisted");
    const impact = await sessionImpact(tx, fixture.tenant);
    assertClose(impact.expectedCashLak, OPENING_CASH + 10000 + 5000, "Customer-pay exchange adds cash-in");
  });

  await isolated("22. Exchange store refunds difference", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productD.id, quantity: 1, sellingPrice: 15000, unitId: fixture.unitD.id }],
      { cashAmount: 15000, paymentMode: "cash", totalAmount: 15000 },
    );
    const result = await writeExchangePrismaSale(tx, fixture.tenant, {
      paidAmountLak: 0,
      refundMethod: "cash",
      replacementItems: [{ productId: fixture.productA.id, quantity: 1, unitId: fixture.unitA.id }],
      returnedItems: [{ condition: "sellable", quantity: 1, saleItemId: lineOf(sale, fixture.productD.id).id }],
      saleId: sale.id,
    });
    assertClose(result.differenceLak ?? 0, -5000, "Store refunds 5000");
    assertClose(result.receipt?.refundAmountLak, 5000, "Store refund amount");
    const impact = await sessionImpact(tx, fixture.tenant);
    assertClose(impact.expectedCashLak, OPENING_CASH + 15000 - 5000, "Store-refund exchange reduces expected cash");
  });

  await isolated("23. Exchange different products", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
    );
    await writeExchangePrismaSale(tx, fixture.tenant, {
      paidAmountLak: 0,
      refundMethod: "cash",
      replacementItems: [{ productId: fixture.productB.id, quantity: 2, unitId: fixture.unitB.id }],
      returnedItems: [{ condition: "sellable", quantity: 1, saleItemId: lineOf(sale, fixture.productA.id).id }],
      saleId: sale.id,
    });
    assertClose(await balanceOf(tx, fixture.productA.id, fixture.warehouseAId), 30, "A restored");
    assertClose(await balanceOf(tx, fixture.productB.id, fixture.warehouseAId), 8, "B deducted 2");
  });

  await isolated("24. Exchange package/unit", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productC.id, quantity: 1, sellingPrice: 11000, unitId: fixture.unitCCarton.id }],
      { cashAmount: 11000, paymentMode: "cash", totalAmount: 11000 },
    );
    await writeExchangePrismaSale(tx, fixture.tenant, {
      paidAmountLak: 0,
      refundMethod: "cash",
      replacementItems: [{ productId: fixture.productC.id, quantity: 1, unitId: fixture.unitCCarton.id }],
      returnedItems: [{ condition: "sellable", quantity: 1, saleItemId: lineOf(sale, fixture.productC.id).id }],
      saleId: sale.id,
    });
    assertClose(await balanceOf(tx, fixture.productC.id, fixture.warehouseAId), 12, "Carton return +12 then replace -12");
  });

  await isolated("25. Exchange returned lot restoration", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productB.id, quantity: 2, sellingPrice: 5000, unitId: fixture.unitB.id }],
      { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
    );
    await writeExchangePrismaSale(tx, fixture.tenant, {
      paidAmountLak: 0,
      refundMethod: "cash",
      replacementItems: [{ productId: fixture.productA.id, quantity: 1, unitId: fixture.unitA.id }],
      returnedItems: [{ condition: "sellable", quantity: 2, saleItemId: lineOf(sale, fixture.productB.id).id }],
      saleId: sale.id,
    });
    const lots = await tx.inventoryLot.findMany({ where: { productId: fixture.productB.id } });
    const total = lots.reduce((sum: number, lot: { quantity: unknown }) => sum + qty(lot.quantity), 0);
    assertClose(total, 10, "Returned lots restored");
  });

  await isolated("26. Exchange replacement FEFO deduction", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
    );
    await writeExchangePrismaSale(tx, fixture.tenant, {
      paidAmountLak: 15000,
      refundMethod: "cash",
      replacementItems: [{ productId: fixture.productB.id, quantity: 5, unitId: fixture.unitB.id }],
      returnedItems: [{ condition: "sellable", quantity: 1, saleItemId: lineOf(sale, fixture.productA.id).id }],
      saleId: sale.id,
    });
    const lots = await tx.inventoryLot.findMany({ orderBy: { lotNumber: "asc" }, where: { productId: fixture.productB.id } });
    const lotA = lots.find((lot: { lotNumber: string }) => lot.lotNumber === "LOT-A");
    const lotB = lots.find((lot: { lotNumber: string }) => lot.lotNumber === "LOT-B");
    assertClose(lotA?.quantity, 0, "FEFO replacement exhausts LOT-A");
    assertClose(lotB?.quantity, 5, "FEFO remainder on LOT-B");
  });

  await isolated("27. Exchange insufficient replacement stock", async (tx) => {
    const fixture = await seedCore(tx);
    await setBalance(tx, fixture.tenant, fixture.productD.id, fixture.warehouseAId, 0);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
    );
    await expectFailure(
      tx,
      () =>
        writeExchangePrismaSale(tx, fixture.tenant, {
          paidAmountLak: 5000,
          refundMethod: "cash",
          replacementItems: [{ productId: fixture.productD.id, quantity: 1, unitId: fixture.unitD.id }],
          returnedItems: [{ condition: "sellable", quantity: 1, saleItemId: lineOf(sale, fixture.productA.id).id }],
          saleId: sale.id,
        }),
      /Insufficient stock/,
      "Exchange stock",
    );
    assert((await tx.refund.count({ where: { saleId: sale.id } })) === 0, "Failed exchange left a refund");
    assertClose(await balanceOf(tx, fixture.productA.id, fixture.warehouseAId), 29, "Failed exchange restored A");
  });

  await isolated("28. Exchange atomic rollback", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
    );
    await expectFailure(
      tx,
      () =>
        writeExchangePrismaSale(tx, fixture.tenant, {
          paidAmountLak: 0,
          refundMethod: "cash",
          replacementItems: [{ productId: fixture.productD.id, quantity: 1, unitId: fixture.unitD.id }],
          returnedItems: [{ condition: "sellable", quantity: 1, saleItemId: lineOf(sale, fixture.productA.id).id }],
          saleId: sale.id,
        }),
      /Additional payment/,
      "Exchange unpaid difference",
    );
    assert((await tx.refund.count({ where: { saleId: sale.id } })) === 0, "Unpaid exchange leaked");
  });

  await isolated("29. Double-submit refund", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
    );
    const payload = {
      items: [{ condition: "sellable" as const, quantity: 1, saleItemId: lineOf(sale, fixture.productA.id).id }],
      refundMethod: "cash" as const,
      saleId: sale.id,
    };
    await writeReturnPrismaSale(tx, fixture.tenant, payload);
    await expectFailure(tx, () => writeReturnPrismaSale(tx, fixture.tenant, payload), /Cannot return more than the remaining|already refunded|cannot be returned while status is refunded/, "Double refund");
    assert((await tx.refund.count({ where: { saleId: sale.id } })) === 1, "Duplicate refund");
  });

  await isolated("30. Double-submit void", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
    );
    await writeVoidPrismaSale(tx, fixture.tenant, { reason: "one", saleId: sale.id });
    await expectFailure(tx, () => writeVoidPrismaSale(tx, fixture.tenant, { reason: "two", saleId: sale.id }), /already voided/, "Double void");
  });

  await isolated("31. Double-submit exchange", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
    );
    const payload = {
      paidAmountLak: 0,
      refundMethod: "cash" as const,
      replacementItems: [{ productId: fixture.productA.id, quantity: 1, unitId: fixture.unitA.id }],
      returnedItems: [{ condition: "sellable" as const, quantity: 1, saleItemId: lineOf(sale, fixture.productA.id).id }],
      saleId: sale.id,
    };
    await writeExchangePrismaSale(tx, fixture.tenant, payload);
    await expectFailure(tx, () => writeExchangePrismaSale(tx, fixture.tenant, payload), /Cannot return more than the remaining/, "Double exchange");
    assert((await tx.refund.count({ where: { saleId: sale.id } })) === 1, "Duplicate exchange");
  });

  await isolated("32. Wrong tenant blocked", async (tx) => {
    const fixture = await seedCore(tx);
    const other = await createIsolatedTenant(tx, "other");
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
    );
    await expectFailure(
      tx,
      () =>
        writeReturnPrismaSale(tx, other.tenant, {
          items: [{ condition: "sellable", quantity: 1, saleItemId: lineOf(sale, fixture.productA.id).id }],
          refundMethod: "cash",
          saleId: sale.id,
        }),
      /Sale was not found/,
      "Wrong tenant refund",
    );
  });

  await isolated("33. Wrong warehouse blocked", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
    );
    await writeReturnPrismaSale(tx, fixture.tenant, {
      items: [{ condition: "sellable", quantity: 1, saleItemId: lineOf(sale, fixture.productA.id).id }],
      refundMethod: "cash",
      saleId: sale.id,
    });
    const foreign = await tx.inventoryBalance.findUnique({
      where: { warehouseId_productId: { productId: fixture.productA.id, warehouseId: fixture.warehouseBId } },
    });
    assert(!foreign || qty(foreign.quantity) === 0, "Refund restored into the wrong warehouse");
    assertClose(await balanceOf(tx, fixture.productA.id, fixture.warehouseAId), 30, "Restore used sale warehouse");
  });

  await isolated("34. Unauthorized refund blocked", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
    );
    const clerk = await tx.user.create({
      data: { fullName: "FIX-08 Clerk", passwordHash: "x", username: `e8c${randomBytes(6).toString("hex")}` },
    });
    await tx.companyUser.create({
      data: {
        branchId: fixture.tenant.branchId,
        companyId: fixture.tenant.companyId,
        isOwner: false,
        status: "active",
        userId: clerk.id,
      },
    });
    await expectFailure(
      tx,
      () =>
        writeReturnPrismaSale(tx, { ...fixture.tenant, userId: clerk.id }, {
          items: [{ condition: "sellable", quantity: 1, saleItemId: lineOf(sale, fixture.productA.id).id }],
          refundMethod: "cash",
          saleId: sale.id,
        }),
      /Permission denied/,
      "Unauthorized refund",
    );
  });

  await isolated("35. Unauthorized void blocked", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
    );
    const clerk = await tx.user.create({
      data: { fullName: "FIX-08 ClerkV", passwordHash: "x", username: `e8v${randomBytes(6).toString("hex")}` },
    });
    await tx.companyUser.create({
      data: {
        branchId: fixture.tenant.branchId,
        companyId: fixture.tenant.companyId,
        isOwner: false,
        status: "active",
        userId: clerk.id,
      },
    });
    await expectFailure(
      tx,
      () => writeVoidPrismaSale(tx, { ...fixture.tenant, userId: clerk.id }, { reason: "nope", saleId: sale.id }),
      /Permission denied/,
      "Unauthorized void",
    );
  });

  await isolated("36. Unauthorized exchange blocked", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
    );
    const clerk = await tx.user.create({
      data: { fullName: "FIX-08 ClerkE", passwordHash: "x", username: `e8e${randomBytes(6).toString("hex")}` },
    });
    await tx.companyUser.create({
      data: {
        branchId: fixture.tenant.branchId,
        companyId: fixture.tenant.companyId,
        isOwner: false,
        status: "active",
        userId: clerk.id,
      },
    });
    await expectFailure(
      tx,
      () =>
        writeExchangePrismaSale(tx, { ...fixture.tenant, userId: clerk.id }, {
          paidAmountLak: 0,
          refundMethod: "cash",
          replacementItems: [{ productId: fixture.productA.id, quantity: 1, unitId: fixture.unitA.id }],
          returnedItems: [{ condition: "sellable", quantity: 1, saleItemId: lineOf(sale, fixture.productA.id).id }],
          saleId: sale.id,
        }),
      /Permission denied/,
      "Unauthorized exchange",
    );
  });

  await isolated("37. Receipt lifecycle", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 2, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 20000, paymentMode: "cash", totalAmount: 20000 },
    );
    const originalQty = qty(sale.items[0].quantity);
    const refunded = await writeReturnPrismaSale(tx, fixture.tenant, {
      items: [{ condition: "sellable", quantity: 1, saleItemId: lineOf(sale, fixture.productA.id).id }],
      refundMethod: "cash",
      saleId: sale.id,
    });
    const persisted = await loadMutableSale(tx, fixture.tenant, sale.id);
    assertClose(persisted.items[0].quantity, originalQty, "Receipt original sale qty unchanged");
    assert(refunded.receipt?.originalSaleNo === sale.saleNo, "Return receipt points at original sale");
    assertClose(refunded.receipt?.refundAmountLak, 10000, "Return receipt amount");
    const row = mapSaleRow(persisted, "c");
    assert(row.status === "partial_refunded", "Receipt lifecycle status");
  });

  await isolated("38. Recent Sales lifecycle", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
    );
    await writeReturnPrismaSale(tx, fixture.tenant, {
      items: [{ condition: "sellable", quantity: 1, saleItemId: lineOf(sale, fixture.productA.id).id }],
      refundMethod: "cash",
      saleId: sale.id,
    });
    const rows = await tx.sale.findMany({
      include: { items: true, payments: true, refunds: true, customer: true },
      where: { companyId: fixture.tenant.companyId, saleStatus: { in: [...RECENT_SALE_STATUSES] } },
    });
    assert(rows.length === 1, "Recent Sales must keep one original sale");
    assert(mapSaleRow(rows[0], "c").status === "refunded", "Recent Sales refunded status");
  });

  await isolated("39. Loyalty reversal sanity if applicable", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
    );
    await writeReturnPrismaSale(tx, fixture.tenant, {
      items: [{ condition: "sellable", quantity: 1, saleItemId: lineOf(sale, fixture.productA.id).id }],
      refundMethod: "cash",
      saleId: sale.id,
    });
    const ledgers = await tx.loyaltyPointLedger.count({ where: { companyId: fixture.tenant.companyId } }).catch(() => 0);
    assert(ledgers === 0, "Guest sale must not create loyalty on refund");
  });

  await isolated("40. Original promotion allocation retained", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 2, sellingPrice: 1, unitId: fixture.unitA.id }],
      { cashAmount: 20000, paymentMode: "cash", totalAmount: 20000 },
    );
    const result = await writeReturnPrismaSale(tx, fixture.tenant, {
      items: [{ condition: "sellable", quantity: 1, saleItemId: lineOf(sale, fixture.productA.id).id }],
      refundMethod: "cash",
      saleId: sale.id,
    });
    assertClose(sale.totalAmount, 20000, "Original sale total stays historical");
    assertClose(result.receipt?.refundAmountLak, 10000, "Refund uses original paid allocation not client price");
    assert((await tx.promotionUsage.count({ where: { saleId: sale.id } })) === 0, "No live promo recalc on historical refund");
  });

  await isolated("41. Cash refund requires open session", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
    );
    const beforeStock = await balanceOf(tx, fixture.productA.id, fixture.warehouseAId);
    await closeOpenCashSessions(tx, fixture.tenant);
    await expectFailure(
      tx,
      () =>
        writeReturnPrismaSale(tx, fixture.tenant, {
          items: [{ condition: "sellable", quantity: 1, saleItemId: lineOf(sale, fixture.productA.id).id }],
          refundMethod: "cash",
          saleId: sale.id,
        }),
      /cash refund/,
      "Cash refund without session",
    );
    assert((await tx.refund.count({ where: { saleId: sale.id } })) === 0, "No refund without session");
    assertClose(await balanceOf(tx, fixture.productA.id, fixture.warehouseAId), beforeStock, "Stock unchanged without session");
  });

  await isolated("42. QR refund without open session allowed", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { paymentMode: "qr", qrAmount: 10000, totalAmount: 10000 },
    );
    await closeOpenCashSessions(tx, fixture.tenant);
    const result = await writeReturnPrismaSale(tx, fixture.tenant, {
      items: [{ condition: "sellable", quantity: 1, saleItemId: lineOf(sale, fixture.productA.id).id }],
      refundMethod: "qr",
      saleId: sale.id,
    });
    assert(result.status === "completed", "QR refund completed without session");
    const refund = await tx.refund.findFirstOrThrow({ where: { saleId: sale.id } });
    assert(refund.cashSessionId == null, "QR refund cashSessionId null");
    assertClose(await balanceOf(tx, fixture.productA.id, fixture.warehouseAId), 30, "QR refund restored stock");
  });

  await isolated("43. Card refund without open session allowed", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cardAmount: 10000, paymentMode: "card", totalAmount: 10000 },
    );
    await closeOpenCashSessions(tx, fixture.tenant);
    await writeReturnPrismaSale(tx, fixture.tenant, {
      items: [{ condition: "sellable", quantity: 1, saleItemId: lineOf(sale, fixture.productA.id).id }],
      refundMethod: "visa",
      saleId: sale.id,
    });
    const refund = await tx.refund.findFirstOrThrow({ where: { saleId: sale.id } });
    assert(refund.cashSessionId == null, "Card refund cashSessionId null");
  });

  await isolated("44. Transfer refund without open session allowed", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { paymentMode: "transfer", transferAmount: 10000, totalAmount: 10000 },
    );
    await closeOpenCashSessions(tx, fixture.tenant);
    await writeReturnPrismaSale(tx, fixture.tenant, {
      items: [{ condition: "sellable", quantity: 1, saleItemId: lineOf(sale, fixture.productA.id).id }],
      refundMethod: "transfer",
      saleId: sale.id,
    });
    const refund = await tx.refund.findFirstOrThrow({ where: { saleId: sale.id } });
    assert(refund.cashSessionId == null, "Transfer refund cashSessionId null");
  });

  await isolated("45. Mixed sale cash refund requires session", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 4000, paymentMode: "mixed", qrAmount: 6000, totalAmount: 10000 },
    );
    await closeOpenCashSessions(tx, fixture.tenant);
    await expectFailure(
      tx,
      () =>
        writeReturnPrismaSale(tx, fixture.tenant, {
          items: [{ condition: "sellable", quantity: 1, saleItemId: lineOf(sale, fixture.productA.id).id }],
          refundMethod: "cash",
          saleId: sale.id,
        }),
      /cash refund/,
      "Mixed cash refund without session",
    );
  });

  await isolated("46. Mixed sale non-cash refund without session", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 4000, paymentMode: "mixed", qrAmount: 6000, totalAmount: 10000 },
    );
    const beforeExpected = (await sessionImpact(tx, fixture.tenant)).expectedCashLak;
    await closeOpenCashSessions(tx, fixture.tenant);
    await writeReturnPrismaSale(tx, fixture.tenant, {
      items: [{ condition: "sellable", quantity: 1, saleItemId: lineOf(sale, fixture.productA.id).id }],
      refundMethod: "qr",
      saleId: sale.id,
    });
    // Session closed: reopen check via refund row only.
    const refund = await tx.refund.findFirstOrThrow({ where: { saleId: sale.id } });
    assert(refund.cashSessionId == null, "Mixed QR refund has null session");
    assert(String(refund.refundMethod) === "qr", "Chosen non-cash method preserved");
    assertClose(beforeExpected, OPENING_CASH + 4000, "Baseline mixed cash portion before close");
  });

  await isolated("47. Voided sale refund rejected before session check", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
    );
    await writeVoidPrismaSale(tx, fixture.tenant, { reason: "void first", saleId: sale.id });
    const beforeStock = await balanceOf(tx, fixture.productA.id, fixture.warehouseAId);
    await closeOpenCashSessions(tx, fixture.tenant);
    await expectFailure(
      tx,
      () =>
        writeReturnPrismaSale(tx, fixture.tenant, {
          items: [{ condition: "sellable", quantity: 1, saleItemId: lineOf(sale, fixture.productA.id).id }],
          refundMethod: "cash",
          saleId: sale.id,
        }),
      /already voided/,
      "Voided before session",
    );
    assert((await tx.refund.count({ where: { saleId: sale.id } })) === 0, "No refund on voided sale");
    assertClose(await balanceOf(tx, fixture.productA.id, fixture.warehouseAId), beforeStock, "No extra stock mutation");
  });

  await isolated("48. Voided sale exchange rejected", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
    );
    await writeVoidPrismaSale(tx, fixture.tenant, { reason: "void first", saleId: sale.id });
    await closeOpenCashSessions(tx, fixture.tenant);
    await expectFailure(
      tx,
      () =>
        writeExchangePrismaSale(tx, fixture.tenant, {
          paidAmountLak: 0,
          refundMethod: "cash",
          replacementItems: [{ productId: fixture.productA.id, quantity: 1, unitId: fixture.unitA.id }],
          returnedItems: [{ condition: "sellable", quantity: 1, saleItemId: lineOf(sale, fixture.productA.id).id }],
          saleId: sale.id,
        }),
      /already voided/,
      "Voided exchange",
    );
  });

  await isolated("49. Equal-value cash exchange without cash movement needs no session", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
    );
    await closeOpenCashSessions(tx, fixture.tenant);
    const result = await writeExchangePrismaSale(tx, fixture.tenant, {
      paidAmountLak: 0,
      refundMethod: "cash",
      replacementItems: [{ productId: fixture.productA.id, quantity: 1, unitId: fixture.unitA.id }],
      returnedItems: [{ condition: "sellable", quantity: 1, saleItemId: lineOf(sale, fixture.productA.id).id }],
      saleId: sale.id,
    });
    assertClose(result.differenceLak ?? 0, 0, "Equal exchange");
    const refund = await tx.refund.findFirstOrThrow({ where: { saleId: sale.id } });
    assert(refund.cashSessionId == null, "Equal cash exchange null session");
  });

  await isolated("50. Cash exchange difference requires open session", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await sell(
      tx,
      fixture.tenant,
      [{ productId: fixture.productD.id, quantity: 1, sellingPrice: 15000, unitId: fixture.unitD.id }],
      { cashAmount: 15000, paymentMode: "cash", totalAmount: 15000 },
    );
    await closeOpenCashSessions(tx, fixture.tenant);
    await expectFailure(
      tx,
      () =>
        writeExchangePrismaSale(tx, fixture.tenant, {
          paidAmountLak: 0,
          refundMethod: "cash",
          replacementItems: [{ productId: fixture.productA.id, quantity: 1, unitId: fixture.unitA.id }],
          returnedItems: [{ condition: "sellable", quantity: 1, saleItemId: lineOf(sale, fixture.productD.id).id }],
          saleId: sale.id,
        }),
      /cash exchange/,
      "Cash exchange refund difference without session",
    );
  });

  try {
    wiringPass();
  } catch (error) {
    results.push({
      detail: error instanceof Error ? error.message : String(error),
      name: "Demo/mock post-sale leakage",
      status: "FAIL",
    });
  }

  const after = await goboxCounts(prisma);
  const leaked = await prisma.company.count({
    where: { storeCode: { startsWith: "e8" }, NOT: { id: before.companyId } },
  });
  await prisma.$disconnect();

  assert(leaked === 0, `Isolated fixtures leaked ${leaked} companies`);
  assert(after.products === before.products, "GO BOX product count changed");
  assert(after.balances === before.balances, "GO BOX balance count changed");
  assert(after.lots === before.lots, "GO BOX lot count changed");
  assert(after.movements === before.movements, "GO BOX movement count changed");
  assert(after.sales === before.sales, "GO BOX sale count changed");
  assert(after.refunds === before.refunds, "GO BOX refund count changed");

  const matrix = results.filter((row) => /^\d+\./.test(row.name));
  const failed = results.filter((row) => row.status === "FAIL");
  console.log(
    JSON.stringify(
      {
        failed: failed.length,
        gobox: after,
        matrixPassed: matrix.filter((row) => row.status === "PASS").length,
        matrixTotal: matrix.length,
        passed: results.filter((row) => row.status === "PASS").length,
        results,
        total: results.length,
      },
      null,
      2,
    ),
  );
  if (failed.length || matrix.length !== 50) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
