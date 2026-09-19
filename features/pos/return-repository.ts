import { applyExchangeLoyaltyEarn, isMembershipEligibleForBenefits, resolveMembershipDiscountPercent, reverseSaleLoyaltyPortion } from "@/features/loyalty/loyalty-service";
import { applyAtomicStockDelta, lockInventoryMutationKey } from "@/features/inventory/stock-concurrency";
import {
  consumeInventoryForSale,
  inventoryLotLockKey,
  LOT_ALLOCATION_SOURCE,
  primaryLotMovementFields,
  restoreInventoryForReturn,
} from "@/features/inventory/lot-reconciliation";
import {
  assertOpenCashSessionForCashExchange,
  assertOpenCashSessionForCashRefund,
} from "@/features/cash-sessions/prisma-repository";
import {
  applyActivePromotions,
  assertPromotionProfitSafe,
  rejectClientPromotionClaims,
} from "@/features/promotions/promotion-checkout";
import { createApprovalRequest } from "@/features/approvals/approval-engine";
import {
  allocateOriginalPaidBySaleItem,
  allocateReturnedAmount,
  roundLak,
  roundQty,
} from "@/features/pos/return-allocator";
import {
  getPrismaSaleById,
  loadMutableSale,
  lockSaleForUpdate,
  mapSaleRow,
} from "@/features/pos/post-sale-shared";
import type {
  ExchangeSaleInput,
  RefundPaymentMethod,
  ReturnItemCondition,
  ReturnLineInput,
  ReturnMutationResult,
  ReturnReceiptSnapshot,
  ReturnSaleInput,
  ReturnableSaleSnapshot,
} from "@/features/pos/return-types";
import { RETURN_ITEM_CONDITIONS } from "@/features/pos/return-types";
import {
  assertPosActionAllowed,
  buildPosPolicyForTenant,
} from "@/features/pos/pos-permission-guard";
import { evaluatePosPermission } from "@/features/pos/permissions";
import { prisma } from "@/lib/db/prisma";
import { PermissionDeniedError } from "@/lib/auth/permissions";
import { branchOwnedWhere, resolveTenantScope } from "@/lib/db/tenant-scope";
import type { TenantContext } from "@/lib/db/write-context";
import { numberValue, withTenantTransaction } from "@/lib/db/write-context";

const db = prisma as any;
const DEFAULT_LOYALTY_EARN_SPEND_LAK = 10_000;

function amount(value: unknown) {
  return numberValue(value);
}

function asMethod(value: unknown): RefundPaymentMethod {
  const method = String(value ?? "cash");
  if (method === "transfer" || method === "qr" || method === "visa" || method === "mastercard") {
    return method;
  }
  return "cash";
}

function asCondition(value: unknown): ReturnItemCondition {
  const condition = String(value ?? "sellable");
  if (condition === "damaged" || condition === "expired" || condition === "opened_used") {
    return condition;
  }
  return "sellable";
}

function saleInclude() {
  return {
    customer: { select: { fullName: true, phone: true } },
    items: {
      include: {
        product: { select: { nameEn: true, nameLo: true } },
        unit: { select: { conversionQty: true, unitName: true } },
      },
    },
    payments: true,
    refunds: {
      include: {
        exchangeItems: true,
        items: true,
      },
    },
  };
}

function remainingBySaleItem(sale: Record<string, any>) {
  const allocated = allocateOriginalPaidBySaleItem(sale);
  const paidById = new Map(allocated.map((row) => [row.id, row.originalPaidLak]));
  const returnedQty = new Map<string, number>();
  const returnedPaid = new Map<string, number>();
  let returnedPaidTotal = 0;
  let hasExchange = false;
  let hasRefund = false;

  for (const refund of sale.refunds ?? []) {
    const kind = String(refund.kind ?? "refund");
    if (kind === "exchange") hasExchange = true;
    if (kind === "refund") hasRefund = true;
    returnedPaidTotal += amount(refund.totalAmount);
    for (const item of refund.items ?? []) {
      const saleItemId = String(item.saleItemId ?? "");
      returnedQty.set(saleItemId, (returnedQty.get(saleItemId) ?? 0) + amount(item.quantity));
      returnedPaid.set(saleItemId, (returnedPaid.get(saleItemId) ?? 0) + amount(item.amount));
    }
  }

  return { hasExchange, hasRefund, paidById, returnedPaid, returnedPaidTotal, returnedQty };
}

export function nextLifecycleSaleStatus(sale: Record<string, any>, remainingQty: number) {
  const { hasExchange, hasRefund } = remainingBySaleItem(sale);
  if (remainingQty <= 1e-9) {
    if (hasExchange && hasRefund) return "adjusted";
    if (hasExchange) return "exchanged";
    return "refunded";
  }
  if (hasExchange && hasRefund) return "adjusted";
  if (hasExchange) return "exchanged";
  return "partial_refunded";
}

function assertSaleReturnable(sale: Record<string, any>) {
  const status = String(sale.saleStatus);
  if (status === "cancelled" || status === "voided") {
    throw new Error("Sale is already voided.");
  }
  if (status === "refunded") {
    throw new Error("Sale is already refunded.");
  }
  if (status === "held") {
    throw new Error("Held bills cannot be returned.");
  }
  if (!["completed", "partial_refunded", "exchanged", "adjusted"].includes(status)) {
    throw new Error(`Sale cannot be returned while status is ${status}.`);
  }
}

