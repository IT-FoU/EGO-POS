export type PromotionSaleLine = {
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

export type PromotionApplicationContext = {
  appliedPromotionCodes?: string[];
  allowStacking?: boolean;
  blockBelowCostSales?: boolean;
  categoryByProduct: Map<string, string | null>;
  companyId: string;
  membershipLevelId: string | null;
};

function amount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isPromotionScheduleActive(promotion: Record<string, any>, now = new Date()) {
  if (promotion.isActive === false) {
    return false;
  }
  if (String(promotion.status) !== "active") {
    return false;
  }
  const start = promotion.startDate ? new Date(promotion.startDate).getTime() : 0;
  const end = promotion.endDate ? new Date(promotion.endDate).getTime() : Number.POSITIVE_INFINITY;
  const nowMs = now.getTime();
  return start <= nowMs && nowMs <= end;
}

export function isPromotionCouponSatisfied(promotion: Record<string, any>, appliedPromotionCodes: string[] | undefined) {
  const code = String(promotion.promotionCode ?? "").trim();
  if (!code) {
    return true;
  }
  return (appliedPromotionCodes ?? []).some((entry) => String(entry).trim() === code);
}

export function isPromotionEligibleForLine(
  promotion: Record<string, any>,
  productId: string,
  categoryId: string | null | undefined,
  membershipLevelId: string | null | undefined,
  options?: { appliedPromotionCodes?: string[] },
) {
  if (!isPromotionScheduleActive(promotion)) {
    return false;
  }
  if (!isPromotionCouponSatisfied(promotion, options?.appliedPromotionCodes)) {
    return false;
  }

  const productTargets = promotion.products ?? [];
  const categoryTargets = promotion.categories ?? [];
  const membershipTargets = promotion.membershipLevels ?? [];
  const hasProductTargets = productTargets.length > 0;
  const hasCategoryTargets = categoryTargets.length > 0;
  const productMatch = !hasProductTargets || productTargets.some((target: Record<string, any>) => target.productId === productId);
  const categoryMatch = !hasCategoryTargets || categoryTargets.some((target: Record<string, any>) => target.categoryId === categoryId);
  const membershipMatch =
    membershipTargets.length === 0 ||
    (Boolean(membershipLevelId) &&
      membershipTargets.some((target: Record<string, any>) => target.membershipLevelId === membershipLevelId));

  if (promotion.promotionType === "member_discount" && !membershipLevelId) {
    return false;
  }

  return productMatch && categoryMatch && membershipMatch;
}

export function isStoreWidePromotion(promotion: Record<string, any>) {
  return (promotion.products ?? []).length === 0 && (promotion.categories ?? []).length === 0;
}

export function calculatePromotionDiscount(
  promotion: Record<string, any>,
  quantity: number,
  sellingPrice: number,
  lineSubtotal: number,
) {
  switch (promotion.promotionType) {
    case "percentage":
    case "member_discount":
      return lineSubtotal * amount(promotion.discountPercent) / 100;
    case "fixed_amount":
      if (isStoreWidePromotion(promotion) && amount(promotion.buyQuantity) > 0) {
        return 0;
      }
      return Math.min(amount(promotion.discountAmountLak), lineSubtotal);
    case "buy_x_get_y": {
      const buyQuantity = Math.max(Number(promotion.buyQuantity ?? 0), 0);
      const getQuantity = Math.max(Number(promotion.getQuantity ?? 0), 0);
      if (buyQuantity <= 0 || getQuantity <= 0) return 0;
      const freeQuantity = Math.floor(quantity / (buyQuantity + getQuantity)) * getQuantity;
      return freeQuantity * sellingPrice;
    }
    case "combo_set":
      return 0;
    default:
      return 0;
  }
}

function distributeCartDiscount(
  items: PromotionSaleLine[],
  discountLak: number,
  promotionId: string,
  productIds?: Set<string>,
) {
  const eligible = items.filter((item) => {
    if (productIds && !productIds.has(item.productId)) {
      return false;
    }
    const remaining = item.quantity * item.sellingPrice - item.promotionDiscount;
    return remaining > 0;
  });
  const eligibleSubtotal = eligible.reduce((total, item) => total + item.quantity * item.sellingPrice - item.promotionDiscount, 0);
  if (eligibleSubtotal <= 0 || discountLak <= 0) {
    return;
  }

  let remainingDiscount = Math.min(discountLak, eligibleSubtotal);
  for (const item of eligible) {
    const lineBase = item.quantity * item.sellingPrice - item.promotionDiscount;
    const share = Math.round((lineBase / eligibleSubtotal) * discountLak);
    const applied = Math.min(share, lineBase, remainingDiscount);
    if (applied <= 0) {
      continue;
    }
    item.promotionDiscount += applied;
    item.promotionId = promotionId;
    item.discountAmount = item.promotionDiscount;
    item.totalAmount = item.quantity * item.sellingPrice - item.promotionDiscount;
    item.profitAmount = item.totalAmount - item.costPrice * item.quantity;
    remainingDiscount -= applied;
  }
}

function applyComboSetPromotions(
  items: PromotionSaleLine[],
  promotions: Array<Record<string, any>>,
  context: PromotionApplicationContext,
) {
  const comboPromotions = promotions.filter((promotion) => promotion.promotionType === "combo_set");
  for (const promotion of comboPromotions) {
    if (!isPromotionCouponSatisfied(promotion, context.appliedPromotionCodes)) {
      continue;
    }
    const membershipLevelId = context.membershipLevelId;
    const productIds = (promotion.products ?? []).map((entry: Record<string, any>) => String(entry.productId));
    if (productIds.length === 0) {
      continue;
    }

    const eligible = productIds.every((productId: string) =>
      isPromotionEligibleForLine(
        promotion,
        productId,
        context.categoryByProduct.get(productId),
        membershipLevelId,
        { appliedPromotionCodes: context.appliedPromotionCodes },
      ),
    );
    if (!eligible) {
      continue;
    }

    const sets = Math.min(
      ...productIds.map((productId: string) => {
        const line = items.find((item) => item.productId === productId);
        return line ? line.quantity : 0;
      }),
    );
    if (sets <= 0) {
      continue;
    }

    const comboSubtotal = productIds.reduce((total: number, productId: string) => {
      const line = items.find((item) => item.productId === productId);
      return total + (line ? line.sellingPrice * sets : 0);
    }, 0);
    const targetPrice = amount(promotion.comboPriceLak) * sets;
    const discountLak = Math.max(0, comboSubtotal - targetPrice);
    if (discountLak <= 0) {
      continue;
    }

    distributeCartDiscount(items, discountLak, String(promotion.id), new Set(productIds));
  }
}

function isStoreWidePromotionEligible(
  promotion: Record<string, any>,
  membershipLevelId: string | null | undefined,
  appliedPromotionCodes?: string[],
) {
  if (!isPromotionScheduleActive(promotion) || !isPromotionCouponSatisfied(promotion, appliedPromotionCodes)) {
    return false;
  }
  const membershipTargets = promotion.membershipLevels ?? [];
  if (
    membershipTargets.length > 0 &&
    (!membershipLevelId ||
      !membershipTargets.some((target: Record<string, any>) => target.membershipLevelId === membershipLevelId))
  ) {
    return false;
  }
  return true;
}

function applySpendThresholdPromotions(
  items: PromotionSaleLine[],
  promotions: Array<Record<string, any>>,
  context: PromotionApplicationContext,
) {
  const cartSubtotal = items.reduce((total, item) => total + item.quantity * item.sellingPrice, 0);
  for (const promotion of promotions) {
    if (promotion.promotionType !== "fixed_amount" || !isStoreWidePromotion(promotion)) {
      continue;
    }
    const minSpendLak = amount(promotion.buyQuantity);
    const discountLak = amount(promotion.discountAmountLak);
    if (minSpendLak <= 0 || discountLak <= 0) {
      continue;
    }
    if (!isStoreWidePromotionEligible(promotion, context.membershipLevelId, context.appliedPromotionCodes)) {
      continue;
    }
    if (cartSubtotal < minSpendLak) {
      continue;
    }

    distributeCartDiscount(items, Math.min(discountLak, cartSubtotal), String(promotion.id));
    if (!context.allowStacking) {
      break;
    }
  }
}

function pickBestPromotionForLine(
  promotions: Array<Record<string, any>>,
  item: PromotionSaleLine,
  categoryId: string | null | undefined,
  membershipLevelId: string | null | undefined,
  context: PromotionApplicationContext,
) {
  let best = { discount: 0, priority: -1, promotionId: undefined as string | undefined };

  for (const promotion of promotions) {
    if (promotion.promotionType === "combo_set") {
      continue;
    }
    if (
      !isPromotionEligibleForLine(promotion, item.productId, categoryId, membershipLevelId, {
        appliedPromotionCodes: context.appliedPromotionCodes,
      })
    ) {
      continue;
    }

    const lineSubtotal = item.quantity * item.sellingPrice;
    const discount = calculatePromotionDiscount(promotion, item.quantity, item.sellingPrice, lineSubtotal);
    const priority = amount(promotion.priority);
    const promotionId = String(promotion.id);
    const betterDiscount = discount > best.discount;
    const sameDiscountHigherPriority = discount === best.discount && discount > 0 && priority > best.priority;
    const sameDiscountSamePriorityStableId =
      discount === best.discount &&
      discount > 0 &&
      priority === best.priority &&
      promotionId < (best.promotionId ?? "\uffff");
    if (betterDiscount || sameDiscountHigherPriority || sameDiscountSamePriorityStableId) {
      best = { discount, priority, promotionId };
    }
  }

  return best;
}

export function assertPromotionProfitSafe(items: PromotionSaleLine[], blockBelowCostSales = true) {
  if (!blockBelowCostSales) {
    return;
  }

  for (const item of items) {
    if (item.costPrice <= 0) {
      continue;
    }
    const netUnitPrice = item.quantity > 0
      ? (item.quantity * item.sellingPrice - item.promotionDiscount) / item.quantity
      : item.sellingPrice;
    if (netUnitPrice + 0.01 < item.costPrice) {
      throw new Error(
        `Promotion would sell product ${item.productId} below cost (${Math.round(netUnitPrice)} < ${item.costPrice}).`,
      );
    }
  }
}

export function applyLoadedPromotions(
  items: PromotionSaleLine[],
  promotions: Array<Record<string, any>>,
  context: PromotionApplicationContext,
) {
  const workingItems = items.map((item) => ({ ...item }));
  const allowStacking = context.allowStacking ?? false;

  applyComboSetPromotions(workingItems, promotions, context);
  applySpendThresholdPromotions(workingItems, promotions, context);

  const perLinePromotions = promotions.filter((promotion) => {
    if (promotion.promotionType === "combo_set") {
      return false;
    }
    if (promotion.promotionType === "fixed_amount" && isStoreWidePromotion(promotion) && amount(promotion.buyQuantity) > 0) {
      return false;
    }
    return true;
  });

  return workingItems.map((item) => {
    if (!allowStacking && item.promotionDiscount > 0) {
      return item;
    }

    const lineSubtotal = item.quantity * item.sellingPrice;
    const best = pickBestPromotionForLine(
      perLinePromotions,
      item,
      context.categoryByProduct.get(item.productId),
      context.membershipLevelId,
      context,
    );
    const promotionDiscount = Math.min(best.discount, lineSubtotal);
    if (promotionDiscount <= 0) {
      return item;
    }

    if (!allowStacking && item.promotionDiscount > 0) {
      return item;
    }

    const totalDiscount = allowStacking ? item.promotionDiscount + promotionDiscount : promotionDiscount;
    const cappedDiscount = Math.min(totalDiscount, lineSubtotal);
    const totalAmount = lineSubtotal - cappedDiscount;

    return {
      ...item,
      discountAmount: cappedDiscount,
      profitAmount: totalAmount - item.costPrice * item.quantity,
      promotionDiscount: cappedDiscount,
      promotionId: best.promotionId ?? item.promotionId,
      totalAmount,
    };
  });
}

export async function applyActivePromotions(
  tx: Record<string, any>,
  items: PromotionSaleLine[],
  context: PromotionApplicationContext,
) {
  const now = new Date();
  const promotions = await tx.promotion.findMany({
    include: {
      categories: true,
      membershipLevels: true,
      products: true,
    },
    orderBy: [{ priority: "desc" }, { startDate: "desc" }, { id: "asc" }],
    where: {
      companyId: context.companyId,
      endDate: { gte: now },
      isActive: true,
      startDate: { lte: now },
      status: "active",
    },
  });

  return applyLoadedPromotions(items, promotions as Array<Record<string, any>>, context);
}

export async function recordPromotionUsage(
  tx: Record<string, any>,
  input: { companyId: string; saleId: string; saleItems: PromotionSaleLine[] },
) {
  const discountByPromotion = input.saleItems.reduce<Map<string, number>>((totals, item) => {
    if (item.promotionId && item.promotionDiscount > 0) {
      totals.set(item.promotionId, (totals.get(item.promotionId) ?? 0) + item.promotionDiscount);
    }
    return totals;
  }, new Map());

  for (const [promotionId, discountLak] of discountByPromotion) {
    const existing = await tx.promotionUsage.findFirst({
      where: { companyId: input.companyId, promotionId, saleId: input.saleId },
    });
    if (existing) {
      throw new Error(`Promotion ${promotionId} was already recorded for this sale.`);
    }

    await tx.promotionUsage.create({
      data: {
        companyId: input.companyId,
        discountAmountLak: discountLak,
        promotionId,
        saleId: input.saleId,
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
}

export function rejectClientPromotionClaims(
  items: Array<{ promotionDiscount?: number; promotionId?: string }>,
) {
  for (const item of items) {
    if (item.promotionId || amount(item.promotionDiscount) > 0) {
      throw new Error("Client promotion values are not accepted. Promotions are calculated server-side.");
    }
  }
}

export async function sumPromotionSalesLakByPromotionId(tx: Record<string, any>, companyId: string) {
  const rows = await tx.promotionUsage.findMany({
    select: {
      promotionId: true,
      sale: { select: { totalAmount: true } },
    },
    where: { companyId },
  });

  const totals = new Map<string, number>();
  for (const row of rows) {
    const saleTotal = amount(row.sale?.totalAmount);
    totals.set(String(row.promotionId), (totals.get(String(row.promotionId)) ?? 0) + saleTotal);
  }
  return totals;
}
