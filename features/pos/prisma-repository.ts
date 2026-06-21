import { prisma } from "@/lib/db/prisma";
import { mapPrismaPosCustomer, mapPrismaPosProduct } from "@/features/pos/dto-mapper";
import { mapPaymentModeToSalePayments } from "@/features/pos/dto-mapper";
import { getPrismaPosQrBanks } from "@/features/qr-payments/prisma-repository";
import type { PaymentMode } from "@/features/pos/types";
import type { TenantContext } from "@/lib/db/write-context";
import { numberValue, stringValue, withTenantTransaction } from "@/lib/db/write-context";
import { assertBranchInScope, assertWarehouseInScope, branchOwnedWhere, resolveTenantScope } from "@/lib/db/tenant-scope";
import { getPrismaTaxAndLoyaltySettings } from "@/features/settings/prisma-repository";
import { applyAtomicStockDelta } from "@/features/inventory/stock-concurrency";
import {
  getNextPosSaleNoFromExisting,
  normalizeReceiptPrefix,
  parsePosSaleNoSequence,
} from "@/features/pos/sale-no";

const db = prisma as any;
const DEFAULT_LOYALTY_EARN_SPEND_LAK = 10_000;
const DEFAULT_LOYALTY_REDEMPTION_VALUE_LAK = 1_000;

function amount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getNextPosSaleNo(companyId: string, prefix: string | null | undefined, tx: any = db) {
  const normalizedPrefix = normalizeReceiptPrefix(prefix);
  const sales = await tx.sale.findMany({
    select: { saleNo: true },
    where: {
      companyId,
      saleNo: { startsWith: normalizedPrefix },
    },
  });

  return getNextPosSaleNoFromExisting(
    sales.map((sale: { saleNo: string }) => sale.saleNo),
    normalizedPrefix,
  );
}

async function resolvePosSaleNo(
  tx: any,
  companyId: string,
  requestedSaleNo: string,
  prefix: string | null | undefined,
) {
  const normalizedPrefix = normalizeReceiptPrefix(prefix);
  const trimmed = requestedSaleNo.trim();

  if (trimmed) {
    const sequence = parsePosSaleNoSequence(trimmed, normalizedPrefix);
    if (sequence !== null) {
      const existing = await tx.sale.findFirst({
        select: { id: true },
        where: { companyId, saleNo: trimmed },
      });
      if (!existing) {
        return trimmed;
      }
    }
  }

  return getNextPosSaleNo(companyId, normalizedPrefix, tx);
}

type SaleLine = {
  baseQuantity: number;
  costPrice: number;
  discountAmount: number;
  productId: string;
  profitAmount: number;
  promotionDiscount: number;
  promotionId?: string;
  quantity: number;
  sellingPrice: number;
  totalAmount: number;
  unitId?: string;
};

