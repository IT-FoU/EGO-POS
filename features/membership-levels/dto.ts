import {
  asDtoObject,
  cleanUndefined,
  parseBoolean,
  parseNumber,
  parseString,
  rejectUnknownFields,
} from "@/lib/validation/dto";

const fields = ["discountPercent", "isActive", "minSpendLak", "name"] as const;

export type MembershipLevelWriteInput = {
  discountPercent?: number;
  isActive?: boolean;
  minSpendLak?: number;
  name?: string;
};

export type MembershipLevelCreateInput = MembershipLevelWriteInput & {
  discountPercent: number;
  minSpendLak: number;
  name: string;
};

export function parseMembershipLevelCreateInput(input: unknown): MembershipLevelCreateInput {
  const dto = asDtoObject(input, "Membership level payload");
  rejectUnknownFields(dto, [...fields], "Membership level payload");

  return cleanUndefined({
    discountPercent: parseNumber(dto, "discountPercent", { max: 100, min: 0, required: true })!,
    isActive: parseBoolean(dto, "isActive"),
    minSpendLak: parseNumber(dto, "minSpendLak", { min: 0, required: true })!,
    name: parseString(dto, "name", { max: 120, required: true })!,
  }) as MembershipLevelCreateInput;
}

export function parseMembershipLevelUpdateInput(input: unknown): MembershipLevelWriteInput {
  const dto = asDtoObject(input, "Membership level update payload");
  rejectUnknownFields(dto, [...fields], "Membership level update payload");

  return cleanUndefined({
    discountPercent: parseNumber(dto, "discountPercent", { max: 100, min: 0 }),
    isActive: parseBoolean(dto, "isActive"),
    minSpendLak: parseNumber(dto, "minSpendLak", { min: 0 }),
    name: parseString(dto, "name", { max: 120 }),
  }) as MembershipLevelWriteInput;
}