/** Session only when refundMethod is cash and drawer cash actually moves. */
async function resolveCashSessionIdForReturnOrExchange(
  tenant: TenantContext,
  tx: Record<string, any>,
  input: {
    kind: "refund" | "exchange";
    paymentAmountLak: number;
    refundAmountLak: number;
    refundMethod: RefundPaymentMethod;
  },
): Promise<string | null> {
  if (input.refundMethod !== "cash") {
    return null;
  }
  const cashMovementLak = roundLak(Math.abs(input.refundAmountLak) + Math.abs(input.paymentAmountLak));
  if (cashMovementLak <= 0.009) {
    return null;
  }
  const session =
    input.kind === "exchange"
      ? await assertOpenCashSessionForCashExchange(tenant, tx)
      : await assertOpenCashSessionForCashRefund(tenant, tx);
  return String(session.id);
}

function movementTypeForCondition(condition: ReturnItemCondition) {
  if (condition === "damaged") return "damaged";
  if (condition === "expired") return "expired";
  if (condition === "opened_used") return "adjustment";
  return "return";
}

async function getNextRefundNo(tx: Record<string, any>, companyId: string, prefix: "RFND" | "EXC") {
  const count = await tx.refund.count({ where: { companyId } });
  return `${prefix}-${Date.now()}-${count + 1}`;
}

async function assertRefundPermission(tenant: TenantContext, amountLak: number) {
  const policy = await buildPosPolicyForTenant(tenant);
  const decision = evaluatePosPermission(policy, "refund_bill", { amountLak });
  if (decision.allowed) {
    return { pendingApproval: false as const, policy };
  }
  if (decision.approvalRequired) {
    return { pendingApproval: true as const, policy, reason: decision.reason };
  }
  throw new PermissionDeniedError(`pos.refund_bill${decision.reason ? ` — ${decision.reason}` : ""}`);
}

function resolveSaleUnit(product: Record<string, any>, unitId: string | undefined) {
  const units: Array<Record<string, any>> = product.units ?? [];
  const requested = unitId ? units.find((unit) => String(unit.id) === unitId) : null;
  const fallback = units.find((unit) => unit.isDefaultSaleUnit) ?? units.find((unit) => unit.isBaseUnit) ?? units[0];
  const unit = requested ?? fallback;
  if (!unit) {
    throw new Error(`Product ${product.id} is missing a sale unit.`);
  }
  return unit;
}

async function applyReturnedStock(
  tx: Record<string, any>,
  tenant: TenantContext,
  sale: Record<string, any>,
  lines: Array<{
    baseQuantity: number;
    condition: ReturnItemCondition;
    productId: string;
    saleItemId: string;
    unitId?: string | null;
  }>,
  note: string,
) {
  const runningQty = new Map<string, number>();
  const warehouseId = String(sale.warehouseId);
  const restoredLots = new Map<string, Awaited<ReturnType<typeof restoreInventoryForReturn>>>();

  for (const line of lines) {
    if (line.baseQuantity <= 0) continue;
    if (line.condition === "sellable") {
      await lockInventoryMutationKey(
        tx,
        inventoryLotLockKey(tenant.companyId, warehouseId, line.productId),
      );
      restoredLots.set(
        line.saleItemId,
        await restoreInventoryForReturn(tx, {
          companyId: tenant.companyId,
          productId: line.productId,
          quantity: line.baseQuantity,
          sourceId: line.saleItemId,
          sourceType: LOT_ALLOCATION_SOURCE.saleItem,
          warehouseId,
        }),
      );
      const balance = await applyAtomicStockDelta(tx, {
        companyId: tenant.companyId,
        productId: line.productId,
        quantityDelta: line.baseQuantity,
        warehouseId,
      });
      runningQty.set(line.productId, balance.beforeQty);
    } else {
      const current = await tx.inventoryBalance.findUnique({
        where: {
          warehouseId_productId: {
            productId: line.productId,
            warehouseId,
          },
        },
      });
      runningQty.set(line.productId, amount(current?.quantity));
    }
  }

  for (const line of lines) {
    if (line.baseQuantity <= 0) continue;
    const beforeQty = runningQty.get(line.productId) ?? 0;
    const afterQty = line.condition === "sellable" ? beforeQty + line.baseQuantity : beforeQty;
    const lotFields = primaryLotMovementFields(restoredLots.get(line.saleItemId) ?? []);
    await tx.stockMovement.create({
      data: {
        afterQty,
        beforeQty,
        companyId: tenant.companyId,
        createdBy: tenant.userId,
        expiryDate: lotFields.expiryDate,
        lotNumber: lotFields.lotNumber,
        movementType: movementTypeForCondition(line.condition),
        note: line.condition === "sellable" ? note : `${note} (${line.condition})`,
        productId: line.productId,
        quantity: line.baseQuantity,
        referenceId: sale.id,
        referenceType: "sale",
        unitId: line.unitId ?? null,
        warehouseId: sale.warehouseId,
      },
    });
    runningQty.set(line.productId, afterQty);
  }
}

