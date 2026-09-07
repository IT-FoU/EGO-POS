import type { PromotionsCopyKey } from "@/lib/i18n/promotions-copy";
import type { PromotionType } from "@/features/promotions/types";

export type PromotionTemplateDefaults = {
  buyQuantity?: number;
  couponCode?: string;
  getQuantity?: number;
};

export type PromotionTemplateDef = {
  defaults?: PromotionTemplateDefaults;
  key: string;
  labelKey: PromotionsCopyKey;
  type: PromotionType;
};

export const PROMOTION_TEMPLATES: PromotionTemplateDef[] = [
  { key: "percentage", labelKey: "percentageDiscount", type: "percentage" },
  { key: "fixed_amount", labelKey: "fixedAmount", type: "fixed_amount" },
  { key: "buy_x_get_y", defaults: { buyQuantity: 1, getQuantity: 1 }, labelKey: "buyXGetY", type: "buy_x_get_y" },
  { key: "combo_set", labelKey: "comboSet", type: "combo_set" },
  { key: "spend_save", labelKey: "billDiscount", type: "fixed_amount" },
  { key: "free_gift", labelKey: "freeGift", type: "buy_x_get_y" },
  { key: "coupon", defaults: { couponCode: "SAVE10" }, labelKey: "couponPromotion", type: "fixed_amount" },
  { key: "happy_hour", labelKey: "happyHour", type: "percentage" },
  { key: "flash_sale", labelKey: "flashSale", type: "percentage" },
  { key: "near_expiry", labelKey: "nearExpiry", type: "percentage" },
  { key: "slow_moving", labelKey: "slowMoving", type: "percentage" },
  { key: "member_discount", labelKey: "memberDiscount", type: "member_discount" },
];

export function getPromotionTemplate(key: string) {
  return PROMOTION_TEMPLATES.find((item) => item.key === key);
}

export function promotionTemplatesHaveUniqueBehavior() {
  const keys = PROMOTION_TEMPLATES.map((item) => item.key);
  const labels = PROMOTION_TEMPLATES.map((item) => item.labelKey);
  const identities = PROMOTION_TEMPLATES.map((item) => `${item.type}:${item.labelKey}`);
  return (
    new Set(keys).size === keys.length &&
    new Set(labels).size === labels.length &&
    new Set(identities).size === identities.length
  );
}
