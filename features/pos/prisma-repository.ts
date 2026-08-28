import { assertOpenCashSessionForSale, getOpenCashSession } from "@/features/cash-sessions/prisma-repository";
import { mapPrismaPosCustomer, mapPrismaPosProduct } from "@/features/pos/dto-mapper";
import { mapPaymentModeToSalePayments } from "@/features/pos/dto-mapper";
import { getPrismaPosQrBanks } from "@/features/qr-payments/prisma-repository";
import type { PaymentMode } from "@/features/pos/types";
import { prisma } from "@/lib/db/prisma";
import type { TenantContext } from "@/lib/db/write-context";
import { numberValue, stringValue, withTenantTransaction } from "@/lib/db/write-context";
import { assertBranchInScope, assertWarehouseInScope, branchOwnedWhere, resolveTenantScope } from "@/lib/db/tenant-scope";
import { getPrismaTaxAndLoyaltySettings } from "@/features/settings/prisma-repository";
import { applyAtomicStockDelta, lockInventoryMutationKey } from "@/features/inventory/stock-concurrency";
import {
  consumeInventoryForSale,
  inventoryLotLockKey,
  LOT_ALLOCATION_SOURCE,
  primaryLotMovementFields,
} from "@/features/inventory/lot-reconciliation";
import { assertPosActionAllowed, buildPosPolicyForTenant } from "@/features/pos/pos-permission-guard";
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

// Safe rounding tolerance for money comparisons (LAK is a 0-decimal currency).
const CHECKOUT_TOLERANCE_LAK = 1;

// Resolve the authoritative DB sale unit for a line. The client only supplies a
// unitId hint; price/cost/conversion always come from the database, never trusted
// client values (B8-1).
function resolveSaleUnit(product: Record<string, any>, unitId: string | undefined) {
  const units: Array<Record<string, any>> = product.units ?? [];
  if (unitId) {
    const found = units.find((unit) => unit.id === unitId);
    if (!found) {
      throw new Error(`Sale unit ${unitId} was not found for product ${product.id}.`);
    }
    if (found.status === "inactive") {
      throw new Error(`Sale unit ${unitId} is inactive for product ${product.id}.`);
    }
    return found;
  }
  const active = units.filter((unit) => unit.status !== "inactive");
  const fallback =
    active.find((unit) => unit.isDefaultSaleUnit) ??
    active.find((unit) => unit.isBaseUnit) ??
    active[0];
  if (!fallback) {
    throw new Error(`Product ${product.id} has no active sale unit.`);
  }
  return fallback;
}

import {
  applyLoyaltyLedger,
  calculateLoyaltyRedemption,
  isMembershipEligibleForBenefits,
  resolveMembershipDiscountPercent,
} from "@/features/loyalty/loyalty-service";
import {
  applyActivePromotions,
  assertPromotionProfitSafe,
  recordPromotionUsage,
  rejectClientPromotionClaims,
} from "@/features/promotions/promotion-checkout";

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

export async function listSellablePosProducts(tenant: TenantContext, client: any = db) {
  const scope = await resolveTenantScope(tenant, client);
  const sellWarehouseIds = scope.warehouseId ? [scope.warehouseId] : scope.warehouseIds;
  const products = await client.product.findMany({
    include: {
      balances: { where: { warehouseId: { in: sellWarehouseIds } } },
      category: true,
      units: true,
    },
    orderBy: { nameEn: "asc" },
    where: {
      companyId: scope.companyId,
      isActive: true,
      balances: { some: { warehouseId: { in: sellWarehouseIds } } },
    },
  });
  return products.map((product: Record<string, any>) => mapPrismaPosProduct(product, scope.warehouseId));
}

