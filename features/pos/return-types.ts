import type { PaymentMode } from "@/features/pos/types";
import type { StoreManagerPinApprovalResult } from "@/lib/auth/store-manager-approval";
import type { PosRecentSaleRecord, PostSaleMutationResult } from "@/features/pos/post-sale-types";

export type ReturnItemCondition = "sellable" | "damaged" | "expired" | "opened_used";
export type RefundKind = "refund" | "exchange";
export type RefundPaymentMethod = "cash" | "transfer" | "qr" | "visa" | "mastercard";

export type ReturnLineInput = {
  saleItemId: string;
  quantity: number;
  condition: ReturnItemCondition;
  reason?: string;
};

export type ExchangeReplacementInput = {
  productId: string;
  quantity: number;
  unitId?: string;
};

export type ReturnSaleInput = {
  items: ReturnLineInput[];
  managerPinApproval?: StoreManagerPinApprovalResult | null;
  reason?: string;
  refundMethod?: RefundPaymentMethod;
  saleId: string;
};

export type ExchangeSaleInput = {
  managerPinApproval?: StoreManagerPinApprovalResult | null;
  paidAmountLak?: number;
  reason?: string;
  refundMethod?: RefundPaymentMethod;
  replacementItems: ExchangeReplacementInput[];
  returnedItems: ReturnLineInput[];
  saleId: string;
};

export type ReturnableSaleItem = {
  conditionOptions: ReturnItemCondition[];
  conversionQty: number;
  id: string;
  nameEn: string;
  nameLo: string;
  originalPaidLak: number;
  originalQuantity: number;
  productId: string;
  remainingPaidLak: number;
  remainingQuantity: number;
  sellingPriceLak: number;
  unitId?: string;
  unitName?: string;
};

export type ReturnableSaleSnapshot = {
  branchId: string;
  cashierName: string;
  createdAt: string;
  customerId?: string;
  customerName: string;
  id: string;
  items: ReturnableSaleItem[];
  originalTotalLak: number;
  paymentMode: PaymentMode;
  receiptNo: string;
  remainingRefundableLak: number;
  saleNo: string;
  status: PosRecentSaleRecord["status"];
  taxAmount: number;
  warehouseId: string;
};

export type ReturnReceiptSnapshot = {
  approvedBy?: string | null;
  createdAt: string;
  createdBy: string;
  differenceLak: number;
  exchangeReceiptNo?: string | null;
  kind: RefundKind;
  method: RefundPaymentMethod;
  originalReceiptNo: string;
  originalSaleNo: string;
  paymentAmountLak: number;
  reason?: string | null;
  receiptNo: string;
  refundAmountLak: number;
  replacementItems: Array<{
    nameEn: string;
    nameLo: string;
    quantity: number;
    totalAmountLak: number;
    unitPriceLak: number;
  }>;
  returnedItems: Array<{
    amountLak: number;
    condition: ReturnItemCondition;
    nameEn: string;
    nameLo: string;
    quantity: number;
    reason?: string | null;
    unitName?: string;
  }>;
  saleId: string;
};

export type ReturnMutationResult = PostSaleMutationResult & {
  differenceLak?: number;
  receipt?: ReturnReceiptSnapshot;
  refundId?: string;
};

export const RETURN_ITEM_CONDITIONS: ReturnItemCondition[] = [
  "sellable",
  "damaged",
  "expired",
  "opened_used",
];
