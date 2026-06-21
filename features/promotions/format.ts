import type { PromotionType } from "@/features/promotions/types";

export function formatLak(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPromotionType(type: PromotionType) {
  const labels: Record<PromotionType, string> = {
    buy_x_get_y: "Buy X Get Y",
    combo_set: "Combo Set",
    fixed_amount: "Fixed Amount Discount",
    member_discount: "Member Discount",
    percentage: "Percentage Discount",
  };

  return labels[type];
}
