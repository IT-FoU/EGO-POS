import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { buildCashSessionTotals, summarizeSalePayments } from "../features/cash-sessions/cash-session-calculator";
import { receiptSnapshotFromPersistedSale } from "../features/pos/checkout-receipt";
import { writeCompletePrismaSale, type CompletePrismaSaleInput } from "../features/pos/prisma-repository";
import { mapSaleRow, RECENT_SALE_STATUSES } from "../features/pos/post-sale-shared";
import type { PaymentMode } from "../features/pos/types";
import {
  writePrismaProductArchive,
  writePrismaProductCreate,
} from "../features/products/prisma-repository";
import type { TenantContext } from "../lib/db/write-context";

const TARGET_REF = "ieutdqnlfiiaawctapor";
const GOFLO_REF = "luivrsuotrdkgxkhxxbq";
const OLD_PRO_REF = "urqizygucheilflanlea";
const TX_OPTS = { maxWait: 20_000, timeout: 120_000 } as const;
const OPENING_CASH = 100_000;

class RollbackError extends Error {
  constructor() {
    super("FIX-07 isolated fixture rollback");
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
  const [products, balances, lots, movements, sales, payments] = await Promise.all([
    prisma.product.count({ where: { companyId: company.id } }),
    prisma.inventoryBalance.count({ where: { companyId: company.id } }),
    prisma.inventoryLot.count({ where: { companyId: company.id } }),
    prisma.stockMovement.count({ where: { companyId: company.id } }),
    prisma.sale.count({ where: { companyId: company.id } }),
    prisma.salePayment.count({ where: { sale: { companyId: company.id } } }),
  ]);
  return { balances, companyId: company.id, lots, movements, payments, products, sales };
}

async function createIsolatedTenant(tx: Tx, label: string) {
  const token = randomBytes(6).toString("hex");
  const storeCode = `e7${token}`;
  const user = await tx.user.create({
    data: {
      fullName: `FIX-07 ${label}`,
      passwordHash: "isolated-fixture",
      username: `e7u${token}`,
    },
  });
  const company = await tx.company.create({
    data: {
      businessTemplateKey: "mini-mart",
      name: `FIX-07 ${label}`,
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

type CheckoutItem = {
  productId: string;
  quantity: number;
  sellingPrice: number;
  unitId?: string;
  conversionQty?: number;
};

function checkoutInput(
  tenant: TenantContext,
  items: CheckoutItem[],
  payment: {
    cardAmount?: number;
    cashAmount?: number;
    paymentMode: PaymentMode;
    qrAmount?: number;
    totalAmount: number;
    transferAmount?: number;
  },
  overrides: Partial<CompletePrismaSaleInput> = {},
): CompletePrismaSaleInput {
  return {
    branchId: tenant.branchId ?? "",
    cardAmount: payment.cardAmount ?? 0,
    cashAmount: payment.cashAmount ?? 0,
    changeAmount: 0,
    discountAmount: 0,
    discountPercent: 0,
    items: items.map((item) => ({
      conversionQty: item.conversionQty ?? 1,
      costPrice: 0,
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
    ...overrides,
  };
}

async function checkout(tx: Tx, tenant: TenantContext, input: CompletePrismaSaleInput) {
  return writeCompletePrismaSale(tx, input, tenant);
}

async function expectCheckoutFailure(
  tx: Tx,
  run: () => Promise<unknown>,
  pattern: RegExp,
  label: string,
) {
  await tx.$executeRawUnsafe("SAVEPOINT checkout_attempt");
  try {
    await run();
    await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT checkout_attempt");
    throw new Error(`${label}: expected checkout to fail`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith(`${label}: expected checkout to fail`)) throw error;
    await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT checkout_attempt");
    assertMatch(message, pattern, label);
  }
}

async function seedCore(tx: Tx) {
  const ctx = await createIsolatedTenant(tx, "checkout");
  const { tenant, warehouseAId } = ctx;

  const productA = await writePrismaProductCreate(
    tx,
    pieceInput({
      barcode: "0711111111111",
      nameEn: "EGO FIX07 Product Alpha",
      sellingPriceLak: 10000,
      sku: "E7-SKU-A",
    }),
    tenant,
  );
  const productB = await writePrismaProductCreate(
    tx,
    pieceInput({
      barcode: "0722222222222",
      nameEn: "EGO FIX07 Product Bravo Lots",
      sellingPriceLak: 5000,
      sku: "E7-SKU-B",
    }),
    tenant,
  );
  const productC = await writePrismaProductCreate(
    tx,
    pieceInput({
      barcode: "0733333333333",
      nameEn: "EGO FIX07 Product Charlie Pack",
      sellingPriceLak: 1000,
      sku: "E7-SKU-C",
      units: [
        {
          barcode: "0733333333333",
          conversionQty: 1,
          isBaseUnit: true,
          isDefaultSaleUnit: true,
          sellingPriceLak: 1000,
          unitName: "Piece",
        },
        {
          barcode: "0733333333340",
          conversionQty: 12,
          isBaseUnit: false,
          isDefaultSaleUnit: false,
          sellingPriceLak: 11000,
          unitName: "Carton",
        },
      ],
    }),
    tenant,
  );

  await setBalance(tx, tenant, productA.id, warehouseAId, 20);
  await setBalance(tx, tenant, productB.id, warehouseAId, 10);
  await setBalance(tx, tenant, productC.id, warehouseAId, 24);

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
  const unitCPiece = productC.units.find((unit) => unit.unitName === "Piece");
  const unitCCarton = productC.units.find((unit) => unit.unitName === "Carton");
  assert(unitA && unitB && unitCPiece && unitCCarton, "Seed units missing");

  return {
    ...ctx,
    productA,
    productB,
    productC,
    unitA,
    unitB,
    unitCCarton,
    unitCPiece,
  };
}

async function sessionImpact(tx: Tx, tenant: TenantContext) {
  const payments = await tx.salePayment.findMany({
    select: { amount: true, changeAmount: true, paymentMethod: true },
    where: {
      sale: {
        companyId: tenant.companyId,
        createdBy: tenant.userId,
        saleStatus: "completed",
      },
    },
  });
  const summarized = summarizeSalePayments(payments);
  return buildCashSessionTotals({
    cashInLak: 0,
    cashOutLak: 0,
    cashSalesLak: summarized.cashSalesLak,
    nonCashSalesLak: summarized.nonCashSalesLak,
    openingCashLak: OPENING_CASH,
    refundLak: 0,
    voidCashLak: 0,
  });
}

function printWiringPass() {
  const client = readFileSync("features/pos/components/pos-page-client.tsx", "utf8");
  const receipt = readFileSync("features/pos/checkout-receipt.ts", "utf8");
  assert(client.includes("window.print()"), "ReceiptPreview is missing browser print");
  assert(client.includes("receiptSnapshotFromPersistedSale"), "Receipt is not sourced from persisted sale");
  assert(client.includes("checkoutInFlightRef"), "Client double-submit guard missing");
  assert(client.includes("refreshRecentSalesFromServer"), "Recent Sales refresh missing after checkout");
  assert(client.includes("reprintSaleReceipt"), "Reprint action wiring missing");
  assert(!receipt.includes("post-sale-shared"), "Receipt mapper must stay client-safe");
  const reprintApi = existsSync("features/pos/post-sale-client.ts")
    ? readFileSync("features/pos/post-sale-client.ts", "utf8")
    : "";
  assert(reprintApi.includes("/api/pos/sales/") && reprintApi.includes("reprint"), "Reprint client path missing");
}

function demoLeakagePass() {
  const repository = readFileSync("features/pos/prisma-repository.ts", "utf8");
  const action = readFileSync("features/pos/actions.ts", "utf8");
  assert(!repository.includes("IGO_DEMO_MODE"), "Checkout repository has demo-mode branch");
  assert(!action.includes("completeDemoSale"), "Server action still has demo sale fallback");
  assert(action.includes("completePrismaSale"), "Server action is not wired to Prisma checkout");
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  assert(url.includes(TARGET_REF), "Refusing non-Production database");
  assert(!url.includes(GOFLO_REF) && !url.includes(OLD_PRO_REF), "Refusing inactive PRO or GoFLO database");

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

  await isolated("1. Cash exact payment", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await checkout(
      tx,
      fixture.tenant,
      checkoutInput(
        fixture.tenant,
        [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
        { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
      ),
    );
    assertClose(sale.totalAmount, 10000, "Exact cash sale total");
    assertClose(sale.changeAmount, 0, "Exact cash must have zero change");
    assert(sale.payments.length === 1 && sale.payments[0].paymentMethod === "cash", "Cash payment method");
    assertClose(sale.payments[0].amount, 10000, "Cash received");
  });

  await isolated("2. Cash overpayment + change", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await checkout(
      tx,
      fixture.tenant,
      checkoutInput(
        fixture.tenant,
        [
          { productId: fixture.productA.id, quantity: 2, sellingPrice: 10000, unitId: fixture.unitA.id },
          { productId: fixture.productB.id, quantity: 3, sellingPrice: 5000, unitId: fixture.unitB.id },
        ],
        { cashAmount: 50000, paymentMode: "cash", totalAmount: 35000 },
      ),
    );
    assertClose(sale.totalAmount, 35000, "Overpay sale total");
    assertClose(sale.changeAmount, 15000, "Change 50000-35000");
    assertClose(sale.payments[0].amount, 50000, "Cash tender");
    assertClose(sale.payments[0].changeAmount, 15000, "Persisted cash change");
  });

  await isolated("3. Cash underpayment rejected", async (tx) => {
    const fixture = await seedCore(tx);
    await expectCheckoutFailure(
      tx,
      () =>
        checkout(
          tx,
          fixture.tenant,
          checkoutInput(
            fixture.tenant,
            [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
            { cashAmount: 9000, paymentMode: "cash", totalAmount: 10000 },
          ),
        ),
      /Insufficient payment/,
      "Cash underpayment",
    );
    assert((await tx.sale.count({ where: { companyId: fixture.tenant.companyId } })) === 0, "Underpay left a sale");
  });

  await isolated("4. Existing non-cash payment method", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await checkout(
      tx,
      fixture.tenant,
      checkoutInput(
        fixture.tenant,
        [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
        { cashAmount: 0, paymentMode: "qr", qrAmount: 10000, totalAmount: 10000 },
      ),
    );
    assert(sale.payments.length === 1 && sale.payments[0].paymentMethod === "qr", "QR method not persisted");
    assertClose(sale.changeAmount, 0, "QR must not mint cash change");
    assertClose(sale.payments[0].amount, 10000, "QR amount");
    const impact = await sessionImpact(tx, fixture.tenant);
    assertClose(impact.cashSalesLak, 0, "QR must not increase cash sales");
    assertClose(impact.nonCashSalesLak, 10000, "QR non-cash total");
    assertClose(impact.expectedCashLak, OPENING_CASH, "QR must not change expected cash");
  });

  await isolated("5. Empty cart blocked", async (tx) => {
    const fixture = await seedCore(tx);
    await expectCheckoutFailure(
      tx,
      () =>
        checkout(
          tx,
          fixture.tenant,
          checkoutInput(fixture.tenant, [], { cashAmount: 0, paymentMode: "cash", totalAmount: 0 }),
        ),
      /at least one item/,
      "Empty cart",
    );
  });

  await isolated("6. Single Product checkout", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await checkout(
      tx,
      fixture.tenant,
      checkoutInput(
        fixture.tenant,
        [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
        { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
      ),
    );
    assert(sale.items.length === 1 && sale.items[0].productId === fixture.productA.id, "Single sale item");
    assertClose(sale.items[0].quantity, 1, "Single qty");
    assertClose(sale.subtotal, 10000, "Single subtotal");
  });

  await isolated("7. Multiple Product checkout", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await checkout(
      tx,
      fixture.tenant,
      checkoutInput(
        fixture.tenant,
        [
          { productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id },
          { productId: fixture.productB.id, quantity: 1, sellingPrice: 5000, unitId: fixture.unitB.id },
        ],
        { cashAmount: 10000, paymentMode: "mixed", qrAmount: 5000, totalAmount: 15000 },
      ),
    );
    assert(sale.items.length === 2, "Mixed cart must persist two sale items");
    assert(sale.payments.some((row: { paymentMethod: string }) => row.paymentMethod === "cash"), "Split cash missing");
    assert(sale.payments.some((row: { paymentMethod: string }) => row.paymentMethod === "qr"), "Split QR missing");
    assertClose(sale.totalAmount, 15000, "Split payable");
    const impact = await sessionImpact(tx, fixture.tenant);
    assertClose(impact.cashSalesLak, 10000, "Split cash session cash");
    assertClose(impact.nonCashSalesLak, 5000, "Split cash session non-cash");
  });

  await isolated("8. Repeated quantity", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await checkout(
      tx,
      fixture.tenant,
      checkoutInput(
        fixture.tenant,
        [{ productId: fixture.productA.id, quantity: 3, sellingPrice: 10000, unitId: fixture.unitA.id }],
        { cashAmount: 30000, paymentMode: "cash", totalAmount: 30000 },
      ),
    );
    assertClose(sale.items[0].quantity, 3, "Repeated qty");
    assertClose(sale.totalAmount, 30000, "Repeated qty total");
    const balance = await tx.inventoryBalance.findUnique({
      where: { warehouseId_productId: { productId: fixture.productA.id, warehouseId: fixture.warehouseAId } },
    });
    assertClose(balance?.quantity, 17, "Qty 3 must deduct 3 pieces from 20");
  });

  await isolated("9. Pack/unit checkout", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await checkout(
      tx,
      fixture.tenant,
      checkoutInput(
        fixture.tenant,
        [{
          conversionQty: 99,
          productId: fixture.productC.id,
          quantity: 1,
          sellingPrice: 1,
          unitId: fixture.unitCCarton.id,
        }],
        { cashAmount: 11000, paymentMode: "cash", totalAmount: 11000 },
      ),
    );
    assertClose(sale.items[0].quantity, 1, "Carton display qty");
    assert(sale.items[0].unitId === fixture.unitCCarton.id, "Carton unit not retained");
    assertClose(sale.items[0].sellingPrice, 11000, "Carton server price");
    const movement = await tx.stockMovement.findFirst({
      where: { companyId: fixture.tenant.companyId, productId: fixture.productC.id, movementType: "sale" },
    });
    assertClose(movement?.quantity, -12, "One carton must deduct 12 base units");
    const balance = await tx.inventoryBalance.findUnique({
      where: { warehouseId_productId: { productId: fixture.productC.id, warehouseId: fixture.warehouseAId } },
    });
    assertClose(balance?.quantity, 12, "Pack sale leftover base qty");
  });

  await isolated("10. Multi-lot FEFO deduction", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await checkout(
      tx,
      fixture.tenant,
      checkoutInput(
        fixture.tenant,
        [{ productId: fixture.productB.id, quantity: 7, sellingPrice: 5000, unitId: fixture.unitB.id }],
        { cashAmount: 35000, paymentMode: "cash", totalAmount: 35000 },
      ),
    );
    const lots = await tx.inventoryLot.findMany({
      orderBy: { lotNumber: "asc" },
      where: { productId: fixture.productB.id },
    });
    const lotA = lots.find((lot: { lotNumber: string }) => lot.lotNumber === "LOT-A");
    const lotB = lots.find((lot: { lotNumber: string }) => lot.lotNumber === "LOT-B");
    assertClose(lotA?.quantity, 0, "FEFO must exhaust earlier LOT-A");
    assertClose(lotB?.quantity, 3, "FEFO remainder on LOT-B");
    const allocations = await tx.inventoryLotAllocation.findMany({
      where: { productId: fixture.productB.id, saleItemId: sale.items[0].id },
    });
    const allocated = allocations.reduce((total: number, row: { quantity: unknown }) => total + qty(row.quantity), 0);
    assertClose(allocated, 7, "Lot allocations must total sold qty");
    const movement = await tx.stockMovement.findFirst({
      where: { companyId: fixture.tenant.companyId, productId: fixture.productB.id },
    });
    assertClose(movement?.quantity, -7, "FEFO stock movement");
    const balance = await tx.inventoryBalance.findUnique({
      where: { warehouseId_productId: { productId: fixture.productB.id, warehouseId: fixture.warehouseAId } },
    });
    assertClose(balance?.quantity, 3, "FEFO balance leftover");
  });

  await isolated("11. Stock insufficient at final submit", async (tx) => {
    const fixture = await seedCore(tx);
    await setBalance(tx, fixture.tenant, fixture.productA.id, fixture.warehouseAId, 1);
    await expectCheckoutFailure(
      tx,
      () =>
        checkout(
          tx,
          fixture.tenant,
          checkoutInput(
            fixture.tenant,
            [{ productId: fixture.productA.id, quantity: 2, sellingPrice: 10000, unitId: fixture.unitA.id }],
            { cashAmount: 20000, paymentMode: "cash", totalAmount: 20000 },
          ),
        ),
      /Insufficient stock/,
      "Insufficient stock",
    );
    assert((await tx.sale.count({ where: { companyId: fixture.tenant.companyId } })) === 0, "Insufficient stock left a sale");
    const balance = await tx.inventoryBalance.findUnique({
      where: { warehouseId_productId: { productId: fixture.productA.id, warehouseId: fixture.warehouseAId } },
    });
    assertClose(balance?.quantity, 1, "Failed checkout mutated stock");
  });

  await isolated("12. Product archived before submit", async (tx) => {
    const fixture = await seedCore(tx);
    await writePrismaProductArchive(tx, fixture.productA.id, fixture.tenant);
    await expectCheckoutFailure(
      tx,
      () =>
        checkout(
          tx,
          fixture.tenant,
          checkoutInput(
            fixture.tenant,
            [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
            { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
          ),
        ),
      /not found or is inactive/,
      "Archived product",
    );
  });

  await isolated("13. Price tamper rejected/recomputed", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await checkout(
      tx,
      fixture.tenant,
      checkoutInput(
        fixture.tenant,
        [{ conversionQty: 99, productId: fixture.productA.id, quantity: 1, sellingPrice: 1, unitId: fixture.unitA.id }],
        { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
      ),
    );
    assertClose(sale.items[0].sellingPrice, 10000, "Client unit price must not become authoritative");
    assertClose(sale.totalAmount, 10000, "Price tamper must recompute server total");
  });

  await isolated("14. Total tamper rejected/recomputed", async (tx) => {
    const fixture = await seedCore(tx);
    await expectCheckoutFailure(
      tx,
      () =>
        checkout(
          tx,
          fixture.tenant,
          checkoutInput(
            fixture.tenant,
            [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
            { cashAmount: 10000, paymentMode: "cash", totalAmount: 1 },
          ),
        ),
      /Checkout total mismatch/,
      "Total tamper",
    );
  });

  await isolated("15. Wrong tenant blocked", async (tx) => {
    const fixture = await seedCore(tx);
    const other = await createIsolatedTenant(tx, "other-tenant");
    await expectCheckoutFailure(
      tx,
      () =>
        checkout(
          tx,
          other.tenant,
          checkoutInput(
            other.tenant,
            [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
            { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
          ),
        ),
      /not found or is inactive/,
      "Wrong tenant product",
    );
    assert((await tx.sale.count({ where: { companyId: other.tenant.companyId } })) === 0, "Cross-tenant sale leaked");
  });

  await isolated("16. Wrong warehouse blocked", async (tx) => {
    const fixture = await seedCore(tx);
    const other = await createIsolatedTenant(tx, "other-warehouse");
    await expectCheckoutFailure(
      tx,
      () =>
        checkout(
          tx,
          fixture.tenant,
          checkoutInput(
            fixture.tenant,
            [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
            { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
            { warehouseId: other.warehouseAId },
          ),
        ),
      /Warehouse is outside the user's assigned branch/,
      "Wrong warehouse",
    );
    const ownEmpty = await expectCheckoutFailure(
      tx,
      () =>
        checkout(
          tx,
          fixture.tenant,
          checkoutInput(
            fixture.tenant,
            [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
            { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
            { warehouseId: fixture.warehouseBId },
          ),
        ),
      /Insufficient stock/,
      "Wrong warehouse stock",
    );
    void ownEmpty;
    const home = await tx.inventoryBalance.findUnique({
      where: { warehouseId_productId: { productId: fixture.productA.id, warehouseId: fixture.warehouseAId } },
    });
    assertClose(home?.quantity, 20, "Failed WH-B checkout mutated WH-A stock");
  });

  await isolated("17. Unauthorized checkout blocked", async (tx) => {
    const fixture = await seedCore(tx);
    const clerk = await tx.user.create({
      data: {
        fullName: "FIX-07 Clerk",
        passwordHash: "isolated-fixture",
        username: `e7c${randomBytes(6).toString("hex")}`,
      },
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
    const clerkTenant: TenantContext = {
      ...fixture.tenant,
      userId: clerk.id,
    };
    await expectCheckoutFailure(
      tx,
      () =>
        checkout(
          tx,
          clerkTenant,
          checkoutInput(
            clerkTenant,
            [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
            { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
          ),
        ),
      /Permission denied/,
      "Unauthorized checkout",
    );
  });

  await isolated("18. Double-click/idempotency", async (tx) => {
    const fixture = await seedCore(tx);
    const input = checkoutInput(
      fixture.tenant,
      [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
      { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
      { saleNo: "INV0001" },
    );
    await checkout(tx, fixture.tenant, input);
    await expectCheckoutFailure(
      tx,
      () => checkout(tx, fixture.tenant, input),
      /already used/,
      "Duplicate saleNo",
    );
    assert((await tx.sale.count({ where: { companyId: fixture.tenant.companyId } })) === 1, "Duplicate sale created");
    assert((await tx.stockMovement.count({ where: { companyId: fixture.tenant.companyId } })) === 1, "Duplicate stock movement");
  });

  await isolated("19. Failure rollback", async (tx) => {
    const fixture = await seedCore(tx);
    await expectCheckoutFailure(
      tx,
      () =>
        checkout(
          tx,
          fixture.tenant,
          checkoutInput(
            fixture.tenant,
            [{ productId: fixture.productA.id, quantity: 50, sellingPrice: 10000, unitId: fixture.unitA.id }],
            { cashAmount: 500000, paymentMode: "cash", totalAmount: 500000 },
          ),
        ),
      /Insufficient stock/,
      "Rollback on stock failure",
    );
    assert((await tx.sale.count({ where: { companyId: fixture.tenant.companyId } })) === 0, "Failed checkout left a sale");
    assert((await tx.salePayment.count({ where: { sale: { companyId: fixture.tenant.companyId } } })) === 0, "Failed checkout left a payment");
    assert((await tx.stockMovement.count({ where: { companyId: fixture.tenant.companyId } })) === 0, "Failed checkout left a movement");
    const balance = await tx.inventoryBalance.findUnique({
      where: { warehouseId_productId: { productId: fixture.productA.id, warehouseId: fixture.warehouseAId } },
    });
    assertClose(balance?.quantity, 20, "Failed checkout deducted stock");
  });

  await isolated("20. Sale record correct", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await checkout(
      tx,
      fixture.tenant,
      checkoutInput(
        fixture.tenant,
        [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
        { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
      ),
    );
    assert(sale.saleStatus === "completed", "Sale status");
    assert(sale.paymentStatus === "paid", "Payment status");
    assert(sale.companyId === fixture.tenant.companyId, "Sale company");
    assert(sale.warehouseId === fixture.warehouseAId, "Sale warehouse");
    assert(String(sale.saleNo).startsWith("INV"), "Sale number prefix");
    assert(String(sale.receiptNo) === `RCPT-${sale.saleNo}`, "Receipt number");
    const duplicateNos = await tx.sale.groupBy({
      by: ["saleNo"],
      where: { companyId: fixture.tenant.companyId },
      _count: { saleNo: true },
    });
    assert(duplicateNos.every((row: { _count: { saleNo: number } }) => row._count.saleNo === 1), "Duplicate bill number");
  });

  await isolated("21. SaleItems correct", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await checkout(
      tx,
      fixture.tenant,
      checkoutInput(
        fixture.tenant,
        [
          { productId: fixture.productA.id, quantity: 2, sellingPrice: 1, unitId: fixture.unitA.id },
          { productId: fixture.productB.id, quantity: 1, sellingPrice: 1, unitId: fixture.unitB.id },
        ],
        { cashAmount: 25000, paymentMode: "cash", totalAmount: 25000 },
      ),
    );
    assert(sale.items.length === 2, "SaleItems count");
    const lineA = sale.items.find((item: { productId: string }) => item.productId === fixture.productA.id);
    const lineB = sale.items.find((item: { productId: string }) => item.productId === fixture.productB.id);
    assertClose(lineA?.quantity, 2, "SaleItem A qty");
    assertClose(lineA?.sellingPrice, 10000, "SaleItem A server price");
    assertClose(lineB?.sellingPrice, 5000, "SaleItem B server price");
    assertClose(sale.subtotal, 25000, "SaleItem totals vs sale subtotal");
  });

  await isolated("22. Payment correct", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await checkout(
      tx,
      fixture.tenant,
      checkoutInput(
        fixture.tenant,
        [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
        { cardAmount: 10000, cashAmount: 0, paymentMode: "card", totalAmount: 10000 },
      ),
    );
    assert(sale.payments.length === 1, "One payment row");
    assert(sale.payments[0].paymentMethod === "visa", "Card persists as visa");
    assertClose(sale.payments[0].amount, 10000, "Card amount");
    assertClose(sale.payments[0].changeAmount, 0, "Card change must be zero");
    await expectCheckoutFailure(
      tx,
      () =>
        checkout(
          tx,
          fixture.tenant,
          checkoutInput(
            fixture.tenant,
            [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
            { cashAmount: -1, paymentMode: "cash", totalAmount: 10000 },
          ),
        ),
      /cannot be negative/,
      "Negative tender",
    );
  });

  await isolated("23. Stock movement correct", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await checkout(
      tx,
      fixture.tenant,
      checkoutInput(
        fixture.tenant,
        [{ productId: fixture.productA.id, quantity: 2, sellingPrice: 10000, unitId: fixture.unitA.id }],
        { cashAmount: 20000, paymentMode: "cash", totalAmount: 20000 },
      ),
    );
    const movements = await tx.stockMovement.findMany({
      where: { companyId: fixture.tenant.companyId, referenceId: sale.id, referenceType: "sale" },
    });
    assert(movements.length === 1, "One stock movement per sold product");
    assertClose(movements[0].quantity, -2, "Movement qty");
    assertClose(movements[0].beforeQty, 20, "Movement before");
    assertClose(movements[0].afterQty, 18, "Movement after");
    assert(movements[0].movementType === "sale", "Movement type");
  });

  await isolated("24. Lot allocations correct", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await checkout(
      tx,
      fixture.tenant,
      checkoutInput(
        fixture.tenant,
        [{ productId: fixture.productB.id, quantity: 7, sellingPrice: 5000, unitId: fixture.unitB.id }],
        { cashAmount: 35000, paymentMode: "cash", totalAmount: 35000 },
      ),
    );
    const allocations = await tx.inventoryLotAllocation.findMany({
      where: { companyId: fixture.tenant.companyId, sourceType: "sale_item" },
    });
    const total = allocations.reduce((sum: number, row: { quantity: unknown }) => sum + qty(row.quantity), 0);
    assertClose(total, 7, "Allocation total");
    assert(allocations.every((row: { saleItemId: string | null }) => row.saleItemId === sale.items[0].id), "Allocation provenance");
    const pieceSale = await checkout(
      tx,
      fixture.tenant,
      checkoutInput(
        fixture.tenant,
        [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
        { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
      ),
    );
    const pieceAlloc = await tx.inventoryLotAllocation.count({
      where: { saleItemId: pieceSale.items[0].id },
    });
    assert(pieceAlloc === 0, "Piece product without lots must not invent allocations");
  });

  await isolated("25. Cash session correct", async (tx) => {
    const fixture = await seedCore(tx);
    await checkout(
      tx,
      fixture.tenant,
      checkoutInput(
        fixture.tenant,
        [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
        { cashAmount: 15000, paymentMode: "cash", totalAmount: 10000 },
      ),
    );
    const cashImpact = await sessionImpact(tx, fixture.tenant);
    assertClose(cashImpact.cashSalesLak, 10000, "Cash sales net of change");
    assertClose(cashImpact.expectedCashLak, OPENING_CASH + 10000, "Expected cash after cash sale");
    await checkout(
      tx,
      fixture.tenant,
      checkoutInput(
        fixture.tenant,
        [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
        { paymentMode: "transfer", totalAmount: 10000, transferAmount: 10000 },
      ),
    );
    const afterNonCash = await sessionImpact(tx, fixture.tenant);
    assertClose(afterNonCash.cashSalesLak, 10000, "Transfer must not add cash sales");
    assertClose(afterNonCash.nonCashSalesLak, 10000, "Transfer non-cash");
    assertClose(afterNonCash.expectedCashLak, OPENING_CASH + 10000, "Transfer must not raise expected cash");
  });

  await isolated("26. Receipt data correct", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await checkout(
      tx,
      fixture.tenant,
      checkoutInput(
        fixture.tenant,
        [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 1, unitId: fixture.unitA.id }],
        { cashAmount: 15000, paymentMode: "cash", totalAmount: 10000 },
      ),
    );
    const receipt = receiptSnapshotFromPersistedSale(sale, {
      branchName: "Main",
      cashierName: "FIX-07 checkout",
      customerName: "Guest",
    });
    assert(receipt.saleNo === sale.saleNo, "Receipt saleNo");
    assert(receipt.receiptNo === sale.receiptNo, "Receipt number");
    assertClose(receipt.totalAmount, 10000, "Receipt total from persisted sale");
    assertClose(receipt.changeAmount, 5000, "Receipt change from persisted sale");
    assert(receipt.paymentMode === "cash", "Receipt payment mode");
    assert(receipt.cartItems[0].nameEn === "EGO FIX07 Product Alpha", "Receipt item name");
    assertClose(receipt.cartItems[0].priceLak, 10000, "Receipt must not use tampered cart price");
    assert(receipt.cartItems[0].unitName === "Piece", "Receipt unit");
  });

  try {
    printWiringPass();
    results.push({ name: "27. Browser print/reprint", status: "PASS" });
  } catch (error) {
    results.push({
      detail: error instanceof Error ? error.message : String(error),
      name: "27. Browser print/reprint",
      status: "FAIL",
    });
  }

  await isolated("28. Recent Sales single entry", async (tx) => {
    const fixture = await seedCore(tx);
    const sale = await checkout(
      tx,
      fixture.tenant,
      checkoutInput(
        fixture.tenant,
        [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
        { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
      ),
    );
    const rows = await tx.sale.findMany({
      include: {
        customer: true,
        items: { include: { product: true, unit: true } },
        payments: true,
        refunds: true,
      },
      where: {
        companyId: fixture.tenant.companyId,
        saleStatus: { in: [...RECENT_SALE_STATUSES] },
      },
    });
    assert(rows.length === 1, "Recent Sales must contain exactly one sale");
    const record = mapSaleRow(rows[0], "FIX-07 checkout");
    assert(record.id === sale.id, "Recent Sales opened the wrong sale");
    assert(record.status === "completed" || record.status === "paid", `Recent Sales status ${record.status}`);
    assertClose(record.totalAmount, 10000, "Recent Sales total");
    assert(record.paymentMode === "cash", "Recent Sales payment method");
    assert(record.receiptNo === sale.receiptNo, "Recent Sales receipt number");
  });

  const storeCode = `e7${randomBytes(6).toString("hex")}`;
  try {
    await prisma.$transaction(async (tx) => {
      const fixture = await seedCore(tx);
      await tx.company.update({ data: { storeCode }, where: { id: fixture.tenant.companyId } });
      await checkout(
        tx,
        fixture.tenant,
        checkoutInput(
          fixture.tenant,
          [{ productId: fixture.productA.id, quantity: 1, sellingPrice: 10000, unitId: fixture.unitA.id }],
          { cashAmount: 10000, paymentMode: "cash", totalAmount: 10000 },
        ),
      );
      throw new Error("simulated DB failure");
    }, TX_OPTS);
    results.push({ detail: "transaction committed", name: "19b. Outer abort leftover", status: "FAIL" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const leftover = await prisma.company.count({ where: { storeCode } });
    if (message !== "simulated DB failure" || leftover !== 0) {
      const rollback = results.find((row) => row.name === "19. Failure rollback");
      if (rollback) {
        rollback.status = "FAIL";
        rollback.detail = `${rollback.detail ?? ""}; outer abort: ${message}; leftover=${leftover}`.trim();
      }
    }
  }

  try {
    demoLeakagePass();
  } catch (error) {
    results.push({
      detail: error instanceof Error ? error.message : String(error),
      name: "Demo/mock checkout leakage",
      status: "FAIL",
    });
  }

  const after = await goboxCounts(prisma);
  const leaked = await prisma.company.count({
    where: { storeCode: { startsWith: "e7" }, NOT: { id: before.companyId } },
  });
  await prisma.$disconnect();

  assert(leaked === 0, `Isolated fixtures leaked ${leaked} companies`);
  assert(after.products === before.products, "GO BOX product count changed");
  assert(after.balances === before.balances, "GO BOX balance count changed");
  assert(after.lots === before.lots, "GO BOX lot count changed");
  assert(after.movements === before.movements, "GO BOX movement count changed");
  assert(after.sales === before.sales, "GO BOX sale count changed");
  assert(after.payments === before.payments, "GO BOX payment count changed");

  const matrix = results.filter((row) => /^\d+/.test(row.name));
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
  if (failed.length || matrix.length !== 28) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
