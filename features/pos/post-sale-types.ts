import type { PaymentMode } from "@/features/pos/types";

export type PosRecentSaleStatus = "paid" | "refunded" | "partial_refunded" | "voided" | "deleted";

export type PosRecentSaleTimelineEvent = {
  at: string;
  label: string;
  user: string;
};

export type PosRecentSaleItem = {
  conversionQty?: number;
  id: string;
  nameEn: string;
  nameLo: string;
  priceLak: number;
  quantity: number;
  unitId?: string;
  unitName?: string;
};

export type PosRecentSaleRecord = {
  branchId: string;
  cashierName: string;
  changeAmount: number;
  createdAt: string;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  discountAmount: number;
  discountPercent: number;
  id: string;
  items: PosRecentSaleItem[];
  note?: string;
  paidAmount: number;
  paymentMode: PaymentMode;
  receiptNo: string;
  saleNo: string;
  status: PosRecentSaleStatus;
  subtotal: number;
  taxAmount: number;
  timeline: PosRecentSaleTimelineEvent[];
  totalAmount: number;
  warehouseId: string;
};

export type PosReceiptSnapshot = {
  branchName: string;
  cartItems: PosRecentSaleItem[];
  cashierName: string;
  changeAmount: number;
  createdAt: string;
  customerName: string;
  discountTotal: number;
  paidAmount: number;
  paymentMode: PaymentMode;
  receiptNo: string;
  saleNo: string;
  showTaxOnReceipt: boolean;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
};

export type PostSaleMutationResult = {
  approvalId?: string;
  sale: PosRecentSaleRecord;
  status: "completed" | "pending_approval";
};
