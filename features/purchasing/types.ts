export type CurrencyCode = "LAK" | "THB" | "USD";
export type PurchaseStatus = "draft" | "ordered" | "partial" | "received" | "closed" | "cancelled";
export type PayableStatus = "unpaid" | "partial" | "paid";

export type Supplier = {
  id: string;
  supplierCode: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  note: string;
  creditLimitLak: number;
  outstandingBalanceLak: number;
  status: "active" | "inactive";
};

export type PurchaseOrderItem = {
  id: string;
  productId: string;
  productName: string;
  productNameEn?: string;
  productNameLo?: string;
  sku: string;
  barcode: string;
  unitName: string;
  quantity: number;
  receivedQuantity: number;
  unitCost: number;
  lotNumber?: string;
  expiryDate?: string;
};

export type PurchaseOrder = {
  id: string;
  purchaseNo: string;
  supplierId: string;
  supplierName: string;
  warehouseId: string;
  warehouseName: string;
  currency: CurrencyCode;
  exchangeRate: number;
  subtotal: number;
  paidAmount: number;
  balanceAmount: number;
  status: PurchaseStatus;
  purchaseDate: string;
  items: PurchaseOrderItem[];
};

export type SupplierPayable = {
  id: string;
  purchaseId?: string;
  supplierId: string;
  supplierName: string;
  purchaseNo: string;
  totalAmountLak: number;
  paidAmountLak: number;
  balanceAmountLak: number;
  dueDate: string;
  status: PayableStatus;
};
