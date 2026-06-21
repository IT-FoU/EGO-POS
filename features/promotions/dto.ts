import {
  asDtoObject,
  cleanUndefined,
  parseBoolean,
  parseDateString,
  parseEnum,
  parseNumber,
  parseString,
  parseStringArray,
  rejectUnknownFields,
} from "@/lib/validation/dto";

const createFields = [
  "applicableCategoryIds",
  "applicableProductIds",
  "buyQuantity",
  "comboPriceLak",
  "description",
  "discountAmountLak",
  "discountPercent",
  "endDate",
  "getQuantity",
  "membershipLevelIds",
  "priority",
  "promotionCode",
  "promotionName",
  "promotionType",
  "startDate",
  "status",
] as const;

const updateFields = [
  "buyQuantity",
  "comboPriceLak",
  "description",
  "discountAmountLak",
  "discountPercent",
  "endDate",
  "getQuantity",
  "isActive",
  "priority",
  "promotionCode",
  "promotionName",
  "promotionType",
  "startDate",
  "status",
] as const;

const promotionTypes = ["percentage", "fixed_amount", "buy_x_get_y", "combo_set", "member_discount"] as const;
const statuses = ["active", "inactive", "scheduled", "expired"] as const;

export type PromotionCreateInput = {
  applicableCategoryIds?: string[];
  applicableProductIds?: string[];
  buyQuantity?: number;
  comboPriceLak?: number;
  description?: string | null;
  discountAmountLak?: number;
  discountPercent?: number;
  endDate: string;
  getQuantity?: number;
  membershipLevelIds?: string[];
  priority?: number;
  promotionCode?: string | null;
  promotionName: string;
  promotionType?: (typeof promotionTypes)[number];
  startDate: string;
  status?: (typeof statuses)[number];
};

export type PromotionUpdateInput = Partial<Omit<PromotionCreateInput, "applicableCategoryIds" | "applicableProductIds" | "membershipLevelIds">> & {
  isActive?: boolean;
};

function assertDateOrder(startDate?: string | null, endDate?: string | null) {
  if (startDate && endDate && new Date(endDate).getTime() < new Date(startDate).getTime()) {
    throw new Error("endDate must be on or after startDate.");
  }
}

export function parsePromotionCreateInput(input: unknown): PromotionCreateInput {
  const dto = asDtoObject(input, "Promotion payload");
  rejectUnknownFields(dto, [...createFields], "Promotion payload");
  const startDate = parseDateString(dto, "startDate", { required: true })!;
  const endDate = parseDateString(dto, "endDate", { required: true })!;
  assertDateOrder(startDate, endDate);

  return cleanUndefined({
    applicableCategoryIds: parseStringArray(dto, "applicableCategoryIds"),
    applicableProductIds: parseStringArray(dto, "applicableProductIds"),
    buyQuantity: parseNumber(dto, "buyQuantity", { integer: true, min: 1 }),
    comboPriceLak: parseNumber(dto, "comboPriceLak", { min: 0 }),
    description: parseString(dto, "description", { nullable: true }),
    discountAmountLak: parseNumber(dto, "discountAmountLak", { min: 0 }),
    discountPercent: parseNumber(dto, "discountPercent", { max: 100, min: 0 }),
    endDate,
    getQuantity: parseNumber(dto, "getQuantity", { integer: true, min: 1 }),
    membershipLevelIds: parseStringArray(dto, "membershipLevelIds"),
    priority: parseNumber(dto, "priority", { integer: true, min: 0 }),
    promotionCode: parseString(dto, "promotionCode", { max: 80, nullable: true }),
    promotionName: parseString(dto, "promotionName", { max: 255, required: true })!,
    promotionType: parseEnum(dto, "promotionType", promotionTypes),
    startDate,
    status: parseEnum(dto, "status", statuses),
  }) as PromotionCreateInput;
}

export function parsePromotionUpdateInput(input: unknown): PromotionUpdateInput {
  const dto = asDtoObject(input, "Promotion update payload");
  rejectUnknownFields(dto, [...updateFields], "Promotion update payload");
  const startDate = parseDateString(dto, "startDate");
  const endDate = parseDateString(dto, "endDate");
  assertDateOrder(startDate, endDate);

  return cleanUndefined({
    buyQuantity: parseNumber(dto, "buyQuantity", { integer: true, min: 1 }),
    comboPriceLak: parseNumber(dto, "comboPriceLak", { min: 0 }),
    description: parseString(dto, "description", { nullable: true }),
    discountAmountLak: parseNumber(dto, "discountAmountLak", { min: 0 }),
    discountPercent: parseNumber(dto, "discountPercent", { max: 100, min: 0 }),
    endDate,
    getQuantity: parseNumber(dto, "getQuantity", { integer: true, min: 1 }),
    isActive: parseBoolean(dto, "isActive"),
    priority: parseNumber(dto, "priority", { integer: true, min: 0 }),
    promotionCode: parseString(dto, "promotionCode", { max: 80, nullable: true }),
    promotionName: parseString(dto, "promotionName", { max: 255 }),
    promotionType: parseEnum(dto, "promotionType", promotionTypes),
    startDate,
    status: parseEnum(dto, "status", statuses),
  }) as PromotionUpdateInput;
}
