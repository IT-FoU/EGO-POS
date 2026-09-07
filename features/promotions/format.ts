import { promotionTypeLabel } from "@/lib/i18n/promotions-copy";
import type { PromotionType } from "@/features/promotions/types";

export function formatLak(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPromotionType(type: PromotionType, locale?: string | null) {
  return promotionTypeLabel(type, locale);
}