async function deductReplacementStock(
  tx: Record<string, any>,
  tenant: TenantContext,
  sale: Record<string, any>,
  lines: Array<{ baseQuantity: number; productId: string; sourceId: string; unitId?: string }>,
  note: string,
) {
  const runningQty = new Map<string, number>();
  const warehouseId = String(sale.warehouseId);
  for (const line of lines) {
    await lockInventoryMutationKey(
      tx,
      inventoryLotLockKey(tenant.companyId, warehouseId, line.productId),
    );
    const balance = await applyAtomicStockDelta(tx, {
      companyId: tenant.companyId,
      productId: line.productId,
      quantityDelta: -line.baseQuantity,
      warehouseId,
    });
    runningQty.set(line.productId, balance.beforeQty);
  }
  for (const line of lines) {
    const beforeQty = runningQty.get(line.productId) ?? 0;
    const afterQty = beforeQty - line.baseQuantity;
    const allocations = await consumeInventoryForSale(tx, {
      companyId: tenant.companyId,
      productId: line.productId,
      quantity: line.baseQuantity,
      sourceId: line.sourceId,
      sourceType: LOT_ALLOCATION_SOURCE.refundExchangeItem,
      warehouseId,
    });
    const lotFields = primaryLotMovementFields(allocations);
    await tx.stockMovement.create({
      data: {
        afterQty,
        beforeQty,
        companyId: tenant.companyId,
        createdBy: tenant.userId,
        expiryDate: lotFields.expiryDate,
        lotNumber: lotFields.lotNumber,
        movementType: "sale",
        note,
        productId: line.productId,
        quantity: line.baseQuantity,
        referenceId: sale.id,
        referenceType: "sale_exchange",
        unitId: line.unitId ?? null,
        warehouseId: sale.warehouseId,
      },
    });
    runningQty.set(line.productId, afterQty);
  }
}

async function reverseReturnedPromotions(
  tx: Record<string, any>,
  sale: Record<string, any>,
  returned: Array<{ quantity: number; saleItem: Record<string, any> }>,
) {
  const byPromotion = new Map<string, number>();
  for (const row of returned) {
    const promotionId = row.saleItem.promotionId ? String(row.saleItem.promotionId) : "";
    if (!promotionId) continue;
    const originalQty = amount(row.saleItem.quantity);
    if (originalQty <= 0) continue;
    const share = amount(row.saleItem.promotionDiscount) * (row.quantity / originalQty);
    byPromotion.set(promotionId, (byPromotion.get(promotionId) ?? 0) + share);
  }

  for (const [promotionId, rawDiscount] of byPromotion) {
    const discountLak = roundLak(rawDiscount);
    if (discountLak <= 0) continue;
    const usage = await tx.promotionUsage.findFirst({
      where: { promotionId, saleId: sale.id },
    });
    if (!usage) continue;
    const current = amount(usage.discountAmountLak);
    const nextDiscount = Math.max(current - discountLak, 0);
    const applied = current - nextDiscount;
    if (nextDiscount <= 0) {
      await tx.promotionUsage.delete({ where: { id: usage.id } });
      await tx.promotion.update({
        data: {
          totalDiscountLak: { decrement: current },
          usageCount: { decrement: 1 },
        },
        where: { id: promotionId },
      });
    } else {
      await tx.promotionUsage.update({
        data: { discountAmountLak: nextDiscount },
        where: { id: usage.id },
      });
      await tx.promotion.update({
        data: { totalDiscountLak: { decrement: applied } },
        where: { id: promotionId },
      });
    }
  }
}

async function recordReplacementPromotions(
  tx: Record<string, any>,
  input: { companyId: string; saleId: string; saleItems: Array<{ promotionDiscount: number; promotionId?: string }> },
) {
  const discountByPromotion = new Map<string, number>();
  for (const item of input.saleItems) {
    if (item.promotionId && item.promotionDiscount > 0) {
      discountByPromotion.set(item.promotionId, (discountByPromotion.get(item.promotionId) ?? 0) + item.promotionDiscount);
    }
  }
  for (const [promotionId, discountLak] of discountByPromotion) {
    const existing = await tx.promotionUsage.findFirst({
      where: { companyId: input.companyId, promotionId, saleId: input.saleId },
    });
    if (existing) {
      await tx.promotionUsage.update({
        data: { discountAmountLak: { increment: discountLak } },
        where: { id: existing.id },
      });
    } else {
      await tx.promotionUsage.create({
        data: {
          companyId: input.companyId,
          discountAmountLak: discountLak,
          promotionId,
          saleId: input.saleId,
        },
      });
      await tx.promotion.update({
        data: { usageCount: { increment: 1 } },
        where: { id: promotionId },
      });
    }
    await tx.promotion.update({
      data: { totalDiscountLak: { increment: discountLak } },
      where: { id: promotionId },
    });
  }
}

function buildPreparedReturnLines(sale: Record<string, any>, items: ReturnLineInput[]) {
  assertSaleReturnable(sale);
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("At least one returned item is required.");
  }

  const { paidById, returnedPaid, returnedQty } = remainingBySaleItem(sale);
  const saleItems = new Map<string, Record<string, any>>((sale.items ?? []).map((item: Record<string, any>) => [String(item.id), item]));
  const used = new Set<string>();
  const prepared = [];

  for (const requested of items) {
    const saleItemId = String(requested.saleItemId ?? "").trim();
    if (!saleItemId) {
      throw new Error("Returned sale item id is required.");
    }
    if (used.has(saleItemId)) {
      throw new Error("The same sale item cannot be returned twice in one request.");
    }
    used.add(saleItemId);
    const saleItem = saleItems.get(saleItemId);
    if (!saleItem) {
      throw new Error("Returned item does not belong to the original sale.");
    }
    const returnQuantity = roundQty(amount(requested.quantity));
    const originalQty = amount(saleItem.quantity);
    const alreadyQty = returnedQty.get(saleItemId) ?? 0;
    const alreadyPaid = returnedPaid.get(saleItemId) ?? 0;
    const originalPaidLak = paidById.get(saleItemId) ?? 0;
    const amountLak = allocateReturnedAmount({
      alreadyRefundedLak: alreadyPaid,
      alreadyReturnedQty: alreadyQty,
      originalPaidLak,
      originalQuantity: originalQty,
      returnQuantity,
    });
    const conversionQty = amount(saleItem.unit?.conversionQty) || 1;
    prepared.push({
      amountLak,
      baseQuantity: returnQuantity * conversionQty,
      condition: asCondition(requested.condition),
      productId: String(saleItem.productId),
      quantity: returnQuantity,
      reason: requested.reason?.trim() || null,
      saleItem,
      saleItemId,
      unitId: saleItem.unitId ? String(saleItem.unitId) : null,
    });
  }

  const returnValueLak = prepared.reduce((total, line) => total + line.amountLak, 0);
  const remainingRefundable = roundLak(amount(sale.totalAmount) - remainingBySaleItem(sale).returnedPaidTotal);
  if (returnValueLak - remainingRefundable > 0.009) {
    throw new Error("Refund amount exceeds the remaining refundable total.");
  }
  return { prepared, remainingRefundable, returnValueLak };
}

