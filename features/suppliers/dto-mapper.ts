import type {
  Supplier,
  SupplierPayment,
  SupplierPurchaseOrder,
  SupplierReceiving,
  SupplierStatus,
} from "@/features/suppliers/types";

type Row = Record<string, any>;

function toNumber(value: unknown) {
  return value == null ? 0 : Number(value);
}

function dateOnly(value: unknown) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : "";
}

export function mapPrismaSupplier(supplier: Row): Supplier {
  return {
    address: supplier.address ?? "",
    averageDeliveryDays: toNumber(supplier.averageDeliveryDays),
    companyName: supplier.companyName ?? supplier.name,
    contactPerson: supplier.contactPerson ?? "",
    creditLimitLak: toNumber(supplier.creditLimit),
    creditTerms: supplier.creditTerms ?? "",
    email: supplier.email ?? "",
    id: supplier.id,
    notes: supplier.note ?? "",
    openingBalanceLak: toNumber(supplier.openingBalance),
    outstandingBalanceLak: toNumber(supplier.outstandingBalance),
    phone: supplier.phone ?? "",
    status: (supplier.status === "inactive" ? "inactive" : "active") as SupplierStatus,
    supplierCode: supplier.supplierCode ?? "",
    taxNumber: supplier.taxNumber ?? "",
  };
}

export function mapPrismaSupplierPurchaseOrder(purchase: Row): SupplierPurchaseOrder {
  return {
    id: purchase.id,
    purchaseDate: dateOnly(purchase.purchaseDate),
    purchaseNo: purchase.purchaseNo,
    status: purchase.status,
    supplierId: purchase.supplierId,
    totalLak: toNumber(purchase.totalAmount),
    warehouseName: purchase.warehouse?.name ?? "",
  };
}

export function mapPrismaSupplierReceiving(receipt: Row): SupplierReceiving {
  return {
    id: receipt.id,
    itemCount: receipt.items?.length ?? 0,
    purchaseNo: receipt.purchase?.purchaseNo ?? "",
    receiveNo: receipt.receiptNo,
    receivedDate: dateOnly(receipt.receivedAt),
    status: receipt.status === "partial" ? "partial" : "received",
    supplierId: receipt.purchase?.supplierId ?? "",
    warehouseName: receipt.warehouse?.name ?? "",
  };
}

export function mapPrismaSupplierPayment(payment: Row): SupplierPayment {
  return {
    amountLak: toNumber(payment.amount),
    id: payment.id,
    method: payment.paymentMethod === "transfer" ? "bank" : payment.paymentMethod,
    note: payment.note ?? "",
    paymentDate: dateOnly(payment.paymentDate),
    paymentNo: payment.id,
    supplierId: payment.purchase?.supplierId ?? "",
  };
}