export async function getPrismaPosSnapshot(tenant: TenantContext) {
  const scope = await resolveTenantScope(tenant);
  const branchWhere = branchOwnedWhere(scope);
  const sellWarehouseIds = scope.warehouseId ? [scope.warehouseId] : scope.warehouseIds;
  const now = new Date();
  const [products, company, settings, customers, promotions, membershipLevels] = await Promise.all([
    db.product.findMany({
      include: {
        balances: { where: { warehouseId: { in: sellWarehouseIds } } },
        category: true,
        units: true,
      },
      orderBy: { nameEn: "asc" },
      where: {
        companyId: scope.companyId,
        isActive: true,
        balances: { some: { warehouseId: { in: sellWarehouseIds } } },
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
      include: {
        categories: { select: { categoryId: true } },
        membershipLevels: { select: { membershipLevelId: true } },
        products: { select: { productId: true } },
      },
      orderBy: [{ priority: "desc" }, { startDate: "desc" }, { id: "asc" }],
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
  ]);
  const openSession = await getOpenCashSession(tenant);
  const taxAndLoyalty = await getPrismaTaxAndLoyaltySettings(scope.companyId);
  const qrBanks = await getPrismaPosQrBanks(tenant, scope.branchId);
  const receiptPrefix = settings?.receiptPrefix ?? "INV";
  const nextSaleNo = await getNextPosSaleNo(scope.companyId, receiptPrefix);

  return {
    branchId: scope.branchId,
    branchName: scope.branchName,
    cashierName: "Current Cashier",
    cashSession: openSession
      ? {
          cashInLak: openSession.cashInLak,
          cashOutLak: openSession.cashOutLak,
          cashSalesLak: openSession.cashSalesLak,
          expectedCashLak: openSession.expectedCashLak,
          nonCashSalesLak: openSession.nonCashSalesLak,
          openedAt: openSession.openedAt,
          openingCashLak: openSession.openingCashLak,
          sessionId: openSession.id,
          status: "open" as const,
        }
      : {
          cashInLak: 0,
          cashOutLak: 0,
          cashSalesLak: 0,
          expectedCashLak: 0,
          nonCashSalesLak: 0,
          openedAt: null,
          openingCashLak: 0,
          sessionId: null,
          status: "not_started" as const,
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
    products: products.map((product: Record<string, any>) => mapPrismaPosProduct(product, scope.warehouseId)),
    promotionBanners: promotions
      .map((promotion: Record<string, unknown>) => String(promotion.promotionName || promotion.description || ""))
      .filter(Boolean),
    promotions: promotions.map((promotion: Record<string, any>) => ({
      buyQuantity: promotion.buyQuantity == null ? undefined : Number(promotion.buyQuantity),
      categories: (promotion.categories ?? []).map((entry: { categoryId: string }) => ({ categoryId: entry.categoryId })),
      comboPriceLak: promotion.comboPriceLak == null ? undefined : Number(promotion.comboPriceLak),
      discountAmountLak: promotion.discountAmountLak == null ? undefined : Number(promotion.discountAmountLak),
      discountPercent: promotion.discountPercent == null ? undefined : Number(promotion.discountPercent),
      endDate: promotion.endDate instanceof Date ? promotion.endDate.toISOString() : String(promotion.endDate ?? ""),
      getQuantity: promotion.getQuantity == null ? undefined : Number(promotion.getQuantity),
      id: String(promotion.id),
      isActive: promotion.isActive !== false,
      membershipLevels: (promotion.membershipLevels ?? []).map((entry: { membershipLevelId: string }) => ({
        membershipLevelId: entry.membershipLevelId,
      })),
      priority: Number(promotion.priority ?? 0),
      products: (promotion.products ?? []).map((entry: { productId: string }) => ({ productId: entry.productId })),
      promotionCode: promotion.promotionCode ?? null,
      promotionName: String(promotion.promotionName ?? ""),
      promotionType: String(promotion.promotionType ?? "percentage"),
      startDate: promotion.startDate instanceof Date ? promotion.startDate.toISOString() : String(promotion.startDate ?? ""),
      status: String(promotion.status ?? "active"),
    })),
    qrBanks,
    receiptSettings: {
      companyName: company?.name ?? "Business",
      profileAddress: settings?.profileAddress ?? undefined,
      profileEmail: settings?.profileEmail ?? undefined,
      profilePhone: settings?.profilePhone ?? undefined,
      receiptFooter: settings?.receiptFooter ?? undefined,
      receiptHeader: settings?.receiptHeader ?? undefined,
      receiptPrintMode: settings?.receiptPrintMode ?? "ask_every_time",
      receiptPrefix,
      showLogoOnReceipt: settings?.showLogoOnReceipt ?? true,
      showTaxOnReceipt: settings?.showTaxOnReceipt ?? true,
      taxNumber: settings?.taxNumber ?? undefined,
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
  promotionCodes?: string[];
  qrAmount: number;
  redeemPoints?: number;
  saleNo: string;
  taxAmount: number;
  taxRate: number;
  totalAmount: number;
  transferAmount?: number;
  warehouseId: string;
}, tenant: TenantContext) {
  // B8-3: resolve the acting user's authoritative POS policy from live DB role
  // permissions and enforce create_sale server-side (never trust the client gate).
  const posPolicy = await buildPosPolicyForTenant(tenant);
  assertPosActionAllowed(posPolicy, "create_sale");

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
      await assertOpenCashSessionForSale(tenant, tx);
      rejectClientPromotionClaims(input.items);
      const settings = await tx.companySetting.findUnique({ where: { companyId: tenant.companyId } });
      const receiptPrefix = settings?.receiptPrefix ?? "INV";
      const saleNo = await resolvePosSaleNo(tx, tenant.companyId, input.saleNo, receiptPrefix);
      const vatRate = settings?.vatEnabled ? numberValue(settings.vatRate) : 0;
      const taxInclusive = Boolean(settings?.taxInclusive);
      const loyaltyEnabled = settings?.loyaltyEnabled ?? true;
      const loyaltySpendPerPointLak = Math.max(numberValue(settings?.loyaltySpendPerPointLak, DEFAULT_LOYALTY_EARN_SPEND_LAK), 1);
      const loyaltyPointValueLak = Math.max(numberValue(settings?.loyaltyPointValueLak, DEFAULT_LOYALTY_REDEMPTION_VALUE_LAK), 0);
      const loyaltyMinRedeemPoints = Math.max(Math.floor(numberValue(settings?.loyaltyMinRedeemPoints, 1)), 1);

      if (!Array.isArray(input.items) || input.items.length === 0) {
        throw new Error("A sale must contain at least one item.");
      }

      // DB-authoritative pricing (B8-1): fetch live products/units and the customer
      // membership so price, cost, unit conversion, and membership discount are
      // sourced from PostgreSQL, never trusted from the client payload.
      const productIds = Array.from(new Set(input.items.map((item) => item.productId)));
      const [products, customerRecord] = await Promise.all([
        tx.product.findMany({
          include: { units: true },
          where: { companyId: tenant.companyId, id: { in: productIds }, isActive: true },
        }),
        input.customerId
          ? tx.customer.findFirst({
              include: {
                membershipLevel: { select: { discountPercent: true } },
                subscriptions: {
                  orderBy: { endDate: "desc" },
                  take: 1,
                  where: { status: "active" },
                },
              },
              where: { companyId: tenant.companyId, id: input.customerId },
            })
          : Promise.resolve(null),
      ]);
      const productMap = new Map<string, Record<string, any>>(
        (products as Array<Record<string, any>>).map((product) => [product.id, product]),
      );
      const membershipDiscountPercent = resolveMembershipDiscountPercent(customerRecord);
      const categoryByProduct = new Map<string, string | null>(
        (products as Array<Record<string, any>>).map((product) => [product.id, product.categoryId ?? null]),
      );

      const rawSaleItems = input.items.map((item) => {
        const product = productMap.get(item.productId);
        if (!product) {
          throw new Error(`Product ${item.productId} was not found or is inactive.`);
        }

        const quantity = numberValue(item.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new Error(`Sale quantity must be greater than zero for product ${item.productId}.`);
        }

        const unit = resolveSaleUnit(product, item.unitId);
        const conversionQty = Math.max(numberValue(unit.conversionQty, 1), 1);
        const retailPrice = numberValue(unit.sellingPriceLak ?? product.sellingPriceLak);
        if (retailPrice < 0) {
          throw new Error(`Invalid selling price for product ${item.productId}.`);
        }
        const costPrice = numberValue(unit.costPriceLak ?? product.costPriceLak);
        const sellingPrice = membershipDiscountPercent > 0
          ? Math.round(retailPrice * (1 - membershipDiscountPercent / 100))
          : retailPrice;

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
          unitId: unit.id,
        };
      });
      const saleItems = await applyActivePromotions(tx, rawSaleItems, {
        appliedPromotionCodes: input.promotionCodes,
        allowStacking: false,
        blockBelowCostSales: true,
        categoryByProduct,
        companyId: tenant.companyId,
        membershipLevelId: isMembershipEligibleForBenefits(customerRecord)
          ? String((customerRecord as Record<string, any> | null)?.membershipLevelId ?? "") || null
          : null,
      });
      assertPromotionProfitSafe(saleItems, true);
      const subtotal = saleItems.reduce((total, item) => total + item.quantity * item.sellingPrice, 0);
      const promotionDiscountAmount = saleItems.reduce((total, item) => total + item.promotionDiscount, 0);

      const requestedDiscountAmount = numberValue(input.discountAmount);
      const requestedDiscountPercent = numberValue(input.discountPercent);
      if (requestedDiscountAmount < 0 || requestedDiscountPercent < 0) {
        throw new Error("Discount cannot be negative.");
      }
      if (requestedDiscountPercent > 100) {
        throw new Error("Discount percent cannot exceed 100.");
      }
      const manualDiscountAmount = Math.min(
        Math.max(subtotal - promotionDiscountAmount, 0),
        requestedDiscountAmount + subtotal * requestedDiscountPercent / 100,
      );

      // B8-3: a manual (non-promotional) discount on the sale requires the
      // apply_discount permission, and the effective discount must be within the
      // user's role limit. Over-limit discounts are rejected server-side (there is
      // no approved-decision token in a live checkout payload).
      if (manualDiscountAmount > 0 || requestedDiscountAmount > 0 || requestedDiscountPercent > 0) {
        const effectiveDiscountPercent = subtotal > 0 ? manualDiscountAmount / subtotal * 100 : requestedDiscountPercent;
        assertPosActionAllowed(posPolicy, "apply_discount", { discountPercent: effectiveDiscountPercent });
      }
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
      if (!Number.isFinite(totalAmount) || totalAmount < 0) {
        throw new Error("Computed sale total is invalid.");
      }
      const earnedPoints = loyaltyRedemption.customer
        ? Math.floor(totalAmount / loyaltySpendPerPointLak)
        : 0;

      // Server total is authoritative. A client total below the server total beyond
      // the rounding tolerance indicates tampering/divergence and is rejected so the
      // customer can never be charged less than the DB-computed price (B8-1).
      const clientTotal = numberValue(input.totalAmount);
      if (clientTotal + CHECKOUT_TOLERANCE_LAK < totalAmount) {
        throw new Error(
          `Checkout total mismatch: client ${clientTotal} is below server total ${totalAmount}.`,
        );
      }

      // Payment validation (B8-1): tender amounts may be entered by the cashier, but
      // they must be non-negative and cover the authoritative total. Change is always
      // recomputed on the server; the client value is ignored.
      const cashAmount = numberValue(input.cashAmount);
      const cardAmount = numberValue(input.cardAmount);
      const qrAmount = numberValue(input.qrAmount);
      const transferAmount = numberValue(input.transferAmount);
      if ([cashAmount, cardAmount, qrAmount, transferAmount].some((value) => value < 0)) {
        throw new Error("Payment amounts cannot be negative.");
      }
      const paidAmount = cashAmount + cardAmount + qrAmount + transferAmount;
      if (paidAmount + CHECKOUT_TOLERANCE_LAK < totalAmount) {
        throw new Error(`Insufficient payment. Paid ${paidAmount}, required ${totalAmount}.`);
      }
      const changeAmount = Math.max(paidAmount - totalAmount, 0);

      const quantityByProduct = saleItems.reduce<Map<string, number>>((totals, item) => {
        totals.set(item.productId, (totals.get(item.productId) ?? 0) + item.baseQuantity);
        return totals;
      }, new Map());
      const saleItemCreateData = saleItems.map(({ baseQuantity: _baseQuantity, ...item }) => item);

      const sale = await tx.sale.create({
        data: {
          branchId: input.branchId,
          changeAmount,
          companyId: tenant.companyId,
          createdBy: tenant.userId,
          customerId: input.customerId,
          discountPercent: subtotal > 0 ? discountAmount / subtotal * 100 : requestedDiscountPercent,
          discountAmount,
          items: { create: saleItemCreateData },
          payments: {
            create: mapPaymentModeToSalePayments({
              cashAmount,
              cardAmount,
              changeAmount,
              paymentMode: input.paymentMode,
              qrAmount,
              transferAmount,
            }),
          },
          paymentStatus: "paid",
          profitAmount: saleItems.reduce((total, item) => total + item.profitAmount, 0) - manualDiscountAmount - loyaltyRedemption.discountAmountLak,
          receiptNo: `RCPT-${saleNo}`,
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
        await lockInventoryMutationKey(
          tx,
          inventoryLotLockKey(tenant.companyId, input.warehouseId, productId),
        );
        const balance = await applyAtomicStockDelta(tx, {
          companyId: tenant.companyId,
          productId,
          quantityDelta: -requestedQty,
          warehouseId: input.warehouseId,
        });

        runningQtyByProduct.set(productId, balance.beforeQty);
      }

      if (sale.items.length !== saleItems.length) {
        throw new Error("Sale item persistence did not match checkout lines.");
      }

      for (let index = 0; index < saleItems.length; index += 1) {
        const item = saleItems[index];
        const saleItem = sale.items[index];
        const beforeQty = runningQtyByProduct.get(item.productId) ?? 0;
        const afterQty = beforeQty - item.baseQuantity;

        if (afterQty < 0) {
          throw new Error(`Insufficient stock for product ${item.productId}. Available ${beforeQty}, requested ${item.baseQuantity}.`);
        }

        const allocations = await consumeInventoryForSale(tx, {
          companyId: tenant.companyId,
          productId: item.productId,
          quantity: item.baseQuantity,
          sourceId: String(saleItem.id),
          sourceType: LOT_ALLOCATION_SOURCE.saleItem,
          warehouseId: input.warehouseId,
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

      await recordPromotionUsage(tx, {
        companyId: tenant.companyId,
        saleId: sale.id,
        saleItems,
      });

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