async function priceReplacementItems(
  tx: Record<string, any>,
  tenant: TenantContext,
  sale: Record<string, any>,
  replacementItems: ExchangeSaleInput["replacementItems"],
) {
  if (!Array.isArray(replacementItems) || replacementItems.length === 0) {
    throw new Error("At least one replacement item is required for an exchange.");
  }
  rejectClientPromotionClaims(replacementItems as Array<{ promotionDiscount?: number; promotionId?: string }>);

  const productIds = Array.from(new Set(replacementItems.map((item) => String(item.productId))));
  const [products, customerRecord] = await Promise.all([
    tx.product.findMany({
      include: { units: true },
      where: { companyId: tenant.companyId, id: { in: productIds }, isActive: true },
    }),
    sale.customerId
      ? tx.customer.findFirst({
          include: {
            membershipLevel: { select: { discountPercent: true } },
            subscriptions: { orderBy: { endDate: "desc" }, take: 1, where: { status: "active" } },
          },
          where: { companyId: tenant.companyId, id: sale.customerId },
        })
      : Promise.resolve(null),
  ]);
  const productMap = new Map<string, Record<string, any>>(
    (products as Array<Record<string, any>>).map((product) => [String(product.id), product]),
  );
  const membershipDiscountPercent = resolveMembershipDiscountPercent(customerRecord);
  const categoryByProduct = new Map<string, string | null>(
    (products as Array<Record<string, any>>).map((product) => [String(product.id), product.categoryId ?? null]),
  );

  const rawItems = replacementItems.map((item) => {
    const product = productMap.get(String(item.productId));
    if (!product) {
      throw new Error(`Replacement product ${item.productId} was not found or is inactive.`);
    }
    const quantity = roundQty(amount(item.quantity));
    if (quantity <= 0) {
      throw new Error("Replacement quantity must be greater than zero.");
    }
    const unit = resolveSaleUnit(product, item.unitId);
    const conversionQty = Math.max(amount(unit.conversionQty) || 1, 1);
    const retailPrice = amount(unit.sellingPriceLak ?? product.sellingPriceLak);
    const costPrice = amount(unit.costPriceLak ?? product.costPriceLak);
    const sellingPrice = membershipDiscountPercent > 0
      ? roundLak(retailPrice * (1 - membershipDiscountPercent / 100))
      : retailPrice;
    return {
      baseQuantity: quantity * conversionQty,
      costPrice,
      discountAmount: 0,
      nameEn: String(product.nameEn ?? product.nameLo ?? "Item"),
      nameLo: String(product.nameLo ?? product.nameEn ?? "Item"),
      productId: String(item.productId),
      profitAmount: quantity * sellingPrice - costPrice * quantity,
      promotionDiscount: 0,
      promotionId: undefined as string | undefined,
      quantity,
      sellingPrice,
      totalAmount: quantity * sellingPrice,
      unitId: String(unit.id),
    };
  });

  const priced = await applyActivePromotions(tx, rawItems, {
    allowStacking: false,
    blockBelowCostSales: true,
    categoryByProduct,
    companyId: tenant.companyId,
    membershipLevelId: isMembershipEligibleForBenefits(customerRecord)
      ? String((customerRecord as Record<string, any> | null)?.membershipLevelId ?? "") || null
      : null,
  });
  assertPromotionProfitSafe(priced, true);
  const replacementTotalLak = roundLak(priced.reduce((total, item) => total + amount(item.totalAmount), 0));
  return { priced, replacementTotalLak };
}

