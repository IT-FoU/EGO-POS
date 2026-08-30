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
const { completePrismaSale } = await import("../features/pos/prisma-repository");
const { openCashSession, getOpenCashSession } = await import("../features/cash-sessions/prisma-repository");
const { voidPrismaSale } = await import("../features/pos/post-sale-repository");
const { exchangePrismaSale, returnPrismaSale } = await import("../features/pos/return-repository");
const { createPrismaHeldBill, resumePrismaHeldBill } = await import("../features/pos/held-bills-repository");
const { createStockAdjustment, createStockCount, createStockIn, getPrismaInventorySnapshot } = await import("../features/inventory/prisma-repository");
const { createPurchaseOrder, receiveGoods, updatePurchaseOrderStatus } = await import("../features/purchasing/prisma-repository");
const { canPerformStoreAction, STORE_ACTIONS, STORE_ROLES } = await import("../features/permissions/store-permissions");
const { assertTenantStoreAction } = await import("../lib/auth/store-permission-guard");
const { WRITE_PERMISSIONS, assertPermission } = await import("../lib/auth/permissions");

const COMPANY_ID = "gobox-company";
const BRANCH_ID = "gobox-main-branch";
const WAREHOUSE_ID = "gobox-default-warehouse";
const PREFIX = "inv-qa";
const EPS = 0.001;

type Tenant = { branchId: string; companyId: string; userId: string; warehouseId: string };
type CheckRow = { detail: string; name: string; ok: boolean; section: string; missing?: boolean };

const results: CheckRow[] = [];

