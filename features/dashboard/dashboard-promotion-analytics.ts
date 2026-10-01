import { startOfBusinessDay } from "@/lib/datetime/business-timezone";

export type DashboardPromotionRecord = {
  endDate: Date;
  id: string;
  isActive: boolean;
  promotionName: string;
  startDate: Date;
  status: string;
};

export type DashboardPromotionUsageRecord = {
  discountAmountLak: unknown;
  promotion: { promotionName: string; status: string };
  promotionId: string;
  saleId: string | null;
};

export type DashboardPromotionSummary = {
  activeCount: number;
  endingSoonCount: number;
  promotionDiscountLak: number;
  startingSoonCount: number;
  topPromotions: Array<{
    discountLak: number;
    name: string;
    promotionId: string;
    status: string;
    usageCount: number;
  }>;
  usageCount: number;
};

const PROMOTION_SOON_DAYS = 7;

function amount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function promotionSoonWindow(now = new Date()) {
  const start = startOfBusinessDay(now);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + PROMOTION_SOON_DAYS + 1);
  return { end, start };
}

export function classifyDashboardPromotion(promotion: DashboardPromotionRecord, now = new Date()) {
  const startAt = promotion.startDate.getTime();
  const endAt = promotion.endDate.getTime();
  const nowAt = now.getTime();
  const soon = promotionSoonWindow(now);
  const enabled = promotion.isActive && ["active", "scheduled"].includes(promotion.status);

  return {
    active: enabled && promotion.status === "active" && startAt <= nowAt && endAt >= nowAt,
    endingSoon:
      enabled &&
      promotion.status === "active" &&
      startAt <= nowAt &&
      endAt >= nowAt &&
      endAt < soon.end.getTime(),
    startingSoon:
      enabled &&
      startAt >= nowAt &&
      startAt < soon.end.getTime(),
  };
}

export function buildDashboardPromotionSummary(
  promotions: DashboardPromotionRecord[],
  usages: DashboardPromotionUsageRecord[],
  now = new Date(),
): DashboardPromotionSummary {
  let activeCount = 0;
  let endingSoonCount = 0;
  let startingSoonCount = 0;
  for (const promotion of promotions) {
    const classification = classifyDashboardPromotion(promotion, now);
    if (classification.active) activeCount += 1;
    if (classification.startingSoon) startingSoonCount += 1;
    if (classification.endingSoon) endingSoonCount += 1;
  }

  const deduplicated = new Map<string, DashboardPromotionUsageRecord>();
  for (const usage of usages) {
    if (!usage.saleId) continue;
    const key = `${usage.promotionId}:${usage.saleId}`;
    const existing = deduplicated.get(key);
    if (!existing || amount(usage.discountAmountLak) > amount(existing.discountAmountLak)) {
      deduplicated.set(key, usage);
    }
  }

  const byPromotion = new Map<string, DashboardPromotionSummary["topPromotions"][number]>();
  let promotionDiscountLak = 0;
  for (const usage of deduplicated.values()) {
    const discountLak = amount(usage.discountAmountLak);
    promotionDiscountLak += discountLak;
    const current = byPromotion.get(usage.promotionId) ?? {
      discountLak: 0,
      name: usage.promotion.promotionName,
      promotionId: usage.promotionId,
      status: usage.promotion.status,
      usageCount: 0,
    };
    current.discountLak += discountLak;
    current.usageCount += 1;
    byPromotion.set(usage.promotionId, current);
  }

  return {
    activeCount,
    endingSoonCount,
    promotionDiscountLak,
    startingSoonCount,
    topPromotions: Array.from(byPromotion.values())
      .sort((left, right) => right.discountLak - left.discountLak || right.usageCount - left.usageCount || left.name.localeCompare(right.name))
      .slice(0, 5),
    usageCount: deduplicated.size,
  };
}

export const dashboardPromotionSoonDays = PROMOTION_SOON_DAYS;
