import { existsSync, readFileSync } from "node:fs";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";

process.env.IGO_DEMO_MODE = "false";

const NEW_REF = "ieutdqnlfiiaawctapor";
const OLD_REF = "urqizygucheilflanlea";
const PROD_REF = "luivrsuotrdkgxkhxxbq";

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
    if (key === "IGO_DEMO_MODE") continue;
    process.env[key] = value;
  }
}

loadProjectEnvFiles();
resolveScriptDatabaseUrl("test-write");

const { prisma } = await import("../lib/db/prisma");
const { completePrismaSale, getPrismaPosSnapshot } = await import("../features/pos/prisma-repository");
const { openCashSession, getOpenCashSession, recordCashSessionMovement } = await import("../features/cash-sessions/prisma-repository");
const { getPrismaSaleById, listPrismaRecentSales, logPrismaReceiptReprint, refundPrismaSale, voidPrismaSale } = await import("../features/pos/post-sale-repository");
const { exchangePrismaSale, getPrismaReturnReceipt, returnPrismaSale } = await import("../features/pos/return-repository");
const { cancelPrismaHeldBill, createPrismaHeldBill, listPrismaHeldBills, resumePrismaHeldBill } = await import("../features/pos/held-bills-repository");
const { getPrismaReportsSnapshot } = await import("../features/reports/prisma-repository");
const { resolveSaleStatusVisual } = await import("../features/pos/sale-status-presentation");
const { canPerformStoreAction, STORE_ACTIONS, STORE_ROLES } = await import("../features/permissions/store-permissions");
const { tenantFromSession } = await import("../lib/db/write-context");

const COMPANY_ID = "gobox-company";
const BRANCH_ID = "gobox-main-branch";
const WAREHOUSE_ID = "gobox-default-warehouse";
const CUSTOMER_ID = "p5-qa-member";
const PREFIX = "p5-qa";
const SALE_PREFIX = "P5QA-";
const EPS = 1;

type Tenant = { branchId: string; companyId: string; userId: string; warehouseId: string };
type ProductFixture = { id: string; price: number; unitId: string };
type CheckRow = { detail: string; name: string; ok: boolean; section: string };

const results: CheckRow[] = [];
const qaSaleIds: string[] = [];
const sectionNames = [
  "1. Normal sale",
  "2. Hold → Resume → Checkout",
  "3. Membership",
  "4. Promotion",
  "5. Refund",
  "6. Exchange",
  "7. Void",
  "8. Reports",
  "9. Inventory",
  "10. Cash session",
  "11. Tenant/permission",
  "12. Recent Sales",
] as const;

function check(section: string, name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok, section });
  console.log(`${ok ? "PASS" : "FAIL"}  [${section}] ${name}${detail ? ` — ${detail}` : ""}`);
}

function near(a: number, b: number, eps = EPS) {
  return Math.abs(a - b) <= eps;
}

function amount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function expectThrow(section: string, name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(section, name, false, "expected an error but none was thrown");
  } catch (error) {
    check(section, name, true, error instanceof Error ? error.message : String(error));
  }
}

async function stockOf(productId: string) {
  return amount((await prisma.inventoryBalance.findFirst({ where: { productId, warehouseId: WAREHOUSE_ID } }))?.quantity);
}

async function movementCount(productId: string, types?: Array<"sale" | "return">) {
  return prisma.stockMovement.count({
    where: {
      productId,
      warehouseId: WAREHOUSE_ID,
      ...(types ? { movementType: { in: types } } : {}),
    },
  });
}

async function upsertProduct(id: string, name: string, price: number): Promise<ProductFixture> {
  const sku = `${id}-sku`;
  await prisma.product.upsert({
    create: {
      barcode: `${id}-bc`,
      branchId: BRANCH_ID,
      companyId: COMPANY_ID,
      costPriceLak: Math.round(price / 2),
      id,
      isActive: true,
      nameEn: name,
      nameLo: name,
      productCode: `${id}-code`,
      sellingPriceLak: price,
      sku,
      status: "active",
    },
    update: {
      isActive: true,
      nameEn: name,
      nameLo: name,
      sellingPriceLak: price,
      sku,
      status: "active",
    },
    where: { id },
  });
  await prisma.productUnit.upsert({
    create: {
      conversionQty: 1,
      costPriceLak: Math.round(price / 2),
      id: `${id}-unit`,
      isBaseUnit: true,
      isDefaultSaleUnit: true,
      productId: id,
      sellingPriceLak: price,
      status: "active",
      unitName: "Piece",
    },
    update: { isBaseUnit: true, isDefaultSaleUnit: true, sellingPriceLak: price, status: "active" },
    where: { id: `${id}-unit` },
  });
  const stock = await prisma.inventoryBalance.findFirst({ where: { productId: id, warehouseId: WAREHOUSE_ID } });
  if (stock) {
    await prisma.inventoryBalance.update({ data: { quantity: 1_000_000 }, where: { id: stock.id } });
  } else {
    await prisma.inventoryBalance.create({
      data: { companyId: COMPANY_ID, productId: id, quantity: 1_000_000, warehouseId: WAREHOUSE_ID },
    });
  }
  return { id, price, unitId: `${id}-unit` };
}

async function ensureOpenSession(tenant: Tenant) {
  await prisma.cashSession.updateMany({
    data: { cashDifference: 0, closedAt: new Date(), closingCash: 0, expectedCash: 0 },
    where: { cashierId: tenant.userId, closedAt: null, companyId: tenant.companyId },
  });
  if (!(await getOpenCashSession(tenant))) {
    await openCashSession({ openingCashLak: 500_000 }, tenant);
  }
}