export async function getPrismaPosSnapshot(tenant: TenantContext) {
  const scope = await resolveTenantScope(tenant);
  const branchWhere = branchOwnedWhere(scope);
  const now = new Date();
  const [products, company, settings, customers, promotions, membershipLevels, cashSession] = await Promise.all([
    db.product.findMany({
      include: {
        balances: { where: { warehouseId: { in: scope.warehouseIds } } },
        category: true,
        units: true,
      },
      orderBy: { nameEn: "asc" },
      where: {
        companyId: scope.companyId,
        isActive: true,
        balances: { some: { warehouseId: { in: scope.warehouseIds } } },
      },
    }),
    db.company.findUnique({
      select: { name: true },
      where: { id: scope.companyId },
    }),
    db.companySetting.findUnique({
      where: { companyId: scope.companyId },
    }),
    db.customer.findMany({
      include: {
        membershipLevel: true,
        subscriptions: {
          orderBy: { endDate: "desc" },
          take: 1,
          where: { status: "active" },
        },
      },
      orderBy: { fullName: "asc" },
      where: { companyId: scope.companyId, status: "active", ...branchWhere },
    }),
    db.promotion.findMany({
      orderBy: [{ priority: "desc" }, { startDate: "desc" }],
      select: { description: true, promotionName: true },
      take: 8,
      where: {
        companyId: scope.companyId,
        endDate: { gte: now },
        isActive: true,
        startDate: { lte: now },
        status: "active",
      },
    }),
    db.membershipLevel.findMany({
      orderBy: { minSpendLak: "asc" },
      select: { discountPercent: true, id: true, name: true },
      where: { companyId: scope.companyId, isActive: true },
    }),
    db.cashSession.findFirst({
      orderBy: { openedAt: "desc" },
      where: {
        branchId: scope.branchId,
        cashierId: tenant.userId,
        closedAt: null,
        companyId: scope.companyId,
      },
    }),
  ]);
  const taxAndLoyalty = await getPrismaTaxAndLoyaltySettings(scope.companyId);
  const qrBanks = await getPrismaPosQrBanks(tenant, scope.branchId);
  const receiptPrefix = settings?.receiptPrefix ?? "INV";
  const nextSaleNo = await getNextPosSaleNo(scope.companyId, receiptPrefix);

  return {
    branchId: scope.branchId,
    branchName: scope.branchName,
    cashierName: "Current Cashier",
    cashSession: {
      openedAt: cashSession?.openedAt ? new Date(cashSession.openedAt).toISOString() : null,
      openingCashLak: amount(cashSession?.openingCash),
      sessionId: cashSession?.id ?? null,
      status: cashSession ? "open" as const : "not_started" as const,
    },
    companyName: company?.name ?? "Business",
    customers: customers.map(mapPrismaPosCustomer),
    loyaltySettings: {
      loyaltyEnabled: taxAndLoyalty.loyaltyEnabled,
      loyaltyMinRedeemPoints: taxAndLoyalty.loyaltyMinRedeemPoints,
      loyaltyPointValueLak: taxAndLoyalty.loyaltyPointValueLak,
      loyaltySpendPerPointLak: taxAndLoyalty.loyaltySpendPerPointLak,
    },
    membershipLevels: membershipLevels.map((level: Record<string, unknown>) => ({
      discountPercent: amount(level.discountPercent),
      id: String(level.id),
      name: String(level.name),
    })),
    products: products.map(mapPrismaPosProduct),
    promotionBanners: promotions
      .map((promotion: Record<string, unknown>) => String(promotion.promotionName || promotion.description || ""))
      .filter(Boolean),
    qrBanks,
    receiptSettings: {
      companyName: company?.name ?? "Business",
      receiptFooter: settings?.receiptFooter ?? undefined,
      receiptHeader: settings?.receiptHeader ?? undefined,
      receiptPrefix,
      showLogoOnReceipt: settings?.showLogoOnReceipt ?? true,
      showTaxOnReceipt: settings?.showTaxOnReceipt ?? true,
    },
    nextSaleNo,
    taxInclusive: taxAndLoyalty.taxInclusive,
    taxRatePercent: taxAndLoyalty.vatEnabled ? taxAndLoyalty.vatRate : 0,
    warehouseId: scope.warehouseId ?? "",
  };
}

