import {
  asDtoObject,
  cleanUndefined,
  parseDateString,
  parseNumber,
  parseString,
  rejectUnknownFields,
} from "@/lib/validation/dto";

const stockInFields = [
  "expiryDate",
  "invoiceNo",
  "lotNumber",
  "note",
  "paymentStatus",
  "photos",
  "productId",
  "quantity",
  "stockInNo",
  "supplierId",
  "supplierName",
  "unitCostLak",
  "unitId",
  "updateProductCost",
  "warehouseId",
] as const;
const adjustmentFields = ["note", "productId", "quantity", "reason", "warehouseId"] as const;
const countFields = ["countedQuantity", "expectedSystemQuantity", "note", "productId", "warehouseId"] as const;

export type StockInInput = {
  expiryDate?: string | null;
  invoiceNo?: string | null;
  lotNumber?: string | null;
  note?: string | null;
  paymentStatus?: "paid" | "credit";
  photos?: string[];
  productId: string;
  quantity: number;
  stockInNo?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  unitCostLak?: number;
  unitId?: string | null;
  updateProductCost?: boolean;
  warehouseId: string;
};

export type StockAdjustmentInput = {
  note?: string | null;
  productId: string;
  quantity: number;
  reason: string;
  warehouseId: string;
};

export type StockCountInput = {
  countedQuantity: number;
  expectedSystemQuantity: number;
  note?: string | null;
  productId: string;
  warehouseId: string;
};

export function parseStockInInput(input: unknown): StockInInput {
  const dto = asDtoObject(input, "Stock-in payload");
  rejectUnknownFields(dto, [...stockInFields], "Stock-in payload");

  return cleanUndefined({
    expiryDate: parseDateString(dto, "expiryDate", { nullable: true }),
    invoiceNo: parseString(dto, "invoiceNo", { max: 120, nullable: true }),
    lotNumber: parseString(dto, "lotNumber", { max: 120, nullable: true }),
    note: parseString(dto, "note", { nullable: true }),
    paymentStatus: dto.paymentStatus === "credit" ? "credit" : "paid",
    photos: Array.isArray(dto.photos) ? dto.photos.map(String).slice(0, 10) : [],
    productId: parseString(dto, "productId", { required: true })!,
    quantity: parseNumber(dto, "quantity", { min: 0.000001, required: true })!,
    stockInNo: parseString(dto, "stockInNo", { max: 80, nullable: true }),
    supplierId: parseString(dto, "supplierId", { nullable: true }),
    supplierName: parseString(dto, "supplierName", { max: 200, nullable: true }),
    unitCostLak: parseNumber(dto, "unitCostLak", { min: 0 }),
    unitId: parseString(dto, "unitId", { nullable: true }),
    updateProductCost: Boolean(dto.updateProductCost),
    warehouseId: parseString(dto, "warehouseId", { required: true })!,
  }) as StockInInput;
}

export function parseStockAdjustmentInput(input: unknown): StockAdjustmentInput {
  const dto = asDtoObject(input, "Stock adjustment payload");
  rejectUnknownFields(dto, [...adjustmentFields], "Stock adjustment payload");
  const quantity = parseNumber(dto, "quantity", { required: true })!;

  if (quantity === 0) {
    throw new Error("Stock adjustment quantity cannot be zero.");
  }

  return cleanUndefined({
    note: parseString(dto, "note", { nullable: true }),
    productId: parseString(dto, "productId", { required: true })!,
    quantity,
    reason: parseString(dto, "reason", { min: 1, required: true })!,
    warehouseId: parseString(dto, "warehouseId", { required: true })!,
  }) as StockAdjustmentInput;
}

export function parseStockCountInput(input: unknown): StockCountInput {
  const dto = asDtoObject(input, "Stock count payload");
  rejectUnknownFields(dto, [...countFields], "Stock count payload");

  return cleanUndefined({
    countedQuantity: parseNumber(dto, "countedQuantity", { min: 0, required: true })!,
    expectedSystemQuantity: parseNumber(dto, "expectedSystemQuantity", { min: 0, required: true })!,
    note: parseString(dto, "note", { nullable: true }),
    productId: parseString(dto, "productId", { required: true })!,
    warehouseId: parseString(dto, "warehouseId", { required: true })!,
  }) as StockCountInput;
}
