export type SupplierStatus = "active" | "inactive";

export type Supplier = {
  id: string;
  supplierCode: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  taxNumber: string;
  creditLimitLak: number;
  openingBalanceLak: number;
  outstandingBalanceLak: number;
  creditTerms: string;
  averageDeliveryDays: number;
  status: SupplierStatus;
  notes: string;
};

export type SupplierPurchaseOrder = {
  id: string;
  supplierId: string;
  purchaseNo: string;
  purchaseDate: string;
  warehouseName: string;
  status: "draft" | "ordered" | "partial" | "received" | "cancelled";
  totalLak: number;
};

export type SupplierReceiving = {
  id: string;
  supplierId: string;
  receiveNo: string;
  purchaseNo: string;
  receivedDate: string;
  warehouseName: string;
  itemCount: number;
  status: "partial" | "received";
};

export type SupplierPayment = {
  id: string;
  supplierId: string;
  paymentNo: string;
  paymentDate: string;
  method: "cash" | "bank" | "qr";
  amountLak: number;
  note: string;
};
