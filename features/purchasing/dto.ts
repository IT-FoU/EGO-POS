import {
  asDtoObject,
  cleanUndefined,
  parseDateString,
  parseEnum,
  parseNumber,
  parseString,
  rejectUnknownFields,
} from "@/lib/validation/dto";

const orderFields = ["currency", "exchangeRate", "items", "paidAmount", "purchaseNo", "supplierId", "warehouseId"] as const;
const orderItemFields = ["expiryDate", "lotNumber", "productId", "quantity", "unitCost", "unitId"] as const;
const receiveFields = ["items", "note", "purchaseId", "receiptNo", "status", "warehouseId"] as const;
const receiveItemFields = ["expiryDate", "lotNumber", "productId", "purchaseItemId", "quantity", "unitId"] as const;
const paymentFields = ["amount", "note", "paymentMethod", "purchaseId"] as const;
const statusFields = ["purchaseId", "status"] as const;
const currencies = ["LAK", "THB", "USD"] as const;
const receiptStatuses = ["draft", "partial", "received", "cancelled"] as const;
const purchaseStatuses = ["draft", "ordered", "partial", "received", "closed", "cancelled"] as const;

export type PurchaseOrderItemInput = {
  expiryDate?: string | null;
  lotNumber?: string | null;
  productId: string;
  quantity: number;
  unitCost: number;
  unitId?: string | null;
};

export type PurchaseOrderInput = {
  currency?: (typeof currencies)[number];
  exchangeRate?: number;
  items: PurchaseOrderItemInput[];
  paidAmount?: number;
  purchaseNo?: string;
  supplierId: string;
  warehouseId: string;
};

export type PurchaseStatusInput = {
  purchaseId: string;
  status: (typeof purchaseStatuses)[number];
};

export type ReceiveGoodsInput = {
  items: Array<{
    expiryDate?: string | null;
    lotNumber?: string | null;
    productId: string;
    purchaseItemId?: string | null;
    quantity: number;
    unitId?: string | null;
  }>;
  note?: string | null;
  purchaseId: string;
  receiptNo: string;
  status?: (typeof receiptStatuses)[number];
  warehouseId: string;
};

export type SupplierPaymentInput = {
  amount: number;
  note?: string | null;
  paymentMethod?: string | null;
  purchaseId: string;
};

function parseItems(input: unknown, label: string, allowedFields: readonly string[], withCost: boolean) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error(`${label} must contain at least one item.`);
  }

  return input.map((rawItem, index) => {
    const item = asDtoObject(rawItem, `${label} item ${index + 1}`);
    rejectUnknownFields(item, [...allowedFields], `${label} item ${index + 1}`);

    return cleanUndefined({
      expiryDate: parseDateString(item, "expiryDate", { nullable: true }),
      lotNumber: parseString(item, "lotNumber", { max: 120, nullable: true }),
      productId: parseString(item, "productId", { required: true })!,
      purchaseItemId: withCost ? undefined : parseString(item, "purchaseItemId", { nullable: true }),
      quantity: parseNumber(item, "quantity", { min: 0.000001, required: true })!,
      unitCost: withCost ? parseNumber(item, "unitCost", { min: 0, required: true })! : undefined,
      unitId: parseString(item, "unitId", { nullable: true }),
    });
  });
}

export function parsePurchaseOrderInput(input: unknown): PurchaseOrderInput {
  const dto = asDtoObject(input, "Purchase order payload");
  rejectUnknownFields(dto, [...orderFields], "Purchase order payload");

  return cleanUndefined({
    currency: parseEnum(dto, "currency", currencies),
    exchangeRate: parseNumber(dto, "exchangeRate", { min: 0.000001 }),
    items: parseItems(dto.items, "Purchase order", orderItemFields, true) as PurchaseOrderItemInput[],
    paidAmount: parseNumber(dto, "paidAmount", { min: 0 }),
    purchaseNo: parseString(dto, "purchaseNo", { max: 120, nullable: true }),
    supplierId: parseString(dto, "supplierId", { required: true })!,
    warehouseId: parseString(dto, "warehouseId", { required: true })!,
  }) as PurchaseOrderInput;
}

export function parsePurchaseStatusInput(input: unknown): PurchaseStatusInput {
  const dto = asDtoObject(input, "Purchase status payload");
  rejectUnknownFields(dto, [...statusFields], "Purchase status payload");

  return cleanUndefined({
    purchaseId: parseString(dto, "purchaseId", { required: true })!,
    status: parseEnum(dto, "status", purchaseStatuses, { required: true })!,
  }) as PurchaseStatusInput;
}

export function parseReceiveGoodsInput(input: unknown): ReceiveGoodsInput {
  const dto = asDtoObject(input, "Goods receipt payload");
  rejectUnknownFields(dto, [...receiveFields], "Goods receipt payload");

  return cleanUndefined({
    items: parseItems(dto.items, "Goods receipt", receiveItemFields, false) as ReceiveGoodsInput["items"],
    note: parseString(dto, "note", { nullable: true }),
    purchaseId: parseString(dto, "purchaseId", { required: true })!,
    receiptNo: parseString(dto, "receiptNo", { max: 120, required: true })!,
    status: parseEnum(dto, "status", receiptStatuses),
    warehouseId: parseString(dto, "warehouseId", { required: true })!,
  }) as ReceiveGoodsInput;
}

export function parseSupplierPaymentInput(input: unknown): SupplierPaymentInput {
  const dto = asDtoObject(input, "Supplier payment payload");
  rejectUnknownFields(dto, [...paymentFields], "Supplier payment payload");

  return cleanUndefined({
    amount: parseNumber(dto, "amount", { min: 1, required: true })!,
    note: parseString(dto, "note", { nullable: true }),
    paymentMethod: parseString(dto, "paymentMethod", { max: 80, nullable: true }),
    purchaseId: parseString(dto, "purchaseId", { required: true })!,
  }) as SupplierPaymentInput;
}