export async function completePrismaSale(input: {
  branchId: string;
  cardAmount?: number;
  cashAmount: number;
  changeAmount: number;
  customerId?: string;
  discountAmount: number;
  discountPercent: number;
  items: Array<{ conversionQty?: number; costPrice?: number; productId: string; promotionDiscount?: number; promotionId?: string; quantity: number; sellingPrice: number; unitId?: string }>;
  paymentMode: PaymentMode;
  qrAmount: number;
  redeemPoints?: number;
  saleNo: string;
  taxAmount: number;
  taxRate: number;
  totalAmount: number;
  transferAmount?: number;
  warehouseId: string;
}, tenant: TenantContext) {
  return withTenantTransaction({
    action: "complete",
    module: "pos",
    newData: input,
    tenant,
    write: async (tx) => {
      const [branchScope, warehouseScope] = await Promise.all([
        assertBranchInScope(tx, tenant, input.branchId),
        assertWarehouseInScope(tx, tenant, input.warehouseId),
      ]);
      if (branchScope.branchId !== warehouseScope.branchId) {
        throw new Error("POS branch and warehouse scopes do not match.");
      }
      const settings = await tx.companySetting.findUnique({ where: { companyId: tenant.companyId } });
      const receiptPrefix = settings?.receiptPrefix ?? "INV";
      const saleNo = await resolvePosSaleNo(tx, tenant.companyId, input.saleNo, receiptPrefix);
      const vatRate = settings?.vatEnabled ? numberValue(settings.vatRate) : 0;
      const taxInclusive = Boolean(settings?.taxInclusive);
      const loyaltyEnabled = settings?.loyaltyEnabled ?? true;
      const loyaltySpendPerPointLak = Math.max(numberValue(settings?.loyaltySpendPerPointLak, DEFAULT_LOYALTY_EARN_SPEND_LAK), 1);
      const loyaltyPointValueLak = Math.max(numberValue(settings?.loyaltyPointValueLak, DEFAULT_LOYALTY_REDEMPTION_VALUE_LAK), 0);
      const loyaltyMinRedeemPoints = Math.max(Math.floor(numberValue(settings?.loyaltyMinRedeemPoints, 1)), 1);

      const rawSaleItems = input.items.map((item) => {
        const quantity = numberValue(item.quantity);
        const conversionQty = Math.max(numberValue(item.conversionQty, 1), 1);
        const sellingPrice = numberValue(item.sellingPrice);
        const costPrice = numberValue(item.costPrice);

        if (quantity <= 0) {
          throw new Error(`Sale quantity must be greater than zero for product ${item.productId}.`);
        }

        return {
          baseQuantity: quantity * conversionQty,
          costPrice,
          discountAmount: 0,
          productId: item.productId,
          profitAmount: quantity * sellingPrice - costPrice * quantity,
          promotionDiscount: 0,
          promotionId: undefined,
          quantity,
          sellingPrice,
          totalAmount: quantity * sellingPrice,
          unitId: item.unitId,
        };
      });
      const saleItems = await applyActivePromotions(tx, rawSaleItems, input.customerId, tenant.companyId);
      const subtotal = saleItems.reduce((total, item) => total + item.quantity * item.sellingPrice, 0);
      const promotionDiscountAmount = saleItems.reduce((total, item) => total + item.promotionDiscount, 0);
      const manualDiscountAmount = Math.min(
        Math.max(subtotal - promotionDiscountAmount, 0),
        numberValue(input.discountAmount) + subtotal * numberValue(input.discountPercent) / 100,
      );
      const loyaltyRedemption = await calculateLoyaltyRedemption(tx, {
        companyId: tenant.companyId,
        customerId: input.customerId,
        enabled: loyaltyEnabled,
        minRedeemPoints: loyaltyMinRedeemPoints,
        pointValueLak: loyaltyPointValueLak,
        redeemableAmountLak: Math.max(subtotal - promotionDiscountAmount - manualDiscountAmount, 0),
        redeemPoints: input.redeemPoints,
      });
      const discountAmount = promotionDiscountAmount + manualDiscountAmount + loyaltyRedemption.discountAmountLak;
      const taxableAmount = Math.max(subtotal - discountAmount, 0);
      const taxRate = vatRate;
      const taxAmount = taxRate > 0
        ? taxInclusive
          ? taxableAmount * taxRate / (100 + taxRate)
          : taxableAmount * taxRate / 100
        : 0;
      const totalAmount = taxInclusive ? taxableAmount : taxableAmount + taxAmount;
      const earnedPoints = loyaltyRedemption.customer
        ? Math.floor(totalAmount / loyaltySpendPerPointLak)
        : 0;

      const quantityByProduct = saleItems.reduce<Map<string, number>>((totals, item) => {
        totals.set(item.productId, (totals.get(item.productId) ?? 0) + item.baseQuantity);
        return totals;
      }, new Map());
      const saleItemCreateData = saleItems.map(({ baseQuantity: _baseQuantity, ...item }) => item);

      const sale = await tx.sale.create({
        data: {
          branchId: input.branchId,
          changeAmount: numberValue(input.changeAmount),
          companyId: tenant.companyId,
          createdBy: tenant.userId,
          customerId: input.customerId,
          discountPercent: subtotal > 0 ? discountAmount / subtotal * 100 : numberValue(input.discountPercent),
          discountAmount,
          items: { create: saleItemCreateData },
          payments: {
            create: mapPaymentModeToSalePayments({
              cashAmount: numberValue(input.cashAmount),
              cardAmount: numberValue(input.cardAmount),
              changeAmount: numberValue(input.changeAmount),
              paymentMode: input.paymentMode,
              qrAmount: numberValue(input.qrAmount),
              transferAmount: numberValue(input.transferAmount),
            }),
          },
          paymentStatus: "paid",
          profitAmount: saleItems.reduce((total, item) => total + item.profitAmount, 0) - manualDiscountAmount - loyaltyRedemption.discountAmountLak,
          saleNo,
          saleStatus: "completed",
          subtotal,
          taxAmount,
          taxRate,
          totalAmount,
          warehouseId: input.warehouseId,
        },
        include: { items: true, payments: true },
      });

      const runningQtyByProduct = new Map<string, number>();

      for (const [productId, requestedQty] of quantityByProduct) {
        const balance = await applyAtomicStockDelta(tx, {
          companyId: tenant.companyId,
          productId,
          quantityDelta: -requestedQty,
          warehouseId: input.warehouseId,
        });

        runningQtyByProduct.set(productId, balance.beforeQty);
      }

      for (const item of saleItems) {
        const beforeQty = runningQtyByProduct.get(item.productId) ?? 0;
        const afterQty = beforeQty - item.baseQuantity;

        if (afterQty < 0) {
          throw new Error(`Insufficient stock for product ${item.productId}. Available ${beforeQty}, requested ${item.baseQuantity}.`);
        }

        await tx.stockMovement.create({
          data: {
            afterQty,
            beforeQty,
            companyId: tenant.companyId,
            createdBy: tenant.userId,
            movementType: "sale",
            note: `POS sale ${sale.saleNo}`,
            productId: item.productId,
            quantity: -item.baseQuantity,
            referenceId: sale.id,
            referenceType: "sale",
            unitId: item.unitId,
            warehouseId: input.warehouseId,
          },
        });

        runningQtyByProduct.set(item.productId, afterQty);
      }

      const discountByPromotion = saleItems.reduce<Map<string, number>>((totals, item) => {
        if (item.promotionId && item.promotionDiscount > 0) {
          totals.set(item.promotionId, (totals.get(item.promotionId) ?? 0) + item.promotionDiscount);
        }
        return totals;
      }, new Map());

      for (const [promotionId, discountLak] of discountByPromotion) {
        await tx.promotionUsage.create({
          data: {
            companyId: tenant.companyId,
            discountAmountLak: discountLak,
            promotionId,
            saleId: sale.id,
          },
        });

        await tx.promotion.update({
          data: {
            totalDiscountLak: { increment: discountLak },
            usageCount: { increment: 1 },
          },
          where: { id: promotionId },
        });
      }

      if (loyaltyRedemption.customer) {
        await applyLoyaltyLedger(tx, {
          companyId: tenant.companyId,
          customerId: loyaltyRedemption.customer.id,
          earnedPoints,
          redeemDiscountLak: loyaltyRedemption.discountAmountLak,
          redeemPoints: loyaltyRedemption.redeemPoints,
          saleId: sale.id,
          saleNo: sale.saleNo,
          totalAmountLak: totalAmount,
        });
      }

      return sale;
    },
  });
}

