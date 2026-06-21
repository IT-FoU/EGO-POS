import {
  asDtoObject,
  cleanUndefined,
  parseDateString,
  parseEnum,
  parseNumber,
  parseString,
  rejectUnknownFields,
} from "@/lib/validation/dto";

const customerFields = [
  "address",
  "birthday",
  "creditLimit",
  "customerCode",
  "email",
  "fullName",
  "membershipLevelId",
  "notes",
  "openingBalance",
  "phone",
  "status",
] as const;

const paymentFields = ["amountLak", "customerId", "note", "paymentMethod", "paymentNo"] as const;
const statuses = ["active", "inactive", "deleted"] as const;
const paymentMethods = ["cash", "bank", "transfer", "qr", "visa", "mastercard"] as const;

export type CustomerCreateInput = {
  address?: string | null;
  birthday?: string | null;
  creditLimit?: number;
  customerCode?: string | null;
  email?: string | null;
  fullName: string;
  membershipLevelId?: string | null;
  notes?: string | null;
  openingBalance?: number;
  phone?: string | null;
};

export type CustomerUpdateInput = Partial<CustomerCreateInput> & {
  status?: (typeof statuses)[number];
};

export type CustomerPaymentInput = {
  amountLak: number;
  customerId: string;
  note?: string | null;
  paymentMethod?: (typeof paymentMethods)[number];
  paymentNo?: string | null;
};

export function parseCustomerCreateInput(input: unknown): CustomerCreateInput {
  const dto = asDtoObject(input, "Customer payload");
  rejectUnknownFields(dto, customerFields.filter((field) => field !== "status"), "Customer payload");

  return cleanUndefined({
    address: parseString(dto, "address", { nullable: true }),
    birthday: parseDateString(dto, "birthday", { nullable: true }),
    creditLimit: parseNumber(dto, "creditLimit", { min: 0 }),
    customerCode: parseString(dto, "customerCode", { max: 80, nullable: true }),
    email: parseString(dto, "email", { max: 255, nullable: true }),
    fullName: parseString(dto, "fullName", { max: 255, required: true })!,
    membershipLevelId: parseString(dto, "membershipLevelId", { nullable: true }),
    notes: parseString(dto, "notes", { nullable: true }),
    openingBalance: parseNumber(dto, "openingBalance", { min: 0 }),
    phone: parseString(dto, "phone", { max: 80, nullable: true }),
  }) as CustomerCreateInput;
}

export function parseCustomerUpdateInput(input: unknown): CustomerUpdateInput {
  const dto = asDtoObject(input, "Customer update payload");
  rejectUnknownFields(dto, [...customerFields], "Customer update payload");

  return cleanUndefined({
    address: parseString(dto, "address", { nullable: true }),
    birthday: parseDateString(dto, "birthday", { nullable: true }),
    creditLimit: parseNumber(dto, "creditLimit", { min: 0 }),
    customerCode: parseString(dto, "customerCode", { max: 80, nullable: true }),
    email: parseString(dto, "email", { max: 255, nullable: true }),
    fullName: parseString(dto, "fullName", { max: 255 }),
    membershipLevelId: parseString(dto, "membershipLevelId", { nullable: true }),
    notes: parseString(dto, "notes", { nullable: true }),
    openingBalance: parseNumber(dto, "openingBalance", { min: 0 }),
    phone: parseString(dto, "phone", { max: 80, nullable: true }),
    status: parseEnum(dto, "status", statuses),
  }) as CustomerUpdateInput;
}

export function parseCustomerPaymentInput(input: unknown): CustomerPaymentInput {
  const dto = asDtoObject(input, "Customer payment payload");
  rejectUnknownFields(dto, [...paymentFields], "Customer payment payload");

  return cleanUndefined({
    amountLak: parseNumber(dto, "amountLak", { min: 1, required: true })!,
    customerId: parseString(dto, "customerId", { required: true })!,
    note: parseString(dto, "note", { nullable: true }),
    paymentMethod: parseEnum(dto, "paymentMethod", paymentMethods),
    paymentNo: parseString(dto, "paymentNo", { max: 120, nullable: true }),
  }) as CustomerPaymentInput;
}
