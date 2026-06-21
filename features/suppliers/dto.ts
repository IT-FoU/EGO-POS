import {
  asDtoObject,
  cleanUndefined,
  parseEnum,
  parseNumber,
  parseString,
  rejectUnknownFields,
} from "@/lib/validation/dto";

const supplierFields = [
  "address",
  "averageDeliveryDays",
  "companyName",
  "contactPerson",
  "creditLimit",
  "creditTerms",
  "email",
  "note",
  "openingBalance",
  "phone",
  "status",
  "supplierCode",
  "taxNumber",
] as const;

const statuses = ["active", "inactive", "deleted"] as const;

export type SupplierCreateInput = {
  address?: string | null;
  companyName?: string | null;
  contactPerson?: string | null;
  creditLimit?: number;
  creditTerms?: string | null;
  email?: string | null;
  note?: string | null;
  openingBalance?: number;
  phone?: string | null;
  supplierCode?: string | null;
  taxNumber?: string | null;
};

export type SupplierUpdateInput = Partial<SupplierCreateInput> & {
  averageDeliveryDays?: number;
  creditTerms?: string | null;
  status?: (typeof statuses)[number];
};

export function parseSupplierCreateInput(input: unknown): SupplierCreateInput {
  const dto = asDtoObject(input, "Supplier payload");
  rejectUnknownFields(dto, supplierFields.filter((field) => !["averageDeliveryDays", "status"].includes(field)), "Supplier payload");

  return cleanUndefined({
    address: parseString(dto, "address", { nullable: true }),
    companyName: parseString(dto, "companyName", { max: 255, required: true }),
    contactPerson: parseString(dto, "contactPerson", { max: 255, nullable: true }),
    creditLimit: parseNumber(dto, "creditLimit", { min: 0 }),
    creditTerms: parseString(dto, "creditTerms", { max: 80, nullable: true }),
    email: parseString(dto, "email", { max: 255, nullable: true }),
    note: parseString(dto, "note", { nullable: true }),
    openingBalance: parseNumber(dto, "openingBalance", { min: 0 }),
    phone: parseString(dto, "phone", { max: 80, nullable: true }),
    supplierCode: parseString(dto, "supplierCode", { max: 80, nullable: true }),
    taxNumber: parseString(dto, "taxNumber", { max: 120, nullable: true }),
  }) as SupplierCreateInput;
}

export function parseSupplierUpdateInput(input: unknown): SupplierUpdateInput {
  const dto = asDtoObject(input, "Supplier update payload");
  rejectUnknownFields(dto, [...supplierFields], "Supplier update payload");

  return cleanUndefined({
    address: parseString(dto, "address", { nullable: true }),
    averageDeliveryDays: parseNumber(dto, "averageDeliveryDays", { min: 0 }),
    companyName: parseString(dto, "companyName", { max: 255 }),
    contactPerson: parseString(dto, "contactPerson", { max: 255, nullable: true }),
    creditLimit: parseNumber(dto, "creditLimit", { min: 0 }),
    creditTerms: parseString(dto, "creditTerms", { max: 80, nullable: true }),
    email: parseString(dto, "email", { max: 255, nullable: true }),
    note: parseString(dto, "note", { nullable: true }),
    openingBalance: parseNumber(dto, "openingBalance", { min: 0 }),
    phone: parseString(dto, "phone", { max: 80, nullable: true }),
    status: parseEnum(dto, "status", statuses),
    supplierCode: parseString(dto, "supplierCode", { max: 80, nullable: true }),
    taxNumber: parseString(dto, "taxNumber", { max: 120, nullable: true }),
  }) as SupplierUpdateInput;
}
