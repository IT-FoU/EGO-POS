export type PromotionType =
  | "percentage"
  | "fixed_amount"
  | "buy_x_get_y"
  | "combo_set"
  | "member_discount";

export type PromotionStatus = "active" | "inactive" | "scheduled" | "expired";

export type Promotion = {
  id: string;
  promotionCode: string;
  promotionName: string;
  description: string;
  type: PromotionType;
  startDate: string;
  endDate: string;
  priority: number;
  applicableProductIds: string[];
  applicableCategoryIds: string[];
  membershipLevels: string[];
  status: PromotionStatus;
  discountPercent?: number;
  discountAmountLak?: number;
  buyQuantity?: number;
  getQuantity?: number;
  comboPriceLak?: number;
  usageCount: number;
  totalDiscountLak: number;
  totalSalesLak: number;
};

export type PromotionSimulation = {
  cartSubtotalLak: number;
  discountLak: number;
  finalTotalLak: number;
  lineResults: Array<{
    label: string;
    quantity: number;
    originalTotalLak: number;
    discountLak: number;
    finalTotalLak: number;
  }>;
};
