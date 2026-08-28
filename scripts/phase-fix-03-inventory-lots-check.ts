import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { applyAtomicStockDelta } from "../features/inventory/stock-concurrency";
import {
  allocateFefoLots,
  consumeInventoryForSale,
  LOT_ALLOCATION_SOURCE,
  restoreInventoryForReturn,
} from "../features/inventory/lot-reconciliation";

const TARGET_REF = "ieutdqnlfiiaawctapor";
const GOFLO_REF = "luivrsuotrdkgxkhxxbq";
const OLD_PRO_REF = "urqizygucheilflanlea";

class RollbackError extends Error {
  constructor() {
    super("FIX-03 isolated fixture rollback");
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
process.env.IGO_DEMO_MODE = "false";

function qty(value: unknown) {
  return Math.round(Number(value ?? 0) * 1000) / 1000;
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

type Tx = any;

type Fixture = {
  branchId: string;
  companyId: string;
  productAId: string;
  productBId: string;
  unitABaseId: string;
  unitABoxId: string;
  unitBBaseId: string;
  warehouseAId: string;
  warehouseBId: string;
};

async function goboxCounts(prisma: PrismaClient) {
  const company = await prisma.company.findFirst({ where: { storeCode: "0001" } });
  if (!company) {
    throw new Error("GO BOX company storeCode 0001 was not found.");
  }
  const [products, sales, lots, balances, allocations, movements] = await Promise.all([
    prisma.product.count({ where: { companyId: company.id } }),
    prisma.sale.count({ where: { companyId: company.id } }),
    prisma.inventoryLot.count({ where: { companyId: company.id } }),
    prisma.inventoryBalance.count({ where: { companyId: company.id } }),
    prisma.inventoryLotAllocation.count({ where: { companyId: company.id } }),
    prisma.stockMovement.count({ where: { companyId: company.id } }),
  ]);
  return { allocations, balances, companyId: company.id, lots, movements, products, sales };
}

async function balanceQty(tx: Tx, warehouseId: string, productId: string) {
  const row = await tx.inventoryBalance.findUnique({
    where: { warehouseId_productId: { productId, warehouseId } },
  });
  return qty(row?.quantity);
}

async function lotQtyById(tx: Tx, lotId: string) {
  const row = await tx.inventoryLot.findUniqueOrThrow({ where: { id: lotId } });
  return qty(row.quantity);
}

async function lotTotal(tx: Tx, warehouseId: string, productId: string) {
  const rows = await tx.inventoryLot.findMany({ where: { productId, warehouseId } });
  return rows.reduce((total: number, row: { quantity: unknown }) => total + qty(row.quantity), 0);
}

async function movementCount(tx: Tx, referenceId: string) {
  return tx.stockMovement.count({ where: { referenceId } });
}

async function createFixture(
  tx: Tx,
  options?: { lotA1?: number; lotA2?: number; productBQty?: number; warehouseBQty?: number },
) {
  const lotA1 = options?.lotA1 ?? 3;
  const lotA2 = options?.lotA2 ?? 5;
  const productBQty = options?.productBQty ?? 10;
  const warehouseBQty = options?.warehouseBQty ?? 8;
  const storeCode = `e3${randomBytes(6).toString("hex")}`;
  const company = await tx.company.create({
    data: {
      businessTemplateKey: "mini-mart",
      name: "FIX-03 isolated",
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
  const productA = await tx.product.create({
    data: {
      branchId: branch.id,
      companyId: company.id,
      nameLo: "Product A",
      sellingPriceLak: 1000,
      sku: `A-${storeCode}`,
    },
  });
  const productB = await tx.product.create({
    data: {
      branchId: branch.id,
      companyId: company.id,
      nameLo: "Product B",
      sellingPriceLak: 2000,
      sku: `B-${storeCode}`,
    },
  });
  const unitABase = await tx.productUnit.create({
    data: {
      conversionQty: 1,
      isBaseUnit: true,
      isDefaultSaleUnit: true,
      productId: productA.id,
      sellingPriceLak: 1000,
      unitName: "piece",
    },
  });
  const unitABox = await tx.productUnit.create({
    data: {
      conversionQty: 12,
      isBaseUnit: false,
      isDefaultSaleUnit: false,
      productId: productA.id,
      sellingPriceLak: 12000,
      unitName: "box",
    },
  });
  const unitBBase = await tx.productUnit.create({
    data: {
      conversionQty: 1,
      isBaseUnit: true,
      isDefaultSaleUnit: true,
      productId: productB.id,
      sellingPriceLak: 2000,
      unitName: "piece",
    },
  });
  await tx.product.update({ data: { baseUnitId: unitABase.id }, where: { id: productA.id } });
  await tx.product.update({ data: { baseUnitId: unitBBase.id }, where: { id: productB.id } });

  const early = new Date("2026-01-01T00:00:00.000Z");
  const later = new Date("2026-06-01T00:00:00.000Z");
  const lot1 = await tx.inventoryLot.create({
    data: {
      companyId: company.id,
      expiryDate: early,
      lotNumber: "LOT-A1",
      productId: productA.id,
      quantity: lotA1,
      receivedAt: new Date("2026-01-02T00:00:00.000Z"),
      warehouseId: warehouseA.id,
    },
  });
  const lot2 = await tx.inventoryLot.create({
    data: {
      companyId: company.id,
      expiryDate: later,
      lotNumber: "LOT-A2",
      productId: productA.id,
      quantity: lotA2,
      receivedAt: new Date("2026-01-03T00:00:00.000Z"),
      warehouseId: warehouseA.id,
    },
  });
  await tx.inventoryLot.create({
    data: {
      companyId: company.id,
      expiryDate: early,
      lotNumber: "LOT-B1",
      productId: productB.id,
      quantity: productBQty,
      receivedAt: new Date("2026-01-02T00:00:00.000Z"),
      warehouseId: warehouseA.id,
    },
  });
  await tx.inventoryLot.create({
    data: {
      companyId: company.id,
      expiryDate: early,
      lotNumber: "LOT-A-WHB",
      productId: productA.id,
      quantity: warehouseBQty,
      receivedAt: new Date("2026-01-02T00:00:00.000Z"),
      warehouseId: warehouseB.id,
    },
  });
  await tx.inventoryBalance.create({
    data: {
      companyId: company.id,
      productId: productA.id,
      quantity: lotA1 + lotA2,
      warehouseId: warehouseA.id,
    },
  });
  await tx.inventoryBalance.create({
    data: {
      companyId: company.id,
      productId: productB.id,
      quantity: productBQty,
      warehouseId: warehouseA.id,
    },
  });
  await tx.inventoryBalance.create({
    data: {
      companyId: company.id,
      productId: productA.id,
      quantity: warehouseBQty,
      warehouseId: warehouseB.id,
    },
  });

  const fixture: Fixture = {
    branchId: branch.id,
    companyId: company.id,
    productAId: productA.id,
    productBId: productB.id,
    unitABaseId: unitABase.id,
    unitABoxId: unitABox.id,
    unitBBaseId: unitBBase.id,
    warehouseAId: warehouseA.id,
    warehouseBId: warehouseB.id,
  };
  return { fixture, lot1Id: lot1.id, lot2Id: lot2.id, storeCode };
}

async function createSaleItem(
  tx: Tx,
  fixture: Fixture,
  input: { productId: string; quantity: number; unitId: string; warehouseId?: string },
) {
  const sale = await tx.sale.create({
    data: {
      branchId: fixture.branchId,
      companyId: fixture.companyId,
      items: {
        create: {
          costPrice: 0,
          productId: input.productId,
          quantity: input.quantity,
          sellingPrice: 1000,
          totalAmount: 1000,
          unitId: input.unitId,
        },
      },
      paymentStatus: "paid",
      saleNo: `S-${randomBytes(6).toString("hex")}`,
      saleStatus: "completed",
      totalAmount: 1000,
      warehouseId: input.warehouseId ?? fixture.warehouseAId,
    },
    include: { items: true },
  });
  return { sale, saleItem: sale.items[0] };
}

async function checkoutBase(
  tx: Tx,
  fixture: Fixture,
  input: {
    baseQuantity: number;
    productId: string;
    saleItemId: string;
    saleId: string;
    unitId?: string;
    warehouseId?: string;
  },
) {
  const warehouseId = input.warehouseId ?? fixture.warehouseAId;
  const balance = await applyAtomicStockDelta(tx, {
    companyId: fixture.companyId,
    productId: input.productId,
    quantityDelta: -input.baseQuantity,
    warehouseId,
  });
  const allocations = await consumeInventoryForSale(tx, {
    companyId: fixture.companyId,
    productId: input.productId,
    quantity: input.baseQuantity,
    sourceId: input.saleItemId,
    sourceType: LOT_ALLOCATION_SOURCE.saleItem,
    warehouseId,
  });
  await tx.stockMovement.create({
    data: {
      afterQty: balance.afterQty,
      beforeQty: balance.beforeQty,
      companyId: fixture.companyId,
      movementType: "sale",
      note: "FIX-03 sale",
      productId: input.productId,
      quantity: -input.baseQuantity,
      referenceId: input.saleId,
      referenceType: "sale",
      unitId: input.unitId ?? null,
      warehouseId,
    },
  });
  return { allocations, balance };
}

async function restoreSellable(
  tx: Tx,
  fixture: Fixture,
  input: {
    baseQuantity: number;
    productId: string;
    saleItemId: string;
    saleId: string;
    warehouseId?: string;
  },
) {
  const warehouseId = input.warehouseId ?? fixture.warehouseAId;
  const restorations = await restoreInventoryForReturn(tx, {
    companyId: fixture.companyId,
    productId: input.productId,
    quantity: input.baseQuantity,
    sourceId: input.saleItemId,
    sourceType: LOT_ALLOCATION_SOURCE.saleItem,
    warehouseId,
  });
  const balance = await applyAtomicStockDelta(tx, {
    companyId: fixture.companyId,
    productId: input.productId,
    quantityDelta: input.baseQuantity,
    warehouseId,
  });
  await tx.stockMovement.create({
    data: {
      afterQty: balance.afterQty,
      beforeQty: balance.beforeQty,
      companyId: fixture.companyId,
      movementType: "return",
      note: "FIX-03 return",
      productId: input.productId,
      quantity: input.baseQuantity,
      referenceId: input.saleId,
      referenceType: "sale",
      warehouseId,
    },
  });
  return { balance, restorations };
}

async function createExchangeItem(
  tx: Tx,
  fixture: Fixture,
  saleId: string,
  productId: string,
  quantity: number,
  unitId: string,
) {
  const refund = await tx.refund.create({
    data: {
      companyId: fixture.companyId,
      exchangeItems: {
        create: {
          productId,
          quantity,
          sellingPrice: 1000,
          totalAmount: 1000,
          unitId,
        },
      },
      kind: "exchange",
      refundNo: `EXC-${randomBytes(6).toString("hex")}`,
      saleId,
      totalAmount: 0,
    },
    include: { exchangeItems: true },
  });
  return refund.exchangeItems[0];
}

async function consumeReplacement(
  tx: Tx,
  fixture: Fixture,
  input: { baseQuantity: number; productId: string; saleId: string; sourceId: string; warehouseId?: string },
) {
  const warehouseId = input.warehouseId ?? fixture.warehouseAId;
  const balance = await applyAtomicStockDelta(tx, {
    companyId: fixture.companyId,
    productId: input.productId,
    quantityDelta: -input.baseQuantity,
    warehouseId,
  });
  await consumeInventoryForSale(tx, {
    companyId: fixture.companyId,
    productId: input.productId,
    quantity: input.baseQuantity,
    sourceId: input.sourceId,
    sourceType: LOT_ALLOCATION_SOURCE.refundExchangeItem,
    warehouseId,
  });
  await tx.stockMovement.create({
    data: {
      afterQty: balance.afterQty,
      beforeQty: balance.beforeQty,
      companyId: fixture.companyId,
      movementType: "sale",
      note: "FIX-03 exchange out",
      productId: input.productId,
      quantity: input.baseQuantity,
      referenceId: input.saleId,
      referenceType: "sale_exchange",
      warehouseId,
    },
  });
  return balance;
}

async function runInRollback(prisma: PrismaClient, fn: (tx: Tx) => Promise<void>) {
  try {
    await prisma.$transaction(
      async (tx) => {
        await fn(tx);
        throw new RollbackError();
      },
      { maxWait: 20_000, timeout: 120_000 },
    );
  } catch (error) {
    if (error instanceof RollbackError) {
      return;
    }
    throw error;
  }
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes(TARGET_REF) || url.includes(GOFLO_REF) || url.includes(OLD_PRO_REF)) {
    throw new Error("Refusing FIX-03 tests: DATABASE_URL is not the intended Production project");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, ssl: { rejectUnauthorized: false } }),
  });

  const results: Array<{ name: string; status: "PASS" | "FAIL"; error?: string }> = [];
  const before = await goboxCounts(prisma);

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      results.push({ name, status: "PASS" });
      console.log(`PASS ${name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ name, status: "FAIL", error: message });
      console.error(`FAIL ${name}: ${message}`);
    }
  }

  await test("TEST 0 allocateFefoLots unit", async () => {
    const plan = allocateFefoLots(
      [
        { createdAt: new Date("2026-01-01"), expiryDate: new Date("2026-01-01"), id: "A", quantity: 3, receivedAt: new Date("2026-01-01") },
        { createdAt: new Date("2026-01-02"), expiryDate: new Date("2026-06-01"), id: "B", quantity: 5, receivedAt: new Date("2026-01-02") },
      ],
      6,
    );
    assertClose(plan[0]?.quantity, 3, "Lot A take");
    assertClose(plan[1]?.quantity, 3, "Lot B take");
  });

  await test("TEST 1 Single lot normal sale", async () => {
    await runInRollback(prisma, async (tx) => {
      const { fixture, lot1Id, lot2Id } = await createFixture(tx, { lotA1: 8, lotA2: 0 });
      const { sale, saleItem } = await createSaleItem(tx, fixture, {
        productId: fixture.productAId,
        quantity: 2,
        unitId: fixture.unitABaseId,
      });
      await checkoutBase(tx, fixture, {
        baseQuantity: 2,
        productId: fixture.productAId,
        saleId: sale.id,
        saleItemId: saleItem.id,
        unitId: fixture.unitABaseId,
      });
      assertClose(await lotQtyById(tx, lot1Id), 6, "Lot A remaining");
      assertClose(await lotQtyById(tx, lot2Id), 0, "Empty second lot");
      assertClose(await balanceQty(tx, fixture.warehouseAId, fixture.productAId), 6, "Balance");
      assertClose(await lotTotal(tx, fixture.warehouseAId, fixture.productAId), 6, "Lot total");
      assert((await movementCount(tx, sale.id)) === 1, "Sale movement missing");
    });
  });

  await test("TEST 2 Multi-lot sale", async () => {
    await runInRollback(prisma, async (tx) => {
      const { fixture, lot1Id, lot2Id } = await createFixture(tx);
      const { sale, saleItem } = await createSaleItem(tx, fixture, {
        productId: fixture.productAId,
        quantity: 6,
        unitId: fixture.unitABaseId,
      });
      await checkoutBase(tx, fixture, {
        baseQuantity: 6,
        productId: fixture.productAId,
        saleId: sale.id,
        saleItemId: saleItem.id,
      });
      assertClose(await lotQtyById(tx, lot1Id), 0, "Lot A after FEFO");
      assertClose(await lotQtyById(tx, lot2Id), 2, "Lot B after FEFO");
      assertClose(await balanceQty(tx, fixture.warehouseAId, fixture.productAId), 2, "Balance after multi-lot");
      assertClose(await lotTotal(tx, fixture.warehouseAId, fixture.productAId), 2, "Lot total after multi-lot");
    });
  });

  await test("TEST 3 Insufficient stock", async () => {
    await runInRollback(prisma, async (tx) => {
      const { fixture, lot1Id, lot2Id } = await createFixture(tx);
      const { sale, saleItem } = await createSaleItem(tx, fixture, {
        productId: fixture.productAId,
        quantity: 6,
        unitId: fixture.unitABaseId,
      });
      let failed = false;
      try {
        await checkoutBase(tx, fixture, {
          baseQuantity: 9,
          productId: fixture.productAId,
          saleId: sale.id,
          saleItemId: saleItem.id,
        });
      } catch (error) {
        failed = true;
        const message = error instanceof Error ? error.message : String(error);
        assert(/Insufficient/.test(message), `Expected insufficient error, got ${message}`);
      }
      assert(failed, "Oversell was not rejected");
      assertClose(await lotQtyById(tx, lot1Id), 3, "Lot A unchanged");
      assertClose(await lotQtyById(tx, lot2Id), 5, "Lot B unchanged");
      assertClose(await balanceQty(tx, fixture.warehouseAId, fixture.productAId), 8, "Balance unchanged");
    });
  });

  await test("TEST 4 Partial refund", async () => {
    await runInRollback(prisma, async (tx) => {
      const { fixture, lot1Id, lot2Id } = await createFixture(tx);
      const { sale, saleItem } = await createSaleItem(tx, fixture, {
        productId: fixture.productAId,
        quantity: 6,
        unitId: fixture.unitABaseId,
      });
      await checkoutBase(tx, fixture, {
        baseQuantity: 6,
        productId: fixture.productAId,
        saleId: sale.id,
        saleItemId: saleItem.id,
      });
      await restoreSellable(tx, fixture, {
        baseQuantity: 2,
        productId: fixture.productAId,
        saleId: sale.id,
        saleItemId: saleItem.id,
      });
      assertClose(await lotQtyById(tx, lot1Id), 2, "Partial restore to original FEFO lot");
      assertClose(await lotQtyById(tx, lot2Id), 2, "Later lot unchanged by partial restore prefix");
      assertClose(await balanceQty(tx, fixture.warehouseAId, fixture.productAId), 4, "Partial refund balance");
      assertClose(await lotTotal(tx, fixture.warehouseAId, fixture.productAId), 4, "Partial refund lots");
    });
  });

  await test("TEST 5 Full refund", async () => {
    await runInRollback(prisma, async (tx) => {
      const { fixture, lot1Id, lot2Id } = await createFixture(tx);
      const { sale, saleItem } = await createSaleItem(tx, fixture, {
        productId: fixture.productAId,
        quantity: 6,
        unitId: fixture.unitABaseId,
      });
      await checkoutBase(tx, fixture, {
        baseQuantity: 6,
        productId: fixture.productAId,
        saleId: sale.id,
        saleItemId: saleItem.id,
      });
      await restoreSellable(tx, fixture, {
        baseQuantity: 6,
        productId: fixture.productAId,
        saleId: sale.id,
        saleItemId: saleItem.id,
      });
      assertClose(await lotQtyById(tx, lot1Id), 3, "Full refund lot A");
      assertClose(await lotQtyById(tx, lot2Id), 5, "Full refund lot B");
      assertClose(await balanceQty(tx, fixture.warehouseAId, fixture.productAId), 8, "Full refund balance");
    });
  });

  await test("TEST 6 Void", async () => {
    await runInRollback(prisma, async (tx) => {
      const { fixture, lot1Id, lot2Id } = await createFixture(tx);
      const { sale, saleItem } = await createSaleItem(tx, fixture, {
        productId: fixture.productAId,
        quantity: 6,
        unitId: fixture.unitABaseId,
      });
      await checkoutBase(tx, fixture, {
        baseQuantity: 6,
        productId: fixture.productAId,
        saleId: sale.id,
        saleItemId: saleItem.id,
      });
      await restoreSellable(tx, fixture, {
        baseQuantity: 6,
        productId: fixture.productAId,
        saleId: sale.id,
        saleItemId: saleItem.id,
      });
      await tx.sale.update({
        data: { paymentStatus: "voided", saleStatus: "cancelled" },
        where: { id: sale.id },
      });
      assertClose(await lotQtyById(tx, lot1Id), 3, "Void lot A");
      assertClose(await lotQtyById(tx, lot2Id), 5, "Void lot B");
      assertClose(await balanceQty(tx, fixture.warehouseAId, fixture.productAId), 8, "Void balance");
    });
  });

  await test("TEST 7 Exchange same quantity", async () => {
    await runInRollback(prisma, async (tx) => {
      const { fixture, lot1Id, lot2Id } = await createFixture(tx);
      const { sale, saleItem } = await createSaleItem(tx, fixture, {
        productId: fixture.productAId,
        quantity: 1,
        unitId: fixture.unitABaseId,
      });
      await checkoutBase(tx, fixture, {
        baseQuantity: 1,
        productId: fixture.productAId,
        saleId: sale.id,
        saleItemId: saleItem.id,
      });
      await restoreSellable(tx, fixture, {
        baseQuantity: 1,
        productId: fixture.productAId,
        saleId: sale.id,
        saleItemId: saleItem.id,
      });
      const exchangeItem = await createExchangeItem(
        tx,
        fixture,
        sale.id,
        fixture.productAId,
        1,
        fixture.unitABaseId,
      );
      await consumeReplacement(tx, fixture, {
        baseQuantity: 1,
        productId: fixture.productAId,
        saleId: sale.id,
        sourceId: exchangeItem.id,
      });
      assertClose(await lotTotal(tx, fixture.warehouseAId, fixture.productAId), 7, "Same-product exchange net -1");
      assertClose(await balanceQty(tx, fixture.warehouseAId, fixture.productAId), 7, "Same-product exchange balance");
      assertClose(await lotQtyById(tx, lot1Id) + await lotQtyById(tx, lot2Id), 7, "Lots after same-product exchange");
    });
  });

  await test("TEST 8 Exchange different products", async () => {
    await runInRollback(prisma, async (tx) => {
      const { fixture } = await createFixture(tx);
      const { sale, saleItem } = await createSaleItem(tx, fixture, {
        productId: fixture.productAId,
        quantity: 2,
        unitId: fixture.unitABaseId,
      });
      await checkoutBase(tx, fixture, {
        baseQuantity: 2,
        productId: fixture.productAId,
        saleId: sale.id,
        saleItemId: saleItem.id,
      });
      await restoreSellable(tx, fixture, {
        baseQuantity: 2,
        productId: fixture.productAId,
        saleId: sale.id,
        saleItemId: saleItem.id,
      });
      const exchangeItem = await createExchangeItem(
        tx,
        fixture,
        sale.id,
        fixture.productBId,
        1,
        fixture.unitBBaseId,
      );
      await consumeReplacement(tx, fixture, {
        baseQuantity: 1,
        productId: fixture.productBId,
        saleId: sale.id,
        sourceId: exchangeItem.id,
      });
      assertClose(await balanceQty(tx, fixture.warehouseAId, fixture.productAId), 8, "A restored");
      assertClose(await lotTotal(tx, fixture.warehouseAId, fixture.productAId), 8, "A lots restored");
      assertClose(await balanceQty(tx, fixture.warehouseAId, fixture.productBId), 9, "B deducted");
      assertClose(await lotTotal(tx, fixture.warehouseAId, fixture.productBId), 9, "B lots deducted");
    });
  });

  await test("TEST 9 Repeated refund denied", async () => {
    await runInRollback(prisma, async (tx) => {
      const { fixture } = await createFixture(tx);
      const { sale, saleItem } = await createSaleItem(tx, fixture, {
        productId: fixture.productAId,
        quantity: 4,
        unitId: fixture.unitABaseId,
      });
      await checkoutBase(tx, fixture, {
        baseQuantity: 4,
        productId: fixture.productAId,
        saleId: sale.id,
        saleItemId: saleItem.id,
      });
      await restoreSellable(tx, fixture, {
        baseQuantity: 4,
        productId: fixture.productAId,
        saleId: sale.id,
        saleItemId: saleItem.id,
      });
      let denied = false;
      try {
        await restoreInventoryForReturn(tx, {
          companyId: fixture.companyId,
          productId: fixture.productAId,
          quantity: 1,
          sourceId: saleItem.id,
          sourceType: LOT_ALLOCATION_SOURCE.saleItem,
          warehouseId: fixture.warehouseAId,
        });
      } catch (error) {
        denied = true;
        const message = error instanceof Error ? error.message : String(error);
        assert(/Cannot restore|unrestored/.test(message), `Unexpected repeat-refund error: ${message}`);
      }
      assert(denied, "Repeated refund was not denied");
      assertClose(await balanceQty(tx, fixture.warehouseAId, fixture.productAId), 8, "No double restore balance");
      assertClose(await lotTotal(tx, fixture.warehouseAId, fixture.productAId), 8, "No double restore lots");
    });
  });

  await test("TEST 10 Repeated void denied", async () => {
    await runInRollback(prisma, async (tx) => {
      const { fixture } = await createFixture(tx);
      const { sale, saleItem } = await createSaleItem(tx, fixture, {
        productId: fixture.productAId,
        quantity: 4,
        unitId: fixture.unitABaseId,
      });
      await checkoutBase(tx, fixture, {
        baseQuantity: 4,
        productId: fixture.productAId,
        saleId: sale.id,
        saleItemId: saleItem.id,
      });
      await restoreSellable(tx, fixture, {
        baseQuantity: 4,
        productId: fixture.productAId,
        saleId: sale.id,
        saleItemId: saleItem.id,
      });
      let denied = false;
      try {
        await restoreInventoryForReturn(tx, {
          companyId: fixture.companyId,
          productId: fixture.productAId,
          quantity: 4,
          sourceId: saleItem.id,
          sourceType: LOT_ALLOCATION_SOURCE.saleItem,
          warehouseId: fixture.warehouseAId,
        });
      } catch (error) {
        denied = true;
        const message = error instanceof Error ? error.message : String(error);
        assert(/Cannot restore|unrestored/.test(message), `Unexpected repeat-void error: ${message}`);
      }
      assert(denied, "Repeated void lot restore was not denied");
      assertClose(await lotTotal(tx, fixture.warehouseAId, fixture.productAId), 8, "No second void lot restore");
    });
  });

  await test("TEST 11 Pack/unit conversion", async () => {
    await runInRollback(prisma, async (tx) => {
      const { fixture, lot1Id, lot2Id } = await createFixture(tx, { lotA1: 12, lotA2: 12 });
      const { sale, saleItem } = await createSaleItem(tx, fixture, {
        productId: fixture.productAId,
        quantity: 2,
        unitId: fixture.unitABoxId,
      });
      await checkoutBase(tx, fixture, {
        baseQuantity: 24,
        productId: fixture.productAId,
        saleId: sale.id,
        saleItemId: saleItem.id,
        unitId: fixture.unitABoxId,
      });
      assertClose(await lotQtyById(tx, lot1Id), 0, "Two boxes consume 12 from lot A");
      assertClose(await lotQtyById(tx, lot2Id), 0, "Two boxes consume 12 from lot B");
      assertClose(await balanceQty(tx, fixture.warehouseAId, fixture.productAId), 0, "Pack sale balance");
      await restoreSellable(tx, fixture, {
        baseQuantity: 12,
        productId: fixture.productAId,
        saleId: sale.id,
        saleItemId: saleItem.id,
      });
      assertClose(await lotTotal(tx, fixture.warehouseAId, fixture.productAId), 12, "One box restored as 12 base");
      assertClose(await balanceQty(tx, fixture.warehouseAId, fixture.productAId), 12, "One box refund balance");
    });
  });

  await test("TEST 12 Branch/warehouse isolation", async () => {
    await runInRollback(prisma, async (tx) => {
      const { fixture } = await createFixture(tx);
      const { sale, saleItem } = await createSaleItem(tx, fixture, {
        productId: fixture.productAId,
        quantity: 6,
        unitId: fixture.unitABaseId,
        warehouseId: fixture.warehouseAId,
      });
      await checkoutBase(tx, fixture, {
        baseQuantity: 6,
        productId: fixture.productAId,
        saleId: sale.id,
        saleItemId: saleItem.id,
        warehouseId: fixture.warehouseAId,
      });
      assertClose(await balanceQty(tx, fixture.warehouseAId, fixture.productAId), 2, "WH-A sold");
      assertClose(await lotTotal(tx, fixture.warehouseAId, fixture.productAId), 2, "WH-A lots sold");
      assertClose(await balanceQty(tx, fixture.warehouseBId, fixture.productAId), 8, "WH-B balance isolated");
      assertClose(await lotTotal(tx, fixture.warehouseBId, fixture.productAId), 8, "WH-B lots isolated");
    });
  });

  await test("TEST 13 Two sequential sales", async () => {
    await runInRollback(prisma, async (tx) => {
      const { fixture, lot1Id, lot2Id } = await createFixture(tx);
      const first = await createSaleItem(tx, fixture, {
        productId: fixture.productAId,
        quantity: 3,
        unitId: fixture.unitABaseId,
      });
      await checkoutBase(tx, fixture, {
        baseQuantity: 3,
        productId: fixture.productAId,
        saleId: first.sale.id,
        saleItemId: first.saleItem.id,
      });
      const second = await createSaleItem(tx, fixture, {
        productId: fixture.productAId,
        quantity: 4,
        unitId: fixture.unitABaseId,
      });
      await checkoutBase(tx, fixture, {
        baseQuantity: 4,
        productId: fixture.productAId,
        saleId: second.sale.id,
        saleItemId: second.saleItem.id,
      });
      assertClose(await lotQtyById(tx, lot1Id), 0, "Sequential sale emptied lot A");
      assertClose(await lotQtyById(tx, lot2Id), 1, "Sequential sale left 1 in lot B");
      assertClose(await balanceQty(tx, fixture.warehouseAId, fixture.productAId), 1, "Sequential balance");
    });
  });

  await test("TEST 14 Sale failure rolls back", async () => {
    const storeCode = `e3${randomBytes(6).toString("hex")}`;
    try {
      await prisma.$transaction(async (tx) => {
        const { fixture } = await createFixture(tx);
        await tx.company.update({ data: { storeCode }, where: { id: fixture.companyId } });
        const { sale, saleItem } = await createSaleItem(tx, fixture, {
          productId: fixture.productAId,
          quantity: 1,
          unitId: fixture.unitABaseId,
        });
        await checkoutBase(tx, fixture, {
          baseQuantity: 1,
          productId: fixture.productAId,
          saleId: sale.id,
          saleItemId: saleItem.id,
        });
        throw new Error("sale failed");
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      assert(message === "sale failed", `Unexpected sale-failure error: ${message}`);
    }
    const leftover = await prisma.company.count({ where: { storeCode } });
    assert(leftover === 0, "Failed sale left committed company/inventory rows");
  });

  await test("TEST 15 Refund failure rolls back", async () => {
    const storeCode = `e3${randomBytes(6).toString("hex")}`;
    try {
      await prisma.$transaction(async (tx) => {
        const { fixture } = await createFixture(tx);
        await tx.company.update({ data: { storeCode }, where: { id: fixture.companyId } });
        const { sale, saleItem } = await createSaleItem(tx, fixture, {
          productId: fixture.productAId,
          quantity: 2,
          unitId: fixture.unitABaseId,
        });
        await checkoutBase(tx, fixture, {
          baseQuantity: 2,
          productId: fixture.productAId,
          saleId: sale.id,
          saleItemId: saleItem.id,
        });
        await restoreSellable(tx, fixture, {
          baseQuantity: 2,
          productId: fixture.productAId,
          saleId: sale.id,
          saleItemId: saleItem.id,
        });
        throw new Error("refund failed");
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      assert(message === "refund failed", `Unexpected refund-failure error: ${message}`);
    }
    const leftover = await prisma.company.count({ where: { storeCode } });
    assert(leftover === 0, "Failed refund left committed company/inventory rows");
  });

  await test("TEST R Receiving then sale", async () => {
    await runInRollback(prisma, async (tx) => {
      const company = await tx.company.create({
        data: { businessTemplateKey: "mini-mart", name: "FIX-03 receive", storeCode: `e3${randomBytes(6).toString("hex")}` },
      });
      const branch = await tx.branch.create({
        data: { companyId: company.id, isMainBranch: true, name: "Main" },
      });
      const warehouse = await tx.warehouse.create({
        data: { branchId: branch.id, companyId: company.id, name: "WH", type: "store" },
      });
      const product = await tx.product.create({
        data: { branchId: branch.id, companyId: company.id, nameLo: "Recv", sellingPriceLak: 1, sku: `R-${company.id}` },
      });
      const unit = await tx.productUnit.create({
        data: {
          conversionQty: 1,
          isBaseUnit: true,
          isDefaultSaleUnit: true,
          productId: product.id,
          sellingPriceLak: 1,
          unitName: "piece",
        },
      });
      await applyAtomicStockDelta(tx, {
        companyId: company.id,
        productId: product.id,
        quantityDelta: 5,
        warehouseId: warehouse.id,
      });
      const receivedLot = await tx.inventoryLot.create({
        data: {
          companyId: company.id,
          expiryDate: new Date("2026-12-01T00:00:00.000Z"),
          lotNumber: "PO-LOT-1",
          productId: product.id,
          quantity: 5,
          receivedAt: new Date(),
          warehouseId: warehouse.id,
        },
      });
      const sale = await tx.sale.create({
        data: {
          branchId: branch.id,
          companyId: company.id,
          items: {
            create: {
              costPrice: 0,
              productId: product.id,
              quantity: 2,
              sellingPrice: 1,
              totalAmount: 1,
              unitId: unit.id,
            },
          },
          paymentStatus: "paid",
          saleNo: `S-${randomBytes(4).toString("hex")}`,
          saleStatus: "completed",
          totalAmount: 1,
          warehouseId: warehouse.id,
        },
        include: { items: true },
      });
      await applyAtomicStockDelta(tx, {
        companyId: company.id,
        productId: product.id,
        quantityDelta: -2,
        warehouseId: warehouse.id,
      });
      await consumeInventoryForSale(tx, {
        companyId: company.id,
        productId: product.id,
        quantity: 2,
        sourceId: sale.items[0].id,
        sourceType: LOT_ALLOCATION_SOURCE.saleItem,
        warehouseId: warehouse.id,
      });
      assertClose(await lotQtyById(tx, receivedLot.id), 3, "Receiving lot consumed by sale");
      assertClose(await balanceQty(tx, warehouse.id, product.id), 3, "Receiving balance consumed by sale");
    });
  });

  const after = await goboxCounts(prisma);
  const leakedCompanies = await prisma.company.count({
    where: { storeCode: { startsWith: "e3" }, NOT: { id: before.companyId } },
  });

  await prisma.$disconnect();

  assert(leakedCompanies === 0, `Isolated fixtures leaked ${leakedCompanies} companies`);
  assert(after.products === before.products, "GO BOX product count changed");
  assert(after.sales === before.sales, "GO BOX sale count changed");
  assert(after.lots === before.lots, "GO BOX lot count changed");
  assert(after.balances === before.balances, "GO BOX balance count changed");
  assert(after.allocations === before.allocations, "GO BOX allocation count changed");
  assert(after.movements === before.movements, "GO BOX movement count changed");

  const failed = results.filter((row) => row.status === "FAIL");
  console.log(
    JSON.stringify(
      {
        failed: failed.length,
        gobox: after,
        passed: results.filter((row) => row.status === "PASS").length,
        results,
        total: results.length,
      },
      null,
      2,
    ),
  );
  if (failed.length) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
