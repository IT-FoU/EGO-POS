import type { Promotion, PromotionStatus, PromotionType } from "@/features/promotions/types";

type Row = Record<string, any>;

function toNumber(value: unknown) {
  return value == null ? 0 : Number(value);
}

function dateOnly(value: unknown) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : "";
}

export function mapPrismaPromotion(promotion: Row, totalSalesLak = 0): Promotion {
  return {
    applicableCategoryIds: (promotion.categories ?? []).map((entry: Row) => entry.categoryId),
    applicableProductIds: (promotion.products ?? []).map((entry: Row) => entry.productId),
    buyQuantity: promotion.buyQuantity ?? undefined,
    comboPriceLak: promotion.comboPriceLak ? toNumber(promotion.comboPriceLak) : undefined,
    description: promotion.description ?? "",
    discountAmountLak: promotion.discountAmountLak ? toNumber(promotion.discountAmountLak) : undefined,
    discountPercent: promotion.discountPercent ? toNumber(promotion.discountPercent) : undefined,
    endDate: dateOnly(promotion.endDate),
    getQuantity: promotion.getQuantity ?? undefined,
    id: promotion.id,
    membershipLevels: (promotion.membershipLevels ?? []).map(
      (entry: Row) => entry.membershipLevel?.name ?? entry.membershipLevelId,
    ),
    priority: promotion.priority ?? 0,
    promotionCode: promotion.promotionCode ?? "",
    promotionName: promotion.promotionName,
    startDate: dateOnly(promotion.startDate),
    status: (promotion.status ?? "active") as PromotionStatus,
    totalDiscountLak: toNumber(promotion.totalDiscountLak),
    totalSalesLak,
    type: (promotion.promotionType ?? "percentage") as PromotionType,
    usageCount: promotion.usageCount ?? 0,
  };
}