async function calculateLoyaltyRedemption(
  tx: any,
  input: {
    companyId: string;
    customerId?: string;
    enabled: boolean;
    minRedeemPoints: number;
    pointValueLak: number;
    redeemableAmountLak: number;
    redeemPoints?: number;
  },
) {
  const redeemPoints = Math.max(Math.floor(numberValue(input.redeemPoints)), 0);

  if (!input.enabled) {
    if (redeemPoints > 0) {
      throw new Error("Loyalty point redemption is disabled.");
    }

    return { customer: null, discountAmountLak: 0, redeemPoints: 0 };
  }

  if (!input.customerId) {
    if (redeemPoints > 0) {
      throw new Error("A customer is required to redeem loyalty points.");
    }

    return { customer: null, discountAmountLak: 0, redeemPoints: 0 };
  }

  const customer = await tx.customer.findFirst({
    select: { id: true, pointsBalance: true, status: true },
    where: { companyId: input.companyId, id: input.customerId, status: "active" },
  });

  if (!customer) {
    throw new Error("Active customer was not found for loyalty points.");
  }

  if (redeemPoints <= 0) {
    return { customer, discountAmountLak: 0, redeemPoints: 0 };
  }

  if (redeemPoints < input.minRedeemPoints) {
    throw new Error(`Minimum redeem points is ${input.minRedeemPoints}.`);
  }

  const currentBalance = Number(customer.pointsBalance ?? 0);
  if (currentBalance < redeemPoints) {
    throw new Error(`Insufficient loyalty points. Available ${currentBalance}, requested ${redeemPoints}.`);
  }

  const maxRedeemablePoints = input.pointValueLak > 0 ? Math.floor(input.redeemableAmountLak / input.pointValueLak) : 0;
  if (redeemPoints > maxRedeemablePoints) {
    throw new Error(`Redeem points exceed sale amount. Maximum redeemable points ${maxRedeemablePoints}.`);
  }

  return {
    customer,
    discountAmountLak: redeemPoints * input.pointValueLak,
    redeemPoints,
  };
}

async function applyLoyaltyLedger(
  tx: any,
  input: {
    companyId: string;
    customerId: string;
    earnedPoints: number;
    redeemDiscountLak: number;
    redeemPoints: number;
    saleId: string;
    saleNo: string;
    totalAmountLak: number;
  },
) {
  if (input.redeemPoints > 0) {
    await tx.loyaltyPointLedger.create({
      data: {
        amountLak: input.redeemDiscountLak,
        companyId: input.companyId,
        customerId: input.customerId,
        note: `Redeemed on POS sale ${input.saleNo}`,
        pointType: "redeem",
        points: -input.redeemPoints,
        saleId: input.saleId,
      },
    });
  }

  if (input.earnedPoints > 0) {
    await tx.loyaltyPointLedger.create({
      data: {
        amountLak: input.totalAmountLak,
        companyId: input.companyId,
        customerId: input.customerId,
        note: `Earned from POS sale ${input.saleNo}`,
        pointType: "earn",
        points: input.earnedPoints,
        saleId: input.saleId,
      },
    });
  }

  await tx.customer.update({
    data: {
      pointsBalance: { increment: input.earnedPoints - input.redeemPoints },
      totalSpent: { increment: input.totalAmountLak },
    },
    where: { id: input.customerId },
  });
}