async function mapReturnReceipt(
  tx: Record<string, any>,
  refund: Record<string, any>,
  sale: Record<string, any>,
): Promise<ReturnReceiptSnapshot> {
  const createdByUser = refund.createdBy
    ? await tx.user.findFirst({ select: { fullName: true, username: true }, where: { id: refund.createdBy } })
    : null;
  const approvedByUser = refund.approvedBy
    ? await tx.user.findFirst({ select: { fullName: true, username: true }, where: { id: refund.approvedBy } })
    : null;
  const productIds = [
    ...(refund.items ?? []).map((item: Record<string, any>) => String(item.productId)),
    ...(refund.exchangeItems ?? []).map((item: Record<string, any>) => String(item.productId)),
  ];
  const products = productIds.length
    ? await tx.product.findMany({
        select: { id: true, nameEn: true, nameLo: true },
        where: { id: { in: productIds } },
      })
    : [];
  const productMap = new Map<string, Record<string, any>>(
    (products as Array<Record<string, any>>).map((product) => [String(product.id), product]),
  );
  const saleItemUnitById = new Map<string, string>(
    ((sale.items ?? []) as Array<Record<string, any>>)
      .map((item) => [String(item.id), item.unit?.unitName ? String(item.unit.unitName) : ""] as const)
      .filter((entry) => entry[1]),
  );

  return {
    approvedBy: approvedByUser?.fullName ?? approvedByUser?.username ?? refund.approvedBy ?? null,
    createdAt: new Date(refund.createdAt).toISOString(),
    createdBy: String(createdByUser?.fullName ?? createdByUser?.username ?? "Cashier"),
    differenceLak: amount(refund.differenceAmount),
    exchangeReceiptNo: refund.exchangeReceiptNo ? String(refund.exchangeReceiptNo) : null,
    kind: String(refund.kind ?? "refund") === "exchange" ? "exchange" : "refund",
    method: asMethod(refund.refundMethod),
    originalReceiptNo: sale.receiptNo ? String(sale.receiptNo) : `RCPT-${sale.saleNo}`,
    originalSaleNo: String(sale.saleNo),
    paymentAmountLak: amount(refund.paymentAmount),
    reason: refund.reason ?? null,
    receiptNo: String(refund.kind) === "exchange"
      ? String(refund.exchangeReceiptNo ?? refund.refundNo)
      : String(refund.refundNo),
    refundAmountLak: amount(refund.refundAmount),
    replacementItems: (refund.exchangeItems ?? []).map((item: Record<string, any>) => {
      const product = productMap.get(String(item.productId));
      return {
        nameEn: String(product?.nameEn ?? "Item"),
        nameLo: String(product?.nameLo ?? product?.nameEn ?? "Item"),
        quantity: amount(item.quantity),
        totalAmountLak: amount(item.totalAmount),
        unitPriceLak: amount(item.sellingPrice),
      };
    }),
    returnedItems: (refund.items ?? []).map((item: Record<string, any>) => {
      const product = productMap.get(String(item.productId));
      const unitName = saleItemUnitById.get(String(item.saleItemId ?? "")) || undefined;
      return {
        amountLak: amount(item.amount),
        condition: asCondition(item.condition),
        nameEn: String(product?.nameEn ?? "Item"),
        nameLo: String(product?.nameLo ?? product?.nameEn ?? "Item"),
        quantity: amount(item.quantity),
        reason: item.reason ?? null,
        unitName,
      };
    }),
    saleId: String(sale.id),
  };
}

export function toReturnableSaleSnapshot(sale: Record<string, any>, cashierName: string): ReturnableSaleSnapshot {
  const mapped = mapSaleRow(sale, cashierName);
  const { paidById, returnedPaid, returnedPaidTotal, returnedQty } = remainingBySaleItem(sale);
  return {
    branchId: mapped.branchId,
    cashierName,
    createdAt: mapped.createdAt,
    customerId: mapped.customerId,
    customerName: mapped.customerName,
    id: mapped.id,
    items: (sale.items ?? []).map((item: Record<string, any>) => {
      const originalQuantity = amount(item.quantity);
      const alreadyQty = returnedQty.get(String(item.id)) ?? 0;
      const originalPaidLak = paidById.get(String(item.id)) ?? 0;
      const alreadyPaid = returnedPaid.get(String(item.id)) ?? 0;
      return {
        conditionOptions: RETURN_ITEM_CONDITIONS,
        conversionQty: amount(item.unit?.conversionQty) || 1,
        id: String(item.id),
        nameEn: String(item.product?.nameEn ?? item.product?.nameLo ?? "Item"),
        nameLo: String(item.product?.nameLo ?? item.product?.nameEn ?? "Item"),
        originalPaidLak,
        originalQuantity,
        productId: String(item.productId),
        remainingPaidLak: roundLak(originalPaidLak - alreadyPaid),
        remainingQuantity: roundQty(originalQuantity - alreadyQty),
        sellingPriceLak: amount(item.sellingPrice),
        unitId: item.unitId ? String(item.unitId) : undefined,
        unitName: item.unit?.unitName ? String(item.unit.unitName) : undefined,
      };
    }),
    originalTotalLak: amount(sale.totalAmount),
    paymentMode: mapped.paymentMode,
    receiptNo: mapped.receiptNo,
    remainingRefundableLak: roundLak(amount(sale.totalAmount) - returnedPaidTotal),
    saleNo: mapped.saleNo,
    status: mapped.status,
    taxAmount: amount(sale.taxAmount),
    warehouseId: mapped.warehouseId,
  };
}

export async function lookupPrismaReturnableSale(tenant: TenantContext, query: string) {
  const policy = await buildPosPolicyForTenant(tenant);
  assertPosActionAllowed(policy, "view_recent_sales");
  const scope = await resolveTenantScope(tenant);
  const search = String(query ?? "").trim();
  const sales = await db.sale.findMany({
    include: saleInclude(),
    orderBy: { createdAt: "desc" },
    take: 25,
    where: {
      companyId: tenant.companyId,
      saleStatus: { in: ["completed", "partial_refunded", "exchanged", "adjusted"] },
      ...branchOwnedWhere(scope),
      ...(search
        ? {
            OR: [
              { saleNo: { contains: search, mode: "insensitive" } },
              { receiptNo: { contains: search, mode: "insensitive" } },
              { customer: { fullName: { contains: search, mode: "insensitive" } } },
              { customer: { phone: { contains: search } } },
            ],
          }
        : {}),
    },
  });

  const rows: ReturnableSaleSnapshot[] = [];
  for (const sale of sales) {
    const cashier = await db.user.findFirst({
      select: { fullName: true, username: true },
      where: { id: sale.createdBy },
    });
    rows.push(toReturnableSaleSnapshot(sale, String(cashier?.fullName ?? cashier?.username ?? "Cashier")));
  }
  return rows;
}