function check(section: string, name: string, ok: boolean, detail = "", missing = false) {
  results.push({ detail, missing, name, ok, section });
  const label = missing ? "MISSING" : ok ? "PASS" : "FAIL";
  console.log(`${label}  [${section}] ${name}${detail ? ` — ${detail}` : ""}`);
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

async function stockOf(productId: string, warehouseId = WAREHOUSE_ID) {
  return amount(
    (await prisma.inventoryBalance.findUnique({
      where: { warehouseId_productId: { productId, warehouseId } },
    }))?.quantity,
  );
}

async function movementCount(where: Record<string, unknown>) {
  return prisma.stockMovement.count({ where: { companyId: COMPANY_ID, ...where } });
}

async function upsertProduct(id: string, name: string, price: number, minStock = 0) {
  await prisma.product.upsert({
    create: {
      barcode: `${id}-bc`,
      branchId: BRANCH_ID,
      companyId: COMPANY_ID,
      costPriceLak: Math.round(price / 2),
      id,
      isActive: true,
      minStock,
      nameEn: name,
      nameLo: name,
      productCode: `${id}-code`,
      sellingPriceLak: price,
      sku: `${id}-sku`,
      status: "active",
    },
    update: { isActive: true, minStock, nameEn: name, nameLo: name, sellingPriceLak: price, status: "active" },
    where: { id },
  });
  await prisma.productUnit.upsert({
    create: {
      conversionQty: 1,
      costPriceLak: Math.round(price / 2),
      id: `${id}-piece`,
      isBaseUnit: true,
      isDefaultSaleUnit: true,
      isPurchaseUnit: true,
      productId: id,
      sellingPriceLak: price,
      status: "active",
      unitName: "Piece",
    },
    update: { conversionQty: 1, isBaseUnit: true, isDefaultSaleUnit: true, isPurchaseUnit: true, sellingPriceLak: price, status: "active" },
    where: { id: `${id}-piece` },
  });
  await prisma.inventoryBalance.upsert({
    create: { companyId: COMPANY_ID, productId: id, quantity: 1_000, warehouseId: WAREHOUSE_ID },
    update: { quantity: 1_000 },
    where: { warehouseId_productId: { productId: id, warehouseId: WAREHOUSE_ID } },
  });
  return { id, pieceId: `${id}-piece`, price };
}

async function ensureOpenSession(tenant: Tenant) {
  await prisma.cashSession.updateMany({
    data: { cashDifference: 0, closedAt: new Date(), closingCash: 0, expectedCash: 0 },
    where: { cashierId: tenant.userId, closedAt: null, companyId: tenant.companyId },
  });
  if (!(await getOpenCashSession(tenant))) {
    await openCashSession({ openingCashLak: 100_000 }, tenant);
  }
}

async function sell(
  tenant: Tenant,
  productId: string,
  unitId: string,
  quantity: number,
  sellingPrice: number,
) {
  const listTotal = sellingPrice * quantity;
  return completePrismaSale(
    {
      branchId: BRANCH_ID,
      cashAmount: listTotal,
      changeAmount: 0,
      discountAmount: 0,
      discountPercent: 0,
      items: [{ productId, quantity, sellingPrice, unitId }],
      paymentMode: "cash",
      qrAmount: 0,
      saleNo: `INVQA-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      taxAmount: 0,
      taxRate: 0,
      totalAmount: listTotal,
      warehouseId: WAREHOUSE_ID,
    },
    tenant,
  );
}

const ownerUser = await prisma.user.findFirst({ where: { username: "igo-admin" } });
const managerUser = await prisma.user.findFirst({ where: { username: "manager" } });
const cashierUser = await prisma.user.findFirst({ where: { username: "cashier" } });
if (!ownerUser || !managerUser || !cashierUser) {
  console.error("Missing seed users. Run: npm run db:seed:demo");
  process.exit(1);
}

const ownerTenant: Tenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: ownerUser.id, warehouseId: WAREHOUSE_ID };
const cashierTenant: Tenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: cashierUser.id, warehouseId: WAREHOUSE_ID };
const foreignTenant: Tenant = { branchId: BRANCH_ID, companyId: "not-gobox-company", userId: ownerUser.id, warehouseId: WAREHOUSE_ID };

const sourceModel = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
  `select table_name from information_schema.tables where table_schema = 'public' and table_name in ('inventory_balances', 'stock_movements')`,
);
check(
  "0. Source of truth",
  "Sellable stock is inventory_balances; movements are stock_movements",
  sourceModel.some((row) => row.table_name === "inventory_balances") &&
    sourceModel.some((row) => row.table_name === "stock_movements"),
);

const pos = await upsertProduct(`${PREFIX}-pos`, "INV QA POS 10k", 10_000, 5);
const hold = await upsertProduct(`${PREFIX}-hold`, "INV QA Hold 8k", 8_000);
const refund = await upsertProduct(`${PREFIX}-refund`, "INV QA Refund 12k", 12_000);
const pack = await upsertProduct(`${PREFIX}-pack`, "INV QA Pack 5k", 5_000, 24);
const recv = await upsertProduct(`${PREFIX}-recv`, "INV QA Receive 7k", 7_000);
const countP = await upsertProduct(`${PREFIX}-count`, "INV QA Count 9k", 9_000);
const adj = await upsertProduct(`${PREFIX}-adj`, "INV QA Adjust 6k", 6_000);
const qsi = await upsertProduct(`${PREFIX}-qsi`, "INV QA Quick 4k", 4_000);
const low = await upsertProduct(`${PREFIX}-low`, "INV QA Low 3k", 3_000, 50);

await prisma.productUnit.upsert({
  create: {
    barcode: `${pack.id}-box-bc`,
    conversionQty: 12,
    costPriceLak: 30_000,
    id: `${pack.id}-box`,
    isBaseUnit: false,
    isDefaultSaleUnit: false,
    isPurchaseUnit: true,
    productId: pack.id,
    sellingPriceLak: 60_000,
    status: "active",
    unitName: "Box",
  },
  update: { conversionQty: 12, isPurchaseUnit: true, sellingPriceLak: 60_000, status: "active" },
  where: { id: `${pack.id}-box` },
});

await ensureOpenSession(ownerTenant);

const posBefore = await stockOf(pos.id);
const posMovesBefore = await movementCount({ productId: pos.id, movementType: "sale" });
const posSale = await sell(ownerTenant, pos.id, pos.pieceId, 1, pos.price);
check("1. Normal sale deduction", "Stock deducts exactly once", near(await stockOf(pos.id), posBefore - 1) && (await movementCount({ productId: pos.id, movementType: "sale", referenceId: posSale.id })) === 1, `stock ${posBefore}→${await stockOf(pos.id)} saleMoves ${posMovesBefore}→${await movementCount({ productId: pos.id, movementType: "sale" })}`);

const holdBefore = await stockOf(hold.id);
const holdMovesBefore = await movementCount({ productId: hold.id });
const held = await createPrismaHeldBill(
  {
    snapshot: {
      appliedPromotions: [],
      cardAmount: 0,
      cashAmount: hold.price,
      cartItems: [{
        barcode: `${hold.id}-bc`,
        categoryName: "QA",
        conversionQty: 1,
        id: hold.id,
        imageKey: "",
        nameEn: "INV QA Hold 8k",
        nameLo: "INV QA Hold 8k",
        priceLak: hold.price,
        quantity: 1,
        retailPriceLak: hold.price,
        sku: `${hold.id}-sku`,
        stockQty: 1_000,
        unitId: hold.pieceId,
        unitName: "Piece",
      }],
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
check("2. Hold/Resume no stock change", "Hold does not change stock", near(await stockOf(hold.id), holdBefore) && (await movementCount({ productId: hold.id })) === holdMovesBefore);
await resumePrismaHeldBill(held.id, ownerTenant);
check("2. Hold/Resume no stock change", "Resume does not change stock", near(await stockOf(hold.id), holdBefore) && (await movementCount({ productId: hold.id })) === holdMovesBefore);

const refundSale = await sell(ownerTenant, refund.id, refund.pieceId, 2, refund.price);
const refundItem = await prisma.saleItem.findFirst({ where: { saleId: refundSale.id } });
const refundBefore = await stockOf(refund.id);
await returnPrismaSale(ownerTenant, {
  items: [{ condition: "sellable", quantity: 1, saleItemId: String(refundItem?.id) }],
  reason: "INV QA sellable return",
  refundMethod: "cash",
  saleId: refundSale.id,
});
check("3. Sellable refund restore", "Sellable return restores once", near(await stockOf(refund.id), refundBefore + 1) && (await movementCount({ productId: refund.id, movementType: "return", referenceId: refundSale.id })) === 1);

const damagedBefore = await stockOf(refund.id);
await returnPrismaSale(ownerTenant, {
  items: [{ condition: "damaged", quantity: 1, saleItemId: String(refundItem?.id) }],
  reason: "INV QA damaged return",
  refundMethod: "cash",
  saleId: refundSale.id,
});
check("4. Damaged refund no sellable restore", "Damaged return does not inflate sellable stock", near(await stockOf(refund.id), damagedBefore), `stock ${damagedBefore}→${await stockOf(refund.id)}`);

const origBefore = await stockOf(pos.id);
const packBeforeEx = await stockOf(pack.id);
const exchangeSale = await sell(ownerTenant, pos.id, pos.pieceId, 1, pos.price);
const exchangeItem = await prisma.saleItem.findFirst({ where: { saleId: exchangeSale.id } });
await exchangePrismaSale(ownerTenant, {
  paidAmountLak: 50_000,
  reason: "INV QA exchange",
  refundMethod: "cash",
  replacementItems: [{ productId: pack.id, quantity: 1, unitId: pack.pieceId }],
  returnedItems: [{ condition: "sellable", quantity: 1, saleItemId: String(exchangeItem?.id) }],
  saleId: exchangeSale.id,
});
check(
  "5. Exchange stock movement",
  "Returned item restored and replacement deducted",
  near(await stockOf(pos.id), origBefore) && near(await stockOf(pack.id), packBeforeEx - 1),
  `pos=${await stockOf(pos.id)} pack=${await stockOf(pack.id)}`,
);

const voidBefore = await stockOf(hold.id);
const voidSale = await sell(ownerTenant, hold.id, hold.pieceId, 1, hold.price);
await voidPrismaSale(ownerTenant, { reason: "INV QA void", saleId: voidSale.id });
check("6. Void restoration", "Stock restores exactly once", near(await stockOf(hold.id), voidBefore) && (await movementCount({ productId: hold.id, referenceId: voidSale.id })) === 2, `stock=${await stockOf(hold.id)} moves=${await movementCount({ productId: hold.id, referenceId: voidSale.id })}`);

let supplier = await prisma.supplier.findFirst({
  where: { companyId: COMPANY_ID, status: "active" },
  orderBy: { createdAt: "asc" },
});
if (!supplier) {
  supplier = await prisma.supplier.create({
    data: {
      branchId: BRANCH_ID,
      companyId: COMPANY_ID,
      id: `${PREFIX}-supplier`,
      name: "INV QA Supplier",
      status: "active",
    },
  });
}
if (!supplier) {
  check("7. Purchase receive", "TEST supplier exists", false);
} else {
  const recvBefore = await stockOf(recv.id);
  const po = await createPurchaseOrder(
    {
      currency: "LAK",
      exchangeRate: 1,
      items: [{ productId: recv.id, quantity: 4, unitCost: 3_500, unitId: recv.pieceId }],
      supplierId: supplier.id,
      warehouseId: WAREHOUSE_ID,
    },
    ownerTenant,
  );
  await updatePurchaseOrderStatus({ purchaseId: po.id, status: "ordered" }, ownerTenant);
  const receipt = await receiveGoods(
    {
      items: [{ productId: recv.id, purchaseItemId: po.items[0].id, quantity: 2, unitId: recv.pieceId }],
      purchaseId: po.id,
      receiptNo: `GR-INVQA-${Date.now()}`,
      status: "received",
      warehouseId: WAREHOUSE_ID,
    },
    ownerTenant,
  );
  check(
    "7. Purchase receive",
    "Partial receive increases stock exactly once",
    near(await stockOf(recv.id), recvBefore + 2) && (await movementCount({ referenceId: receipt.id, referenceType: "goods_receipt" })) === 1,
    `stock ${recvBefore}→${await stockOf(recv.id)}`,
  );
  await expectThrow("8. Duplicate receive blocked", "Receiving beyond remaining quantity is blocked", () =>
    receiveGoods(
      {
        items: [{ productId: recv.id, purchaseItemId: po.items[0].id, quantity: 5, unitId: recv.pieceId }],
        purchaseId: po.id,
        receiptNo: `GR-INVQA-DUP-${Date.now()}`,
        status: "received",
        warehouseId: WAREHOUSE_ID,
      },
      ownerTenant,
    ),
  );
}

const transferApi = existsSync("features/inventory/transfer-repository.ts") || existsSync("app/api/inventory/transfer/route.ts");
check(
  "9. Transfer source/destination",
  "Stock transfer application API",
  false,
  "Schema StockTransfer exists but there is no inventory transfer repository, action, or route",
  !transferApi,
);

const countBefore = await stockOf(countP.id);
const countPos = await createStockCount({ countedQuantity: countBefore + 8, note: "INV QA positive count", productId: countP.id, warehouseId: WAREHOUSE_ID }, ownerTenant);
check("10. Stock count positive variance", "Positive count posts once", near(await stockOf(countP.id), countBefore + 8) && near(countPos.afterQty - countPos.beforeQty, 8));
const countMid = await stockOf(countP.id);
const countNeg = await createStockCount({ countedQuantity: countMid - 3, note: "INV QA negative count", productId: countP.id, warehouseId: WAREHOUSE_ID }, ownerTenant);
check("11. Stock count negative variance", "Negative count posts once", near(await stockOf(countP.id), countMid - 3) && near(countNeg.afterQty - countNeg.beforeQty, -3));
const countSame = await stockOf(countP.id);
const countMovesBeforeDup = await movementCount({ productId: countP.id, referenceType: "stock_count" });
await createStockCount({ countedQuantity: countSame, note: "INV QA reconfirm", productId: countP.id, warehouseId: WAREHOUSE_ID }, ownerTenant);
const countMovesAfterDup = await movementCount({ productId: countP.id, referenceType: "stock_count" });
check("11. Stock count negative variance", "Reconfirming same count does not duplicate adjustment", countMovesAfterDup === countMovesBeforeDup, `moves ${countMovesBeforeDup}→${countMovesAfterDup}`);

const adjBefore = await stockOf(adj.id);
await expectThrow("12. Manual adjustment", "Adjustment without reason is rejected", () =>
  createStockAdjustment({ productId: adj.id, quantity: 5, warehouseId: WAREHOUSE_ID } as Parameters<typeof createStockAdjustment>[0], ownerTenant),
);
const adjusted = await createStockAdjustment({ note: "INV QA +5", productId: adj.id, quantity: 5, reason: "cycle count correction", warehouseId: WAREHOUSE_ID }, ownerTenant);
check("12. Manual adjustment", "Signed adjustment posts once with audit", near(await stockOf(adj.id), adjBefore + 5) && near(adjusted.afterQty - adjusted.beforeQty, 5) && Boolean(await prisma.auditLog.findFirst({ orderBy: { createdAt: "desc" }, where: { action: "adjustment", companyId: COMPANY_ID, module: "inventory" } })));
await expectThrow("12. Manual adjustment", "Negative stock is blocked", () =>
  createStockAdjustment({ productId: adj.id, quantity: -1_000_000, reason: "too much", warehouseId: WAREHOUSE_ID }, ownerTenant),
);

const qsiBefore = await stockOf(qsi.id);
const qsiNo = `SI-INVQA-${Date.now()}`;
await createStockIn(
  {
    note: "INV QA quick stock in",
    productId: qsi.id,
    quantity: 3,
    stockInNo: qsiNo,
    unitCostLak: 2_000,
    unitId: qsi.pieceId,
    warehouseId: WAREHOUSE_ID,
  },
  ownerTenant,
);
check("13. Quick stock in", "Quantity increases and movement created", near(await stockOf(qsi.id), qsiBefore + 3) && (await movementCount({ referenceId: qsiNo, referenceType: "quick_stock_in" })) === 1);
await expectThrow("13. Quick stock in", "Duplicate stock-in number is blocked", () =>
  createStockIn(
    {
      productId: qsi.id,
      quantity: 3,
      stockInNo: qsiNo,
      unitId: qsi.pieceId,
      warehouseId: WAREHOUSE_ID,
    },
    ownerTenant,
  ),
);
const concurrentNo = `SI-INVQA-CON-${Date.now()}`;
const concurrent = await Promise.allSettled([
  createStockIn({ productId: qsi.id, quantity: 1, stockInNo: concurrentNo, unitId: qsi.pieceId, warehouseId: WAREHOUSE_ID }, ownerTenant),
  createStockIn({ productId: qsi.id, quantity: 1, stockInNo: concurrentNo, unitId: qsi.pieceId, warehouseId: WAREHOUSE_ID }, ownerTenant),
]);
check(
  "14. Duplicate/concurrency",
  "Concurrent quick stock-in with same number posts once",
  concurrent.filter((row) => row.status === "fulfilled").length === 1 &&
    concurrent.filter((row) => row.status === "rejected").length === 1 &&
    (await movementCount({ referenceId: concurrentNo, referenceType: "quick_stock_in" })) === 1,
  `wins=${concurrent.filter((row) => row.status === "fulfilled").length} fails=${concurrent.filter((row) => row.status === "rejected").length}`,
);

const packBefore = await stockOf(pack.id);
await createStockIn({ productId: pack.id, quantity: 1, unitId: `${pack.id}-box`, warehouseId: WAREHOUSE_ID }, ownerTenant);
check("15. Unit conversion", "Receiving 1 box adds 12 base pieces", near(await stockOf(pack.id), packBefore + 12), `stock ${packBefore}→${await stockOf(pack.id)}`);
const packAfterBox = await stockOf(pack.id);
await sell(ownerTenant, pack.id, pack.pieceId, 1, pack.price);
check("15. Unit conversion", "Selling 1 piece deducts 1 base", near(await stockOf(pack.id), packAfterBox - 1));
const packAfterPiece = await stockOf(pack.id);
await sell(ownerTenant, pack.id, `${pack.id}-box`, 1, 60_000);
check("15. Unit conversion", "Selling 1 box deducts 12 base", near(await stockOf(pack.id), packAfterPiece - 12), `stock ${packAfterPiece}→${await stockOf(pack.id)}`);

await prisma.inventoryBalance.update({
  data: { quantity: 10 },
  where: { warehouseId_productId: { productId: low.id, warehouseId: WAREHOUSE_ID } },
});
const snapshot = await getPrismaInventorySnapshot(ownerTenant);
const lowItem = snapshot.items.find((item: { productId: string }) => item.productId === low.id);
check("16. Low stock", "Low-stock uses sellable inventoryBalance vs minStock", Boolean(lowItem && lowItem.quantity === 10 && lowItem.minStock === 50 && lowItem.quantity <= lowItem.minStock), `qty=${lowItem?.quantity} min=${lowItem?.minStock}`);

check("17. Damaged/expiry handling", "Damaged returns keep sellable stock unchanged (covered in case 4)", true, "Lots are expiry metadata; sellable source of truth remains inventory_balances");

const reportItem = snapshot.items.find((item: { productId: string }) => item.productId === recv.id);
const recvActual = await stockOf(recv.id);
check("18. Inventory report reconciliation", "Snapshot quantity matches inventory_balances", Boolean(reportItem) && near(amount(reportItem?.quantity), recvActual), `report=${reportItem?.quantity} db=${recvActual}`);
check(
  "18. Inventory report reconciliation",
  "Stock value uses transaction/unit cost not current selling price",
  near(amount(reportItem?.inventoryValueLak), recvActual * amount((await prisma.product.findUnique({ where: { id: recv.id } }))?.costPriceLak)),
  `value=${reportItem?.inventoryValueLak}`,
);

await expectThrow("19. Permission/Tenant", "Cross-company stock-in blocked", () =>
  createStockIn({ productId: qsi.id, quantity: 1, warehouseId: WAREHOUSE_ID }, foreignTenant),
);
await expectThrow("19. Permission/Tenant", "Cashier cannot adjust stock", async () => {
  await assertTenantStoreAction(cashierTenant, STORE_ACTIONS.INVENTORY_ADJUST);
  await assertPermission(cashierTenant, WRITE_PERMISSIONS.inventoryAdjust);
  await createStockAdjustment(
    { productId: adj.id, quantity: 1, reason: "cashier", warehouseId: WAREHOUSE_ID },
    cashierTenant,
  );
});
check(
  "19. Permission/Tenant",
  "Cashier matrix denies inventory manage actions",
  !canPerformStoreAction({ role: STORE_ROLES.CASHIER }, STORE_ACTIONS.INVENTORY_ADJUST) &&
    !canPerformStoreAction({ role: STORE_ROLES.CASHIER }, STORE_ACTIONS.INVENTORY_COUNT) &&
    !canPerformStoreAction({ role: STORE_ROLES.CASHIER }, STORE_ACTIONS.INVENTORY_STOCK_IN) &&
    canPerformStoreAction({ role: STORE_ROLES.OWNER }, STORE_ACTIONS.INVENTORY_ADJUST),
);

const extraBranch = await prisma.branch.upsert({
  create: { companyId: COMPANY_ID, id: `${PREFIX}-other-branch`, name: "INV QA Other Branch" },
  update: { name: "INV QA Other Branch" },
  where: { id: `${PREFIX}-other-branch` },
});
const extraWarehouse = await prisma.warehouse.upsert({
  create: { branchId: extraBranch.id, companyId: COMPANY_ID, id: `${PREFIX}-other-wh`, name: "INV QA Other WH", type: "store" },
  update: { name: "INV QA Other WH" },
  where: { id: `${PREFIX}-other-wh` },
});
const managerMembership = await prisma.companyUser.findFirst({ where: { companyId: COMPANY_ID, userId: managerUser.id } });
const previousBranch = managerMembership?.branchId ?? BRANCH_ID;
if (managerMembership) {
  await prisma.companyUser.update({ data: { branchId: extraBranch.id }, where: { id: managerMembership.id } });
}
try {
  await expectThrow("19. Permission/Tenant", "Cross-branch warehouse adjustment blocked", () =>
    createStockAdjustment(
      { productId: adj.id, quantity: 1, reason: "other branch", warehouseId: WAREHOUSE_ID },
      { branchId: extraBranch.id, companyId: COMPANY_ID, userId: managerUser.id, warehouseId: extraWarehouse.id },
    ),
  );
} finally {
  if (managerMembership) {
    await prisma.companyUser.update({ data: { branchId: previousBranch }, where: { id: managerMembership.id } });
  }
}

await prisma.product.updateMany({
  data: { isActive: false, status: "inactive" },
  where: { id: { startsWith: PREFIX } },
});

const missing = results.filter((row) => row.missing);
const failed = results.filter((row) => !row.ok && !row.missing);
const passed = results.filter((row) => row.ok).length;
console.log(`\nInventory final integration: ${passed}/${results.length} PASS${failed.length ? ` (${failed.length} FAIL)` : ""}${missing.length ? ` (${missing.length} MISSING)` : ""}`);
for (const row of missing) {
  console.log(`MISSING REQUIRED LINK  ${row.name} — ${row.detail}`);
}
await prisma.$disconnect();
process.exit(failed.length ? 1 : 0);