async function applyActivePromotions(tx: any, items: SaleLine[], customerId: string | undefined, companyId: string) {
  const now = new Date();
  const productIds = items.map((item) => item.productId);
  const [products, customer] = await Promise.all([
    tx.product.findMany({
      select: { categoryId: true, id: true },
      where: { companyId, id: { in: productIds } },
    }),
    customerId
      ? tx.customer.findFirst({ select: { membershipLevelId: true }, where: { companyId, id: customerId } })
      : Promise.resolve(null),
  ]);
  const categoryByProduct = new Map<string, string | null>(
    products.map((product: Record<string, any>) => [product.id, product.categoryId ?? null]),
  );
  const categoryIds = Array.from(new Set(products.map((product: Record<string, any>) => product.categoryId).filter(Boolean)));
  const promotions = await tx.promotion.findMany({
    include: {
      categories: true,
      membershipLevels: true,
      products: true,
    },
    orderBy: [{ priority: "desc" }, { startDate: "desc" }],
    where: {
      companyId,
      endDate: { gte: now },
      isActive: true,
      OR: [
        { products: { some: { productId: { in: productIds } } } },
        { categories: { some: { categoryId: { in: categoryIds } } } },
        { products: { none: {} }, categories: { none: {} } },
      ],
      startDate: { lte: now },
      status: "active",
    },
  });

  return items.map((item) => {
    const lineSubtotal = item.quantity * item.sellingPrice;
    const best = (promotions as Array<Record<string, any>>).reduce((current: { discount: number; promotionId?: string }, promotion) => {
      if (!isPromotionEligibleForLine(promotion, item.productId, categoryByProduct.get(item.productId), customer?.membershipLevelId)) {
        return current;
      }

      const discount = calculatePromotionDiscount(promotion, item.quantity, item.sellingPrice, lineSubtotal);
      return discount > current.discount ? { discount, promotionId: promotion.id } : current;
    }, { discount: 0 });
    const promotionDiscount = Math.min(best.discount, lineSubtotal);
    const totalAmount = lineSubtotal - promotionDiscount;

    return {
      ...item,
      discountAmount: promotionDiscount,
      profitAmount: totalAmount - item.costPrice * item.quantity,
      promotionDiscount,
      promotionId: best.promotionId,
      totalAmount,
    };
  });
}

function isPromotionEligibleForLine(
  promotion: Record<string, any>,
  productId: string,
  categoryId: string | null | undefined,
  membershipLevelId: string | null | undefined,
) {
  const productTargets = promotion.products ?? [];
  const categoryTargets = promotion.categories ?? [];
  const membershipTargets = promotion.membershipLevels ?? [];
  const productMatch = productTargets.length === 0 || productTargets.some((target: Record<string, any>) => target.productId === productId);
  const categoryMatch = categoryTargets.length === 0 || categoryTargets.some((target: Record<string, any>) => target.categoryId === categoryId);
  const membershipMatch =
    membershipTargets.length === 0 ||
    !membershipLevelId ||
    membershipTargets.some((target: Record<string, any>) => target.membershipLevelId === membershipLevelId);

  return productMatch && categoryMatch && membershipMatch;
}

function calculatePromotionDiscount(promotion: Record<string, any>, quantity: number, sellingPrice: number, lineSubtotal: number) {
  switch (promotion.promotionType) {
    case "percentage":
    case "member_discount":
      return lineSubtotal * numberValue(promotion.discountPercent) / 100;
    case "fixed_amount":
      return Math.min(numberValue(promotion.discountAmountLak), lineSubtotal);
    case "buy_x_get_y": {
      const buyQuantity = Math.max(Number(promotion.buyQuantity ?? 0), 0);
      const getQuantity = Math.max(Number(promotion.getQuantity ?? 0), 0);
      if (buyQuantity <= 0 || getQuantity <= 0) return 0;
      const freeQuantity = Math.floor(quantity / (buyQuantity + getQuantity)) * getQuantity;
      return freeQuantity * sellingPrice;
    }
    default:
      return 0;
  }
}