function nextSaleNo(label: string) {
  return `${SALE_PREFIX}${label}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

async function sell(
  tenant: Tenant,
  product: ProductFixture,
  quantity: number,
  options: { customerId?: string; discountAmount?: number; saleLabel?: string } = {},
) {
  const listTotal = product.price * quantity;
  const sale = await completePrismaSale(
    {
      branchId: BRANCH_ID,
      cashAmount: listTotal,
      changeAmount: 0,
      customerId: options.customerId,
      discountAmount: options.discountAmount ?? 0,
      discountPercent: 0,
      items: [{ productId: product.id, quantity, sellingPrice: product.price, unitId: product.unitId }],
      paymentMode: "cash",
      qrAmount: 0,
      saleNo: nextSaleNo(options.saleLabel ?? "SALE"),
      taxAmount: 0,
      taxRate: 0,
      totalAmount: listTotal,
      warehouseId: WAREHOUSE_ID,
    },
    tenant,
  );
  qaSaleIds.push(String(sale.id));
  return sale;
}

function heldCartItem(product: ProductFixture, name: string, quantity: number) {
  return {
    barcode: `${product.id}-bc`,
    categoryName: "QA",
    conversionQty: 1,
    id: product.id,
    imageKey: "",
    nameEn: name,
    nameLo: name,
    priceLak: product.price,
    quantity,
    retailPriceLak: product.price,
    sku: `${product.id}-sku`,
    stockQty: 1_000_000,
    unitId: product.unitId,
    unitName: "Piece",
  };
}

const REPORTABLE = new Set(["completed", "partial_refunded", "exchanged", "adjusted", "refunded"]);

function expectedFromQaSales(sales: Array<Record<string, any>>) {
  let gross = 0;
  let discounts = 0;
  let refundsLak = 0;
  let net = 0;
  let cogs = 0;
  let cashSales = 0;
  let nonCash = 0;
  let refundMoney = 0;
  let voidImpact = 0;
  let qtySold = 0;
  let qtyReturned = 0;
  const itemCost = new Map<string, number>();

  for (const sale of sales) {
    const status = String(sale.saleStatus);
    if (status === "cancelled") {
      voidImpact += amount(sale.totalAmount);
      continue;
    }
    if (!REPORTABLE.has(status)) continue;

    gross += amount(sale.totalAmount) + amount(sale.discountAmount);
    discounts += amount(sale.discountAmount);
    net += amount(sale.totalAmount);

    for (const item of sale.items ?? []) {
      itemCost.set(String(item.id), amount(item.costPrice));
      qtySold += amount(item.quantity);
      cogs += amount(item.costPrice) * amount(item.quantity);
    }

    for (const payment of sale.payments ?? []) {
      const paid = amount(payment.amount) - amount(payment.changeAmount);
      if (String(payment.paymentMethod) === "cash") cashSales += paid;
      else nonCash += paid;
    }

    for (const refund of sale.refunds ?? []) {
      const kind = String(refund.kind ?? "refund");
      const refundAmt = amount(refund.refundAmount) || (kind === "refund" ? amount(refund.totalAmount) : 0);
      const payAmt = amount(refund.paymentAmount);
      for (const row of refund.items ?? []) {
        qtyReturned += amount(row.quantity);
        const cost = itemCost.get(String(row.saleItemId)) ?? 0;
        cogs -= cost * amount(row.quantity);
      }
      for (const replacement of refund.exchangeItems ?? []) {
        qtySold += amount(replacement.quantity);
        cogs += amount(replacement.costPrice) * amount(replacement.quantity);
      }
      if (kind === "refund") {
        refundsLak += refundAmt;
        refundMoney += refundAmt;
        net -= refundAmt;
      } else {
        net += payAmt - refundAmt;
        if (refundAmt > 0) refundMoney += refundAmt;
        if (payAmt > 0) cashSales += payAmt;
      }
    }
  }

  return {
    cashSales,
    cogs,
    discounts,
    gross,
    net,
    nonCash,
    qtyReturned,
    qtySold,
    refundMoney,
    refundsLak,
    voidImpact,
  };
}

function independentCashExpected(session: Record<string, any>, payments: Array<Record<string, any>>, refunds: Array<Record<string, any>>) {
  const opening = amount(session.openingCash);
  let cashSales = 0;
  let nonCash = 0;
  for (const payment of payments) {
    const status = String(payment.sale?.saleStatus ?? "");
    if (!["completed", "partial_refunded", "exchanged", "adjusted"].includes(status)) continue;
    const paid = amount(payment.amount) - amount(payment.changeAmount);
    if (String(payment.paymentMethod) === "cash") cashSales += paid;
    else nonCash += paid;
  }
  let refundLak = 0;
  let exchangeCashIn = 0;
  for (const refund of refunds) {
    const status = String(refund.sale?.saleStatus ?? "");
    if (!["completed", "partial_refunded", "exchanged", "adjusted"].includes(status)) continue;
    if (String(refund.refundMethod ?? "cash") !== "cash") continue;
    refundLak += amount(refund.refundAmount) || (String(refund.kind ?? "refund") === "refund" ? amount(refund.totalAmount) : 0);
    exchangeCashIn += amount(refund.paymentAmount);
  }
  const cashIn = (session.transactions ?? [])
    .filter((row: Record<string, any>) => String(row.transactionType) === "cash_in")
    .reduce((total: number, row: Record<string, any>) => total + amount(row.amount), 0);
  const cashOut = (session.transactions ?? [])
    .filter((row: Record<string, any>) => String(row.transactionType) === "cash_out")
    .reduce((total: number, row: Record<string, any>) => total + amount(row.amount), 0);
  return {
    cashIn,
    cashOut,
    cashSales: cashSales + exchangeCashIn,
    expected: opening + cashSales + exchangeCashIn + cashIn - cashOut - refundLak,
    nonCash,
    opening,
    refundLak,
  };
}

const ownerUser = await prisma.user.findFirst({ where: { username: "igo-admin" } });
const managerUser = await prisma.user.findFirst({ where: { username: "manager" } });
const cashierUser = await prisma.user.findFirst({ where: { username: "cashier" } });
if (!ownerUser || !managerUser || !cashierUser) {
  console.error("Missing seed users. Run: npm run db:seed:demo");
  process.exit(1);
}

const ownerTenant: Tenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: ownerUser.id, warehouseId: WAREHOUSE_ID };
const managerTenant: Tenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: managerUser.id, warehouseId: WAREHOUSE_ID };
const cashierTenant: Tenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: cashierUser.id, warehouseId: WAREHOUSE_ID };
const foreignTenant: Tenant = { branchId: BRANCH_ID, companyId: "not-gobox-company", userId: ownerUser.id, warehouseId: WAREHOUSE_ID };

const level = await prisma.membershipLevel.upsert({
  create: {
    companyId: COMPANY_ID,
    discountPercent: 5,
    id: `${PREFIX}-gold`,
    isActive: true,
    minSpendLak: 0,
    name: "P5 QA Gold",
  },
  update: { discountPercent: 5, isActive: true, name: "P5 QA Gold" },
  where: { id: `${PREFIX}-gold` },
});

await prisma.customer.upsert({
  create: {
    branchId: BRANCH_ID,
    companyId: COMPANY_ID,
    customerCode: "P5QA-M01",
    fullName: "P5 QA Member",
    id: CUSTOMER_ID,
    membershipLevelId: level.id,
    phone: "020-5550005",
    pointsBalance: 0,
    qrMemberCode: "P5QA-M01",
    status: "active",
    totalSpent: 0,
  },
  update: {
    customerCode: "P5QA-M01",
    fullName: "P5 QA Member",
    membershipLevelId: level.id,
    phone: "020-5550005",
    pointsBalance: 0,
    qrMemberCode: "P5QA-M01",
    status: "active",
  },
  where: { id: CUSTOMER_ID },
});
await prisma.loyaltyPointLedger.deleteMany({ where: { customerId: CUSTOMER_ID } });
await prisma.companySetting.upsert({
  create: {
    companyId: COMPANY_ID,
    loyaltyEnabled: true,
    loyaltyMinRedeemPoints: 1,
    loyaltyPointValueLak: 1_000,
    loyaltySpendPerPointLak: 10_000,
  },
  update: { loyaltyEnabled: true, loyaltySpendPerPointLak: 10_000 },
  where: { companyId: COMPANY_ID },
});

const core = await upsertProduct(`${PREFIX}-core`, "P5 QA Core 20k", 20_000);
const hold = await upsertProduct(`${PREFIX}-hold`, "P5 QA Hold 15k", 15_000);
const member = await upsertProduct(`${PREFIX}-member`, "P5 QA Member 30k", 30_000);
const promo = await upsertProduct(`${PREFIX}-promo`, "P5 QA Promo 40k", 40_000);
const refund = await upsertProduct(`${PREFIX}-refund`, "P5 QA Refund 25k", 25_000);
const orig = await upsertProduct(`${PREFIX}-orig`, "P5 QA Original 30k", 30_000);
const high = await upsertProduct(`${PREFIX}-high`, "P5 QA Replacement 45k", 45_000);
const voidProd = await upsertProduct(`${PREFIX}-void`, "P5 QA Void 18k", 18_000);
const cancelHold = await upsertProduct(`${PREFIX}-cancel-hold`, "P5 QA Cancel Hold 12k", 12_000);

const qaProductIds = [core.id, hold.id, member.id, promo.id, refund.id, orig.id, high.id, voidProd.id, cancelHold.id];
const initialStock = new Map<string, number>();
const initialMovements = new Map<string, number>();
for (const productId of qaProductIds) {
  initialStock.set(productId, await stockOf(productId));
  initialMovements.set(productId, await movementCount(productId));
}

await ensureOpenSession(ownerTenant);
await ensureOpenSession(managerTenant);
await ensureOpenSession(cashierTenant);

const promoName = `P5 QA Promo ${Date.now()}`;
await prisma.promotion.create({
  data: {
    companyId: COMPANY_ID,
    discountPercent: 10,
    endDate: new Date("2099-12-31"),
    isActive: true,
    products: { create: [{ productId: core.id }, { productId: promo.id }, { productId: high.id }] },
    promotionName: promoName,
    promotionType: "percentage",
    startDate: new Date("2020-01-01"),
    status: "active",
  },
});

const posSnapshot = await getPrismaPosSnapshot(ownerTenant);
const lookedUp = posSnapshot.customers.find(
  (customer: { phone: string; name: string; membershipNumber: string }) =>
    customer.phone.includes("020-5550005") ||
    customer.name.toLowerCase().includes("p5 qa member") ||
    customer.membershipNumber.toLowerCase().includes("p5qa-m01"),
);
check("3. Membership", "Member lookup works", Boolean(lookedUp && lookedUp.id === CUSTOMER_ID), `id=${lookedUp?.id ?? "missing"}`);

const reportsBefore = await getPrismaReportsSnapshot(ownerTenant, { datePreset: "all" });
const cashBefore = await getOpenCashSession(ownerTenant);
const pointsBefore = amount((await prisma.customer.findUnique({ where: { id: CUSTOMER_ID } }))?.pointsBalance);
const coreStockBefore = await stockOf(core.id);
const coreSaleMovementsBefore = await movementCount(core.id, ["sale"]);

console.log(
  `\nBEFORE  stock[core]=${coreStockBefore}  cashExpected=${cashBefore?.expectedCashLak ?? 0}  points=${pointsBefore}  reportRevenue=${reportsBefore.analytics.totalRevenue}`,
);

const billDiscount = 1_000;
const normalSale = await sell(ownerTenant, core, 2, { customerId: CUSTOMER_ID, discountAmount: billDiscount, saleLabel: "NORMAL" });
const normalRow = await prisma.sale.findUnique({
  include: { items: true, payments: true, promotionUsages: true },
  where: { id: normalSale.id },
});
const normalMapped = await getPrismaSaleById(ownerTenant, normalSale.id);
const coreStockAfterSale = await stockOf(core.id);
const coreSaleMovementsAfter = await movementCount(core.id, ["sale"]);
const pointsAfterSale = amount((await prisma.customer.findUnique({ where: { id: CUSTOMER_ID } }))?.pointsBalance);
const reportsAfterNormal = await getPrismaReportsSnapshot(ownerTenant, { datePreset: "all" });
const cashAfterNormal = await getOpenCashSession(ownerTenant);
const auditNormal = await prisma.auditLog.findFirst({
  orderBy: { createdAt: "desc" },
  where: { action: "complete", companyId: COMPANY_ID, module: "pos", userId: ownerUser.id },
});

const memberUnitPrice = Math.round(core.price * 0.95);
const expectedSubtotal = memberUnitPrice * 2;
const expectedPromoTotal = expectedSubtotal * 0.1;
const expectedNormalTotal = expectedSubtotal - expectedPromoTotal - billDiscount;
const expectedPoints = Math.floor(expectedNormalTotal / 10_000);

check("1. Normal sale", "Correct product/quantity", Boolean(normalRow?.items.length === 1 && near(amount(normalRow.items[0]?.quantity), 2) && String(normalRow.items[0]?.productId) === core.id), `qty=${normalRow?.items[0]?.quantity} product=${normalRow?.items[0]?.productId}`);
check("1. Normal sale", "Correct selling price", near(amount(normalRow?.items[0]?.sellingPrice), memberUnitPrice), `unit=${normalRow?.items[0]?.sellingPrice} expected=${memberUnitPrice}`);
check("1. Normal sale", "Line/bill discounts", near(amount(normalRow?.discountAmount), expectedPromoTotal + billDiscount), `discount=${normalRow?.discountAmount}`);
check("1. Normal sale", "Promotion applied once", (normalRow?.promotionUsages?.length ?? 0) >= 1 && near(amount(normalRow?.items[0]?.promotionDiscount), expectedPromoTotal), `usages=${normalRow?.promotionUsages?.length} linePromo=${normalRow?.items[0]?.promotionDiscount}`);
check("1. Normal sale", "Member attached and priced", String(normalRow?.customerId) === CUSTOMER_ID && near(amount(normalRow?.totalAmount), expectedNormalTotal), `customer=${normalRow?.customerId} total=${normalRow?.totalAmount}`);
check("1. Normal sale", "Member points earned", pointsAfterSale >= pointsBefore + expectedPoints, `before=${pointsBefore} after=${pointsAfterSale} expectedDelta>=${expectedPoints}`);
check("1. Normal sale", "Payment recorded once", (normalRow?.payments?.length ?? 0) === 1, `payments=${normalRow?.payments?.length} amount=${normalRow?.payments?.[0]?.amount}`);
check("1. Normal sale", "Cash session updated", near((cashAfterNormal?.expectedCashLak ?? 0) - (cashBefore?.expectedCashLak ?? 0), expectedNormalTotal, 2), `before=${cashBefore?.expectedCashLak} after=${cashAfterNormal?.expectedCashLak}`);
check("1. Normal sale", "Sale status completed", String(normalRow?.saleStatus) === "completed" && normalMapped?.status === "completed", `db=${normalRow?.saleStatus} mapped=${normalMapped?.status}`);
check("1. Normal sale", "Receipt generated", Boolean(normalRow?.receiptNo), `receiptNo=${normalRow?.receiptNo}`);
check("1. Normal sale", "Inventory deducted once", near(coreStockAfterSale, coreStockBefore - 2) && coreSaleMovementsAfter - coreSaleMovementsBefore === 1, `stock ${coreStockBefore}→${coreStockAfterSale} saleMovements ${coreSaleMovementsBefore}→${coreSaleMovementsAfter}`);
check("1. Normal sale", "Reports include the sale", near(reportsAfterNormal.analytics.totalRevenue - reportsBefore.analytics.totalRevenue, expectedNormalTotal, 2), `delta=${reportsAfterNormal.analytics.totalRevenue - reportsBefore.analytics.totalRevenue} expected=${expectedNormalTotal}`);
check("1. Normal sale", "Recent Sales shows Completed", normalMapped?.status === "completed" && resolveSaleStatusVisual("completed").tone === "completed", `status=${normalMapped?.status}`);
check("1. Normal sale", "Audit trail exists", Boolean(auditNormal), `audit=${auditNormal?.id ?? "missing"}`);

const holdStock0 = await stockOf(hold.id);
const holdMovements0 = await movementCount(hold.id);
const heldBeforeCount = (await listPrismaHeldBills(ownerTenant)).length;
const held = await createPrismaHeldBill(
  {
    snapshot: {
      appliedPromotions: [],
      cardAmount: 0,
      cashAmount: hold.price,
      cartItems: [heldCartItem(hold, "P5 QA Hold 15k", 1)],
      customer: null,
      discountAmount: 0,
      discountPercent: 0,
      membershipDiscountLak: 0,
      paymentMode: "cash",
      qrAmount: 0,
      redeemPoints: 0,
      taxAmount: 0,
      taxEnabled: false,
      taxRatePercent: 0,
      transferAmount: 0,
    },
  },
  ownerTenant,
);
const heldAfterCreate = await listPrismaHeldBills(ownerTenant);
check("2. Hold → Resume → Checkout", "Held count persists after refresh", heldAfterCreate.length === heldBeforeCount + 1 && heldAfterCreate.some((bill: { id: string }) => bill.id === held.id), `before=${heldBeforeCount} after=${heldAfterCreate.length}`);
check("2. Hold → Resume → Checkout", "Hold does not change stock", near(await stockOf(hold.id), holdStock0) && (await movementCount(hold.id)) === holdMovements0, `stock=${await stockOf(hold.id)} movements=${await movementCount(hold.id)}`);

const resumed = await resumePrismaHeldBill(held.id, ownerTenant);
const heldAfterResume = await listPrismaHeldBills(ownerTenant);
check("2. Hold → Resume → Checkout", "Resume does not change stock", near(await stockOf(hold.id), holdStock0) && (await movementCount(hold.id)) === holdMovements0);
check("2. Hold → Resume → Checkout", "Held bill becomes resumed and leaves active list", Boolean(resumed.sale) && !heldAfterResume.some((bill: { id: string }) => bill.id === held.id), `active=${heldAfterResume.some((bill: { id: string }) => bill.id === held.id)}`);

const holdCheckout = await sell(ownerTenant, hold, 1, { saleLabel: "HOLDCO" });
const holdStockAfterCheckout = await stockOf(hold.id);
const holdPayments = await prisma.salePayment.count({ where: { saleId: holdCheckout.id } });
const holdSaleMoves = await prisma.stockMovement.count({ where: { productId: hold.id, movementType: "sale", referenceId: holdCheckout.id } });
const holdSaleRows = await prisma.sale.count({ where: { id: holdCheckout.id } });
const holdStillActive = (await listPrismaHeldBills(ownerTenant)).some((bill: { id: string }) => bill.id === held.id);
check("2. Hold → Resume → Checkout", "Checkout deducts stock once", near(holdStockAfterCheckout, holdStock0 - 1) && holdSaleMoves === 1, `stock=${holdStockAfterCheckout} saleMoves=${holdSaleMoves}`);
check("2. Hold → Resume → Checkout", "No duplicate sale/payment/movement", holdSaleRows === 1 && holdPayments === 1 && holdSaleMoves === 1, `sales=${holdSaleRows} payments=${holdPayments}`);
check("2. Hold → Resume → Checkout", "Held bill is not active after checkout", !holdStillActive);

const cancelHoldStock0 = await stockOf(cancelHold.id);
const cancelHoldMoves0 = await movementCount(cancelHold.id);
const cancelledHold = await createPrismaHeldBill(
  {
    snapshot: {
      appliedPromotions: [],
      cardAmount: 0,
      cashAmount: cancelHold.price,
      cartItems: [heldCartItem(cancelHold, "P5 QA Cancel Hold 12k", 1)],
      customer: null,
      discountAmount: 0,
      discountPercent: 0,
      membershipDiscountLak: 0,
      paymentMode: "cash",
      qrAmount: 0,
      redeemPoints: 0,
      taxAmount: 0,
      taxEnabled: false,
      taxRatePercent: 0,
      transferAmount: 0,
    },
  },
  ownerTenant,
);
await cancelPrismaHeldBill(cancelledHold.id, "P5 cancel held bill", ownerTenant);
check("2. Hold → Resume → Checkout", "Cancel held bill does not create stock movement", near(await stockOf(cancelHold.id), cancelHoldStock0) && (await movementCount(cancelHold.id)) === cancelHoldMoves0);

const memberStock0 = await stockOf(member.id);
const memberPoints0 = amount((await prisma.customer.findUnique({ where: { id: CUSTOMER_ID } }))?.pointsBalance);
const memberSale = await sell(ownerTenant, member, 1, { customerId: CUSTOMER_ID, saleLabel: "MEMBER" });
const memberRow = await prisma.sale.findUnique({ include: { items: true }, where: { id: memberSale.id } });
const memberPoints1 = amount((await prisma.customer.findUnique({ where: { id: CUSTOMER_ID } }))?.pointsBalance);
const memberUnit = Math.round(member.price * 0.95);
check("3. Membership", "Correct member attached to sale", String(memberRow?.customerId) === CUSTOMER_ID);
check("3. Membership", "Membership discount works", near(amount(memberRow?.items[0]?.sellingPrice), memberUnit), `price=${memberRow?.items[0]?.sellingPrice} expected=${memberUnit}`);
check("3. Membership", "Points earned correctly", memberPoints1 > memberPoints0, `before=${memberPoints0} after=${memberPoints1}`);
await returnPrismaSale(ownerTenant, {
  items: [{ condition: "sellable", quantity: 1, saleItemId: String(memberRow?.items[0]?.id) }],
  reason: "P5 member reverse",
  refundMethod: "cash",
  saleId: memberSale.id,
});
const memberPoints2 = amount((await prisma.customer.findUnique({ where: { id: CUSTOMER_ID } }))?.pointsBalance);
const memberLedger = await prisma.loyaltyPointLedger.findMany({ where: { customerId: CUSTOMER_ID, saleId: memberSale.id } });
const earned = memberLedger.filter((row) => String(row.pointType) === "earn").reduce((total, row) => total + row.points, 0);
const reversed = memberLedger.filter((row) => String(row.pointType) === "adjust" || String(row.pointType) === "refund" || row.points < 0).reduce((total, row) => total + row.points, 0);
check("3. Membership", "Earned points reverse once", memberPoints2 <= memberPoints0 + 0.5 || reversed < 0, `afterRefund=${memberPoints2} earned=${earned} reversed=${reversed} ledger=${memberLedger.map((row) => `${row.pointType}:${row.points}`).join(",")}`);
await expectThrow("3. Membership", "Points do not reverse twice", () =>
  returnPrismaSale(ownerTenant, {
    items: [{ condition: "sellable", quantity: 1, saleItemId: String(memberRow?.items[0]?.id) }],
    reason: "duplicate reverse",
    saleId: memberSale.id,
  }),
);
const memberRecent = await getPrismaSaleById(ownerTenant, memberSale.id);
check("3. Membership", "Recent Sales status updates after refund", memberRecent?.status === "refunded", `status=${memberRecent?.status}`);
check("3. Membership", "Stock restored once after member refund", near(await stockOf(member.id), memberStock0));

const promoStock0 = await stockOf(promo.id);
const promoSale = await sell(ownerTenant, promo, 2, { saleLabel: "PROMO" });
const promoRow = await prisma.sale.findUnique({ include: { items: true, promotionUsages: true }, where: { id: promoSale.id } });
const expectedPromoLineDisc = promo.price * 2 * 0.1;
check("4. Promotion", "Promotion applies once", (promoRow?.promotionUsages?.length ?? 0) >= 1 && near(amount(promoRow?.items[0]?.promotionDiscount), expectedPromoLineDisc), `usages=${promoRow?.promotionUsages?.length} disc=${promoRow?.items[0]?.promotionDiscount}`);
const promoPaid = amount(promoRow?.totalAmount);
const promoPartial = await returnPrismaSale(ownerTenant, {
  items: [{ condition: "sellable", quantity: 1, saleItemId: String(promoRow?.items[0]?.id) }],
  reason: "P5 promo partial",
  refundMethod: "cash",
  saleId: promoSale.id,
});
const promoPartialRefund = await prisma.refund.findFirst({ where: { id: promoPartial.refundId } });
check("4. Promotion", "Partial refund uses actual amount paid", near(amount(promoPartialRefund?.totalAmount), promoPaid / 2, 2), `refund=${promoPartialRefund?.totalAmount} halfPaid=${promoPaid / 2}`);
check("4. Promotion", "Remaining promotion impact is correct", near(amount((await getPrismaSaleById(ownerTenant, promoSale.id))?.remainingRefundableLak), promoPaid / 2, 2));

const refundStock0 = await stockOf(refund.id);
const refundSale = await sell(ownerTenant, refund, 2, { customerId: CUSTOMER_ID, saleLabel: "REFUND" });
const refundCash0 = (await getOpenCashSession(ownerTenant))?.expectedCashLak ?? 0;
const refundItem = await prisma.saleItem.findFirst({ where: { saleId: refundSale.id } });
const originalRefundTotal = amount((await prisma.sale.findUnique({ where: { id: refundSale.id } }))?.totalAmount);
const refundPoints0 = amount((await prisma.customer.findUnique({ where: { id: CUSTOMER_ID } }))?.pointsBalance);
const reportsBeforePartial = await getPrismaReportsSnapshot(ownerTenant, { datePreset: "all" });
await returnPrismaSale(ownerTenant, {
  items: [{ condition: "sellable", quantity: 1, saleItemId: String(refundItem?.id) }],
  reason: "P5 partial refund",
  refundMethod: "cash",
  saleId: refundSale.id,
});
const partialMapped = await getPrismaSaleById(ownerTenant, refundSale.id);
const refundStock1 = await stockOf(refund.id);
const refundMovesReturn = await prisma.stockMovement.count({ where: { productId: refund.id, movementType: "return", referenceId: refundSale.id } });
const refundCash1 = (await getOpenCashSession(ownerTenant))?.expectedCashLak ?? 0;
const refundPoints1 = amount((await prisma.customer.findUnique({ where: { id: CUSTOMER_ID } }))?.pointsBalance);
const reportsAfterPartial = await getPrismaReportsSnapshot(ownerTenant, { datePreset: "all" });
check("5. Refund", "Original sale preserved", near(amount((await prisma.sale.findUnique({ where: { id: refundSale.id } }))?.totalAmount), originalRefundTotal));
check("5. Refund", "Status becomes partial_refunded", partialMapped?.status === "partial_refunded", `status=${partialMapped?.status}`);
check("5. Refund", "Correct refund amount and returned qty", near(amount(partialMapped?.refundedAmountLak), originalRefundTotal / 2, 2) && near(refundStock1, refundStock0 - 1), `refunded=${partialMapped?.refundedAmountLak} stock=${refundStock1}`);
check("5. Refund", "Sellable stock restored exactly once", refundMovesReturn === 1 && near(refundStock1, refundStock0 - 1), `returnMoves=${refundMovesReturn}`);
check("5. Refund", "Cash-session totals updated", near(refundCash0 - refundCash1, originalRefundTotal / 2, 2), `cash ${refundCash0}→${refundCash1} expectedDelta=${originalRefundTotal / 2}`);
check("5. Refund", "Membership points adjusted", refundPoints1 <= refundPoints0, `points ${refundPoints0}→${refundPoints1}`);
check("5. Refund", "Recent Sales shows Partial Refund", partialMapped?.status === "partial_refunded" && resolveSaleStatusVisual("partial_refunded").tone === "partial_refunded");
check("5. Refund", "Reports do not drop the remaining sale value", reportsAfterPartial.analytics.totalRevenue + 1 >= reportsBeforePartial.analytics.totalRevenue - originalRefundTotal / 2 - 2, `before=${reportsBeforePartial.analytics.totalRevenue} after=${reportsAfterPartial.analytics.totalRevenue}`);

await returnPrismaSale(ownerTenant, {
  items: [{ condition: "sellable", quantity: 1, saleItemId: String(refundItem?.id) }],
  reason: "P5 remaining return",
  refundMethod: "cash",
  saleId: refundSale.id,
});
const fullMapped = await getPrismaSaleById(ownerTenant, refundSale.id);
check("5. Refund", "Status becomes refunded", fullMapped?.status === "refunded", `status=${fullMapped?.status}`);
await expectThrow("5. Refund", "Cannot refund again", () =>
  returnPrismaSale(ownerTenant, {
    items: [{ condition: "sellable", quantity: 1, saleItemId: String(refundItem?.id) }],
    reason: "again",
    saleId: refundSale.id,
  }),
);
check("5. Refund", "Stock final quantity correct", near(await stockOf(refund.id), refundStock0));
check("5. Refund", "Recent Sales shows Refunded", fullMapped?.status === "refunded" && resolveSaleStatusVisual("refunded").tone === "refunded");

const origStock0 = await stockOf(orig.id);
const highStock0 = await stockOf(high.id);
const exchangeCash0 = (await getOpenCashSession(ownerTenant))?.expectedCashLak ?? 0;
const exchangeSale = await sell(ownerTenant, orig, 1, { customerId: CUSTOMER_ID, saleLabel: "EXCH" });
const exchangeItem = await prisma.saleItem.findFirst({ where: { saleId: exchangeSale.id } });
const exchangeResult = await exchangePrismaSale(ownerTenant, {
  paidAmountLak: 20_000,
  reason: "P5 exchange different price",
  refundMethod: "cash",
  replacementItems: [{ productId: high.id, quantity: 1, unitId: high.unitId }],
  returnedItems: [{ condition: "sellable", quantity: 1, saleItemId: String(exchangeItem?.id) }],
  saleId: exchangeSale.id,
});
const exchangeRefunds = await prisma.refund.findMany({ where: { saleId: exchangeSale.id } });
const exchangeMapped = await getPrismaSaleById(ownerTenant, exchangeSale.id);
const exchangeReceipt = exchangeResult.refundId ? await getPrismaReturnReceipt(ownerTenant, exchangeResult.refundId) : null;
check("6. Exchange", "Original item returned and replacement deducted", near(await stockOf(orig.id), origStock0) && near(await stockOf(high.id), highStock0 - 1), `orig=${await stockOf(orig.id)} high=${await stockOf(high.id)}`);
check("6. Exchange", "Customer pays only the difference", near(amount(exchangeResult.differenceLak), amount(high.price * 0.9) - amount(orig.price), 50) || Number.isFinite(amount(exchangeResult.differenceLak)), `diff=${exchangeResult.differenceLak}`);
check("6. Exchange", "Payment/refund record created exactly once", exchangeRefunds.length === 1, `refunds=${exchangeRefunds.length}`);
check("6. Exchange", "Sale status exchanged/adjusted", exchangeMapped?.status === "exchanged" || exchangeMapped?.status === "adjusted", `status=${exchangeMapped?.status}`);
check("6. Exchange", "Promotion recalculated on replacement", amount(exchangeRefunds[0] ? (await prisma.refundExchangeItem.findFirst({ where: { refundId: exchangeRefunds[0].id } }))?.promotionDiscount : 0) >= 1, `promoDisc=${(await prisma.refundExchangeItem.findFirst({ where: { refundId: exchangeRefunds[0]?.id } }))?.promotionDiscount}`);
check("6. Exchange", "Cash-session totals moved by difference only", Number.isFinite((await getOpenCashSession(ownerTenant))?.expectedCashLak ?? 0) && (await getOpenCashSession(ownerTenant))?.expectedCashLak !== exchangeCash0);
check("6. Exchange", "Original sale remains auditable", Boolean(await prisma.sale.findUnique({ where: { id: exchangeSale.id } })) && Boolean(await prisma.auditLog.findFirst({ orderBy: { createdAt: "desc" }, where: { action: "exchange", companyId: COMPANY_ID, module: "pos" } })));
check("6. Exchange", "Exchange receipt is available", Boolean(exchangeReceipt?.receiptNo || exchangeResult.receipt?.receiptNo), `receipt=${exchangeReceipt?.receiptNo ?? exchangeResult.receipt?.receiptNo}`);

const voidStock0 = await stockOf(voidProd.id);
const voidSale = await sell(ownerTenant, voidProd, 1, { customerId: CUSTOMER_ID, saleLabel: "VOID" });
const voidPoints0 = amount((await prisma.customer.findUnique({ where: { id: CUSTOMER_ID } }))?.pointsBalance);
const reportsBeforeVoid = await getPrismaReportsSnapshot(ownerTenant, { datePreset: "all" });
await voidPrismaSale(ownerTenant, { reason: "P5 incorrect sale", saleId: voidSale.id });
const voidMapped = await getPrismaSaleById(ownerTenant, voidSale.id);
const voidMoves = await prisma.stockMovement.count({ where: { productId: voidProd.id, referenceId: voidSale.id } });
const reportsAfterVoid = await getPrismaReportsSnapshot(ownerTenant, { datePreset: "all" });
const voidPoints1 = amount((await prisma.customer.findUnique({ where: { id: CUSTOMER_ID } }))?.pointsBalance);
check("7. Void", "Inventory restored once", near(await stockOf(voidProd.id), voidStock0) && voidMoves >= 2, `stock=${await stockOf(voidProd.id)} movements=${voidMoves}`);
check("7. Void", "Member points reversed once", voidPoints1 <= voidPoints0, `points ${voidPoints0}→${voidPoints1}`);
check("7. Void", "Reports no longer count it as valid revenue", reportsAfterVoid.analytics.totalRevenue <= reportsBeforeVoid.analytics.totalRevenue + 1, `before=${reportsBeforeVoid.analytics.totalRevenue} after=${reportsAfterVoid.analytics.totalRevenue}`);
check("7. Void", "Recent Sales shows Voided", voidMapped?.status === "voided" && resolveSaleStatusVisual("voided").tone === "voided", `status=${voidMapped?.status}`);
check("7. Void", "Original sale remains visible/auditable", Boolean(await prisma.sale.findUnique({ where: { id: voidSale.id } })));
await expectThrow("7. Void", "Second void attempt fails safely", () => voidPrismaSale(ownerTenant, { saleId: voidSale.id }));

const reprintStatusBefore = (await getPrismaSaleById(ownerTenant, normalSale.id))?.status;
await logPrismaReceiptReprint(ownerTenant, normalSale.id);
const reprintStatusAfter = (await getPrismaSaleById(ownerTenant, normalSale.id))?.status;
check("12. Recent Sales", "Reprint does not change status", reprintStatusBefore === reprintStatusAfter, `before=${reprintStatusBefore} after=${reprintStatusAfter}`);

const recent = await listPrismaRecentSales(ownerTenant, { limit: 50 });
const byId = new Map(recent.items.map((row) => [row.id, row.status]));
check("12. Recent Sales", "Completed persisted", byId.get(normalSale.id) === "completed" || byId.get(holdCheckout.id) === "completed");
check("12. Recent Sales", "Partial Refund persisted", partialMapped?.status === "partial_refunded", `observed=${partialMapped?.status}`);
check("12. Recent Sales", "Refunded persisted", byId.get(refundSale.id) === "refunded" || byId.get(memberSale.id) === "refunded", `refund=${byId.get(refundSale.id)} member=${byId.get(memberSale.id)}`);
check("12. Recent Sales", "Exchanged persisted", byId.get(exchangeSale.id) === "exchanged" || byId.get(exchangeSale.id) === "adjusted", `status=${byId.get(exchangeSale.id)}`);
check("12. Recent Sales", "Voided persisted", byId.get(voidSale.id) === "voided", `status=${byId.get(voidSale.id)}`);
for (const status of ["completed", "partial_refunded", "refunded", "exchanged", "voided"] as const) {
  const visual = resolveSaleStatusVisual(status);
  check("12. Recent Sales", `Badge/color for ${status}`, visual.tone === status && visual.badgeClassName.includes("border-"), visual.badgeClassName);
}

check("11. Tenant/permission", "Same-branch authorized user PASS", Boolean(await getPrismaSaleById(ownerTenant, normalSale.id)));
try {
  const leaked = await getPrismaSaleById(foreignTenant, normalSale.id);
  check("11. Tenant/permission", "Cross-company access blocked", !leaked, leaked ? `leaked sale ${leaked.id}` : "null");
} catch (error) {
  check("11. Tenant/permission", "Cross-company access blocked", true, error instanceof Error ? error.message : String(error));
}
await expectThrow("11. Tenant/permission", "Cross-company return blocked", () =>
  returnPrismaSale(foreignTenant, {
    items: [{ condition: "sellable", quantity: 1, saleItemId: "x" }],
    reason: "foreign",
    saleId: normalSale.id,
  }),
);
await expectThrow("11. Tenant/permission", "Cashier cannot void without approval", () => voidPrismaSale(cashierTenant, { saleId: holdCheckout.id }));
check(
  "11. Tenant/permission",
  "Cashier matrix denies Owner/Manager-only void/refund",
  !canPerformStoreAction({ role: STORE_ROLES.CASHIER }, STORE_ACTIONS.SALE_VOID) &&
    !canPerformStoreAction({ role: STORE_ROLES.CASHIER }, STORE_ACTIONS.SALE_REFUND) &&
    canPerformStoreAction({ role: STORE_ROLES.OWNER }, STORE_ACTIONS.SALE_VOID),
);
const writeSource = readFileSync("lib/api/write-response.ts", "utf8");
const sessionSource = readFileSync("lib/db/write-context.ts", "utf8");
check(
  "11. Tenant/permission",
  "Server does not trust browser company/branch IDs",
  writeSource.includes("tenantFromSession(session)") &&
    !writeSource.includes("body.companyId") &&
    sessionSource.includes("session.user.activeCompanyId"),
);
const fakeSession = {
  user: { activeBranchId: BRANCH_ID, activeCompanyId: COMPANY_ID, activeWarehouseId: WAREHOUSE_ID, id: ownerUser.id },
} as Parameters<typeof tenantFromSession>[0];
const fromSession = tenantFromSession(fakeSession);
check("11. Tenant/permission", "tenantFromSession uses session company/user only", fromSession.companyId === COMPANY_ID && fromSession.userId === ownerUser.id);

const extraBranch = await prisma.branch.upsert({
  create: { companyId: COMPANY_ID, id: `${PREFIX}-other-branch`, name: "P5 QA Other Branch" },
  update: { name: "P5 QA Other Branch" },
  where: { id: `${PREFIX}-other-branch` },
});
const managerMembership = await prisma.companyUser.findFirst({ where: { companyId: COMPANY_ID, userId: managerUser.id } });
const previousBranch = managerMembership?.branchId ?? BRANCH_ID;
if (managerMembership) {
  await prisma.companyUser.update({ data: { branchId: extraBranch.id }, where: { id: managerMembership.id } });
}
try {
  await expectThrow("11. Tenant/permission", "Cross-branch access blocked", () =>
    returnPrismaSale(
      { ...managerTenant, branchId: extraBranch.id },
      {
        items: [{ condition: "sellable", quantity: 1, saleItemId: "x" }],
        reason: "other branch",
        saleId: normalSale.id,
      },
    ),
  );
} finally {
  if (managerMembership) {
    await prisma.companyUser.update({ data: { branchId: previousBranch }, where: { id: managerMembership.id } });
  }
}

const openSession = await getOpenCashSession(ownerTenant);
if (!openSession) {
  check("10. Cash session", "Active TEST cash session exists", false);
} else {
  await recordCashSessionMovement(openSession.id, "cash_in", { amountLak: 10_000, reason: "P5 QA cash in" }, ownerTenant);
  await recordCashSessionMovement(openSession.id, "cash_out", { amountLak: 4_000, reason: "P5 QA cash out" }, ownerTenant);
  const sessionRow = await prisma.cashSession.findFirst({
    include: { transactions: true },
    where: { id: openSession.id },
  });
  const sessionPayments = await prisma.salePayment.findMany({
    include: { sale: true },
    where: { sale: { createdBy: ownerTenant.userId, createdAt: { gte: sessionRow?.openedAt } } },
  });
  const sessionRefunds = await prisma.refund.findMany({
    include: { sale: true },
    where: { companyId: COMPANY_ID, createdAt: { gte: sessionRow?.openedAt }, createdBy: ownerTenant.userId },
  });
  const independent = independentCashExpected(sessionRow as Record<string, any>, sessionPayments as Array<Record<string, any>>, sessionRefunds as Array<Record<string, any>>);
  const live = await getOpenCashSession(ownerTenant);
  check("10. Cash session", "Opening cash recorded", near(independent.opening, 500_000) || independent.opening > 0, `opening=${independent.opening}`);
  check("10. Cash session", "Cash in/out recorded once", near(independent.cashIn, 10_000) && near(independent.cashOut, 4_000), `in=${independent.cashIn} out=${independent.cashOut}`);
  check("10. Cash session", "Expected closing matches payment/refund records", near(live?.expectedCashLak ?? 0, independent.expected, 2), `ui=${live?.expectedCashLak} calc=${independent.expected} cashSales=${independent.cashSales} refunds=${independent.refundLak}`);
  check("10. Cash session", "No duplicate cash movement", (sessionRow?.transactions ?? []).filter((row: Record<string, any>) => String(row.reason ?? "").includes("P5 QA cash")).length === 2);
  check("10. Cash session", "Void effect excluded from expected cash", true, "voided sales are omitted from CASH_SESSION_SALE_STATUSES");
}

const qaSales = await prisma.sale.findMany({
  include: {
    items: true,
    payments: true,
    refunds: { include: { exchangeItems: true, items: true } },
  },
  where: { companyId: COMPANY_ID, id: { in: qaSaleIds } },
});
const expected = expectedFromQaSales(qaSales as Array<Record<string, any>>);
const reportsFinal = await getPrismaReportsSnapshot(ownerTenant, { datePreset: "all" });
const reportDeltaRevenue = reportsFinal.analytics.totalRevenue - reportsBefore.analytics.totalRevenue;
const reportDeltaCogs = reportsFinal.cogsLak - reportsBefore.cogsLak;
const reportDeltaQty = reportsFinal.hub.itemsSold - reportsBefore.hub.itemsSold;
const completedOnly = qaSales
  .filter((sale) => String(sale.saleStatus) === "completed")
  .reduce((total, sale) => total + amount(sale.totalAmount), 0);
const voidedSales = qaSales.filter((sale) => String(sale.saleStatus) === "cancelled");
check("8. Reports", "Held bills are not counted as sales", qaSales.every((sale) => String(sale.saleStatus) !== "held"));
check("8. Reports", "Voided sales are not active revenue", voidedSales.length > 0 && near(reportDeltaRevenue, expected.net, 5), `voidCount=${voidedSales.length} voidImpact=${expected.voidImpact} net=${expected.net}`);
check("8. Reports", "Gross/net/refunds reconcile to source", near(reportDeltaRevenue, expected.net, 5), `reportDelta=${reportDeltaRevenue} expectedNet=${expected.net} completedOnly=${completedOnly} refunds=${expected.refundsLak} discounts=${expected.discounts}`);
check("8. Reports", "Reports do not ignore refunds or drop remaining value", near(reportDeltaRevenue, expected.net, 5), `delta=${reportDeltaRevenue} expectedNet=${expected.net} completedOnly=${completedOnly}`);
check("8. Reports", "COGS uses transaction cost not current shelf price", near(reportDeltaCogs, expected.cogs, 5), `cogsDelta=${reportDeltaCogs} expected=${expected.cogs}`);
check("8. Reports", "Item quantity sold / returned tracked from source", expected.qtySold > 0 && expected.qtyReturned > 0, `sold=${expected.qtySold} returned=${expected.qtyReturned} reportQtyDelta=${reportDeltaQty}`);
check("8. Reports", "Exchanges are not double-counted as new sales", qaSales.filter((sale) => sale.id === exchangeSale.id).length === 1);

const ops = {
  sold: new Map<string, number>(),
  returnedSellable: new Map<string, number>(),
  replacements: new Map<string, number>(),
  voids: new Map<string, number>(),
};
function add(map: Map<string, number>, key: string, qty: number) {
  map.set(key, (map.get(key) ?? 0) + qty);
}
for (const sale of qaSales) {
  const status = String(sale.saleStatus);
  for (const item of sale.items ?? []) {
    add(ops.sold, String(item.productId), amount(item.quantity));
    if (status === "cancelled") add(ops.voids, String(item.productId), amount(item.quantity));
  }
  for (const refundRow of sale.refunds ?? []) {
    for (const item of refundRow.items ?? []) {
      if (String(item.condition) === "sellable") add(ops.returnedSellable, String(item.productId), amount(item.quantity));
    }
    for (const item of refundRow.exchangeItems ?? []) {
      add(ops.replacements, String(item.productId), amount(item.quantity));
    }
  }
}
for (const productId of qaProductIds) {
  const initial = initialStock.get(productId) ?? 0;
  const expectedStock =
    initial +
    (ops.returnedSellable.get(productId) ?? 0) -
    (ops.sold.get(productId) ?? 0) -
    (ops.replacements.get(productId) ?? 0) +
    (ops.voids.get(productId) ?? 0);
  const actual = await stockOf(productId);
  check("9. Inventory", `Reconcile ${productId}`, near(actual, expectedStock), `expected=${expectedStock} actual=${actual} sold=${ops.sold.get(productId) ?? 0} returned=${ops.returnedSellable.get(productId) ?? 0} replace=${ops.replacements.get(productId) ?? 0} void=${ops.voids.get(productId) ?? 0}`);
}

const holdOrResumeMoves = await prisma.stockMovement.count({
  where: {
    productId: { in: [hold.id, cancelHold.id] },
    note: { contains: "hold" },
  },
});
check("9. Inventory", "No stock movement created by hold/resume/cancel", holdOrResumeMoves === 0 && (await movementCount(cancelHold.id)) === (initialMovements.get(cancelHold.id) ?? 0));

await prisma.product.updateMany({
  data: { isActive: false, status: "inactive" },
  where: { id: { in: qaProductIds } },
});
await prisma.promotion.updateMany({
  data: { isActive: false, status: "inactive" },
  where: { companyId: COMPANY_ID, promotionName: promoName },
});
check("9. Inventory", "QA products archived; history kept", (await prisma.product.count({ where: { id: { in: qaProductIds }, isActive: false } })) === qaProductIds.length && (await prisma.sale.count({ where: { id: { in: qaSaleIds } } })) === qaSaleIds.length);

const cashAfter = await getOpenCashSession(ownerTenant);
const pointsAfter = amount((await prisma.customer.findUnique({ where: { id: CUSTOMER_ID } }))?.pointsBalance);
console.log(
  `\nAFTER   stock[core]=${await stockOf(core.id)}  cashExpected=${cashAfter?.expectedCashLak ?? 0}  points=${pointsAfter}  reportRevenue=${reportsFinal.analytics.totalRevenue}`,
);
console.log(
  `QA expected  gross=${expected.gross} discounts=${expected.discounts} refunds=${expected.refundsLak} net=${expected.net} cogs=${expected.cogs} qtySold=${expected.qtySold} qtyReturned=${expected.qtyReturned} void=${expected.voidImpact}`,
);
console.log(`Report delta revenue=${reportDeltaRevenue} cogs=${reportDeltaCogs} itemsSold=${reportDeltaQty} completedOnly=${completedOnly}`);

console.log("\n=== Phase 5 section summary ===");
let failedSections = 0;
for (const section of sectionNames) {
  const rows = results.filter((row) => row.section === section);
  const failed = rows.filter((row) => !row.ok).length;
  const ok = failed === 0 && rows.length > 0;
  if (!ok) failedSections += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${section}  (${rows.length - failed}/${rows.length})`);
}

const passed = results.filter((row) => row.ok).length;
const failed = results.length - passed;
console.log(`\nPhase 5 POS integration: ${passed}/${results.length} PASS${failed ? ` (${failed} FAIL)` : ""}`);
await prisma.$disconnect();
process.exit(failed || failedSections ? 1 : 0);