export async function getPrismaReturnableSale(tenant: TenantContext, saleId: string) {
  const scope = await resolveTenantScope(tenant);
  const sale = await db.sale.findFirst({
    include: saleInclude(),
    where: { companyId: tenant.companyId, id: saleId, ...branchOwnedWhere(scope) },
  });
  if (!sale) {
    return null;
  }
  const cashier = await db.user.findFirst({
    select: { fullName: true, username: true },
    where: { id: sale.createdBy },
  });
  return toReturnableSaleSnapshot(sale, String(cashier?.fullName ?? cashier?.username ?? "Cashier"));
}

export async function lookupPrismaExchangeProducts(tenant: TenantContext, query: string) {
  const policy = await buildPosPolicyForTenant(tenant);
  assertPosActionAllowed(policy, "create_sale");
  const search = String(query ?? "").trim();
  if (!search) {
    return [];
  }

  const products = await db.product.findMany({
    include: {
      units: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: { nameEn: "asc" },
    take: 20,
    where: {
      companyId: tenant.companyId,
      isActive: true,
      OR: [
        { nameEn: { contains: search, mode: "insensitive" } },
        { nameLo: { contains: search, mode: "insensitive" } },
        { sku: { contains: search, mode: "insensitive" } },
        { barcode: { contains: search, mode: "insensitive" } },
        { productCode: { contains: search, mode: "insensitive" } },
        { units: { some: { barcode: { contains: search, mode: "insensitive" } } } },
      ],
    },
  });

  return products.map((product: Record<string, any>) => {
    const unit = (product.units ?? []).find((row: Record<string, any>) => row.isDefaultSaleUnit)
      ?? (product.units ?? [])[0];
    return {
      id: String(product.id),
      nameEn: String(product.nameEn ?? product.nameLo ?? "Item"),
      nameLo: String(product.nameLo ?? product.nameEn ?? "Item"),
      sku: product.sku ? String(product.sku) : "",
      unitId: unit ? String(unit.id) : undefined,
      unitName: unit?.unitName ? String(unit.unitName) : undefined,
      sellingPriceLak: amount(unit?.sellingPriceLak ?? product.sellingPriceLak),
    };
  });
}

export async function getPrismaReturnReceipt(tenant: TenantContext, refundId: string) {
  const policy = await buildPosPolicyForTenant(tenant);
  assertPosActionAllowed(policy, "view_receipt");
  const scope = await resolveTenantScope(tenant);
  const refund = await db.refund.findFirst({
    include: { exchangeItems: true, items: true, sale: true },
    where: { companyId: tenant.companyId, id: refundId },
  });
  if (!refund) {
    throw new Error("Return record was not found.");
  }
  if (!scope.isOwner && String(refund.sale.branchId) !== scope.branchId) {
    throw new Error("Return record is outside the assigned branch.");
  }
  return mapReturnReceipt(db, refund, refund.sale);
}

async function persistReturnOrExchange(
  tx: Record<string, any>,
  tenant: TenantContext,
  sale: Record<string, any>,
  input: {
    approvedBy?: string | null;
    differenceLak: number;
    exchangeReceiptNo?: string | null;
    kind: "refund" | "exchange";
    paymentAmountLak: number;
    pricedReplacements?: Array<Record<string, any>>;
    prepared: ReturnType<typeof buildPreparedReturnLines>["prepared"];
    reason?: string | null;
    refundAmountLak: number;
    refundMethod: RefundPaymentMethod;
    returnValueLak: number;
    sessionId?: string | null;
  },
) {
  const refundNo = await getNextRefundNo(tx, tenant.companyId, input.kind === "exchange" ? "EXC" : "RFND");
  await lockSaleForUpdate(tx, tenant, String(sale.id));
  const refund = await tx.refund.create({
    data: {
      approvedBy: input.approvedBy ?? tenant.userId,
      branchId: sale.branchId,
      cashSessionId: input.sessionId ?? null,
      companyId: tenant.companyId,
      createdBy: tenant.userId,
      differenceAmount: input.differenceLak,
      exchangeItems: input.pricedReplacements?.length
        ? {
            create: input.pricedReplacements.map((item) => ({
              costPrice: amount(item.costPrice),
              discountAmount: amount(item.discountAmount),
              productId: String(item.productId),
              promotionDiscount: amount(item.promotionDiscount),
              promotionId: item.promotionId ?? null,
              quantity: amount(item.quantity),
              sellingPrice: amount(item.sellingPrice),
              totalAmount: amount(item.totalAmount),
              unitId: item.unitId ?? null,
            })),
          }
        : undefined,
      exchangeReceiptNo: input.exchangeReceiptNo ?? (input.kind === "exchange" ? refundNo : null),
      items: {
        create: input.prepared.map((line) => ({
          amount: line.amountLak,
          condition: line.condition,
          productId: line.productId,
          quantity: line.quantity,
          reason: line.reason,
          saleItemId: line.saleItemId,
          unitId: line.unitId,
        })),
      },
      kind: input.kind,
      paymentAmount: input.paymentAmountLak,
      reason: input.reason ?? null,
      refundAmount: input.refundAmountLak,
      refundMethod: input.refundMethod,
      refundNo,
      saleId: sale.id,
      totalAmount: input.returnValueLak,
      warehouseId: sale.warehouseId,
    },
    include: { exchangeItems: true, items: true },
  });

  await applyReturnedStock(
    tx,
    tenant,
    sale,
    input.prepared.map((line) => ({
      baseQuantity: line.baseQuantity,
      condition: line.condition,
      productId: line.productId,
      saleItemId: line.saleItemId,
      unitId: line.unitId,
    })),
    input.kind === "exchange" ? `Exchange return ${sale.saleNo}` : `Return ${sale.saleNo}`,
  );

  if (input.pricedReplacements?.length) {
    const exchangeItems = refund.exchangeItems ?? [];
    if (exchangeItems.length !== input.pricedReplacements.length) {
      throw new Error("Exchange replacement persistence did not match priced lines.");
    }
    await deductReplacementStock(
      tx,
      tenant,
      sale,
      input.pricedReplacements.map((item, index) => ({
        baseQuantity: amount(item.baseQuantity),
        productId: String(item.productId),
        sourceId: String(exchangeItems[index].id),
        unitId: item.unitId,
      })),
      `Exchange replacement ${sale.saleNo}`,
    );
    await recordReplacementPromotions(tx, {
      companyId: tenant.companyId,
      saleId: sale.id,
      saleItems: input.pricedReplacements as Array<{ promotionDiscount: number; promotionId?: string }>,
    });
  }

  await reverseReturnedPromotions(
    tx,
    sale,
    input.prepared.map((line) => ({ quantity: line.quantity, saleItem: line.saleItem })),
  );

  const reloadedForQty = await tx.sale.findFirstOrThrow({
    include: saleInclude(),
    where: { id: sale.id },
  });
  const remainingQty = (reloadedForQty.items ?? []).reduce((total: number, item: Record<string, any>) => {
    const returned = (reloadedForQty.refunds ?? []).reduce((sum: number, refund: Record<string, any>) => {
      return sum + (refund.items ?? [])
        .filter((row: Record<string, any>) => String(row.saleItemId) === String(item.id))
        .reduce((inner: number, row: Record<string, any>) => inner + amount(row.quantity), 0);
    }, 0);
    return total + Math.max(amount(item.quantity) - returned, 0);
  }, 0);
  const nextStatus = nextLifecycleSaleStatus(reloadedForQty, remainingQty);

  await reverseSaleLoyaltyPortion(tx, sale, {
    fullyReturned: remainingQty <= 1e-9,
    refundedAmountLak: remainingBySaleItem(reloadedForQty).returnedPaidTotal,
  });

  if (input.kind === "exchange" && sale.customerId && input.paymentAmountLak + input.returnValueLak > 0) {
    const settings = await tx.companySetting.findUnique({ where: { companyId: tenant.companyId } });
    await applyExchangeLoyaltyEarn(tx, {
      amountLak: amount(input.pricedReplacements?.reduce((total, item) => total + amount(item.totalAmount), 0)),
      companyId: tenant.companyId,
      customerId: String(sale.customerId),
      refundNo,
      saleId: sale.id,
      spendPerPointLak: Math.max(amount(settings?.loyaltySpendPerPointLak) || DEFAULT_LOYALTY_EARN_SPEND_LAK, 1),
    });
  }

  await tx.sale.update({
    data: {
      paymentStatus: nextStatus === "refunded" ? "refunded" : nextStatus === "exchanged" ? "exchanged" : "paid",
      saleStatus: nextStatus,
    },
    where: { id: sale.id },
  });

  return refund;
}

export async function returnPrismaSale(tenant: TenantContext, input: ReturnSaleInput): Promise<ReturnMutationResult> {
  const saleId = String(input.saleId).trim();
  if (!saleId) {
    throw new Error("Sale id is required.");
  }
  const preview = await getPrismaSaleById(tenant, saleId);
  if (!preview) {
    throw new Error("Sale was not found.");
  }

  if (!input.managerPinApproval) {
    const permission = await assertRefundPermission(tenant, preview.totalAmount);
    if (permission.pendingApproval) {
      const approval = await createApprovalRequest(
        {
          action: "refund_sale",
          amountLak: preview.totalAmount,
          branchId: preview.branchId,
          module: "pos",
          payload: { ...input, saleId },
          reason: permission.reason ?? "Return requires approval.",
          referenceId: saleId,
          ruleKey: "refund",
        },
        tenant,
      );
      return { approvalId: approval.id, sale: preview, status: "pending_approval" };
    }
  }

  return withTenantTransaction({
    action: "return",
    module: "pos",
    newData: { items: input.items, reason: input.reason, refundMethod: input.refundMethod, saleId },
    tenant,
    write: (tx) => writeReturnPrismaSale(tx, tenant, input),
  });
}

export async function writeReturnPrismaSale(
  tx: Record<string, any>,
  tenant: TenantContext,
  input: ReturnSaleInput,
): Promise<ReturnMutationResult> {
  const saleId = String(input.saleId).trim();
  await lockSaleForUpdate(tx, tenant, saleId);
  const sale = await loadMutableSale(tx, tenant, saleId);
  // Status + remaining qty first — before permission / cash-session checks.
  const { prepared, returnValueLak } = buildPreparedReturnLines(sale, input.items);
  if (!input.managerPinApproval) {
    const policy = await buildPosPolicyForTenant(tenant, tx);
    assertPosActionAllowed(policy, "refund_bill", { amountLak: amount(sale.totalAmount) });
  }
  const refundMethod = asMethod(input.refundMethod);
  const sessionId = await resolveCashSessionIdForReturnOrExchange(tenant, tx, {
    kind: "refund",
    paymentAmountLak: 0,
    refundAmountLak: returnValueLak,
    refundMethod,
  });
  const refund = await persistReturnOrExchange(tx, tenant, sale, {
    approvedBy: input.managerPinApproval?.approvedById ?? null,
    differenceLak: 0,
    kind: "refund",
    paymentAmountLak: 0,
    prepared,
    reason: input.reason ?? null,
    refundAmountLak: returnValueLak,
    refundMethod,
    returnValueLak,
    sessionId,
  });
  const cashierName = String(
    (await tx.user.findFirst({ select: { fullName: true, username: true }, where: { id: sale.createdBy } }))?.fullName
      ?? "Cashier",
  );
  const updated = await tx.sale.findFirstOrThrow({ include: saleInclude(), where: { id: sale.id } });
  return {
    receipt: await mapReturnReceipt(tx, refund, updated),
    refundId: String(refund.id),
    sale: mapSaleRow(updated, cashierName),
    status: "completed" as const,
  };
}

export async function exchangePrismaSale(tenant: TenantContext, input: ExchangeSaleInput): Promise<ReturnMutationResult> {
  const saleId = String(input.saleId).trim();
  if (!saleId) {
    throw new Error("Sale id is required.");
  }
  const preview = await getPrismaSaleById(tenant, saleId);
  if (!preview) {
    throw new Error("Sale was not found.");
  }
  if (!input.managerPinApproval) {
    const permission = await assertRefundPermission(tenant, preview.totalAmount);
    if (permission.pendingApproval) {
      const approval = await createApprovalRequest(
        {
          action: "refund_sale",
          amountLak: preview.totalAmount,
          branchId: preview.branchId,
          module: "pos",
          payload: { ...input, saleId },
          reason: permission.reason ?? "Exchange requires approval.",
          referenceId: saleId,
          ruleKey: "refund",
        },
        tenant,
      );
      return { approvalId: approval.id, sale: preview, status: "pending_approval" };
    }
  }

  return withTenantTransaction({
    action: "exchange",
    module: "pos",
    newData: {
      reason: input.reason,
      refundMethod: input.refundMethod,
      replacementItems: input.replacementItems,
      returnedItems: input.returnedItems,
      saleId,
    },
    tenant,
    write: (tx) => writeExchangePrismaSale(tx, tenant, input),
  });
}

export async function writeExchangePrismaSale(
  tx: Record<string, any>,
  tenant: TenantContext,
  input: ExchangeSaleInput,
): Promise<ReturnMutationResult> {
  const saleId = String(input.saleId).trim();
  await lockSaleForUpdate(tx, tenant, saleId);
  const sale = await loadMutableSale(tx, tenant, saleId);
  // Status + remaining qty first — before permission / cash-session checks.
  const { prepared, returnValueLak } = buildPreparedReturnLines(sale, input.returnedItems);
  const { priced, replacementTotalLak } = await priceReplacementItems(tx, tenant, sale, input.replacementItems);
  const differenceLak = roundLak(replacementTotalLak - returnValueLak);
  const paymentAmountLak = Math.max(differenceLak, 0);
  const refundAmountLak = Math.max(-differenceLak, 0);
  if (paymentAmountLak > 0 && amount(input.paidAmountLak) + 0.009 < paymentAmountLak) {
    throw new Error(`Additional payment of ${paymentAmountLak} LAK is required for this exchange.`);
  }
  if (!input.managerPinApproval) {
    const policy = await buildPosPolicyForTenant(tenant, tx);
    assertPosActionAllowed(policy, "refund_bill", { amountLak: amount(sale.totalAmount) });
  }
  const refundMethod = asMethod(input.refundMethod);
  const sessionId = await resolveCashSessionIdForReturnOrExchange(tenant, tx, {
    kind: "exchange",
    paymentAmountLak,
    refundAmountLak,
    refundMethod,
  });
  const refund = await persistReturnOrExchange(tx, tenant, sale, {
    approvedBy: input.managerPinApproval?.approvedById ?? null,
    differenceLak,
    exchangeReceiptNo: null,
    kind: "exchange",
    paymentAmountLak,
    prepared,
    pricedReplacements: priced,
    reason: input.reason ?? null,
    refundAmountLak,
    refundMethod,
    returnValueLak,
    sessionId,
  });
  const cashierName = String(
    (await tx.user.findFirst({ select: { fullName: true, username: true }, where: { id: sale.createdBy } }))?.fullName
      ?? "Cashier",
  );
  const updated = await tx.sale.findFirstOrThrow({ include: saleInclude(), where: { id: sale.id } });
  return {
    differenceLak,
    receipt: await mapReturnReceipt(tx, refund, updated),
    refundId: String(refund.id),
    sale: mapSaleRow(updated, cashierName),
    status: "completed" as const,
  };
}

export async function returnRemainingSaleCore(
  tx: Record<string, any>,
  tenant: TenantContext,
  sale: Record<string, any>,
  reason?: string | null,
  approvedBy?: string | null,
) {
  const snapshot = toReturnableSaleSnapshot(sale, "Cashier");
  const items = snapshot.items
    .filter((item) => item.remainingQuantity > 0)
    .map((item) => ({
      condition: "sellable" as const,
      quantity: item.remainingQuantity,
      saleItemId: item.id,
    }));
  if (items.length === 0) {
    throw new Error("Sale is already refunded.");
  }
  const { prepared, returnValueLak } = buildPreparedReturnLines(sale, items);
  const sessionId = await resolveCashSessionIdForReturnOrExchange(tenant, tx, {
    kind: "refund",
    paymentAmountLak: 0,
    refundAmountLak: returnValueLak,
    refundMethod: "cash",
  });
  await persistReturnOrExchange(tx, tenant, sale, {
    approvedBy: approvedBy ?? tenant.userId,
    differenceLak: 0,
    kind: "refund",
    paymentAmountLak: 0,
    prepared,
    reason: reason ?? null,
    refundAmountLak: returnValueLak,
    refundMethod: "cash",
    returnValueLak,
    sessionId,
  });
  return tx.sale.findFirstOrThrow({ include: saleInclude(), where: { id: sale.id } });
}
