import type { PurchaseOrder, PurchaseOrderItem, Supplier, SupplierPayable } from "@/features/purchasing/types";

type Row = Record<string, any>;

function toNumber(value: unknown) {
  return value == null ? 0 : Number(value);
}

function dateOnly(value: unknown) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : "";
}

export function mapPrismaPurchasingSupplier(supplier: Row): Supplier {
  return {
    address: supplier.address ?? "",
    creditLimitLak: toNumber(supplier.creditLimit),
    email: supplier.email ?? "",
    id: supplier.id,
    name: supplier.companyName ?? supplier.name,
    note: supplier.note ?? "",
    outstandingBalanceLak: toNumber(supplier.outstandingBalance),
    phone: supplier.phone ?? "",
    status: supplier.status === "inactive" ? "inactive" : "active",
    supplierCode: supplier.supplierCode ?? "",
  };
}

export function mapPrismaPurchaseOrderItem(item: Row): PurchaseOrderItem {
  return {
    barcode: item.product?.barcode ?? "",
    expiryDate: dateOnly(item.expiryDate),
    id: item.id,
    lotNumber: item.lotNumber ?? undefined,
    productId: item.productId,
    productName: item.product?.nameEn ?? item.product?.nameLo ?? "",
    quantity: toNumber(item.quantity),
    receivedQuantity: toNumber(item.receivedQuantity),
    sku: item.product?.sku ?? "",
    unitCost: toNumber(item.unitCost),
    unitName: item.unit?.unitName ?? "",
  };
}

export function mapPrismaPurchaseOrder(purchase: Row): PurchaseOrder {
  return {
    balanceAmount: toNumber(purchase.balanceAmount),
    currency: purchase.currency,
    exchangeRate: toNumber(purchase.exchangeRate),
    id: purchase.id,
    items: (purchase.items ?? []).map(mapPrismaPurchaseOrderItem),
    paidAmount: toNumber(purchase.paidAmount),
    purchaseDate: dateOnly(purchase.purchaseDate),
    purchaseNo: purchase.purchaseNo,
    status: purchase.status,
    subtotal: toNumber(purchase.subtotal),
    supplierId: purchase.supplierId,
    supplierName: purchase.supplier?.companyName ?? purchase.supplier?.name ?? "",
    warehouseId: purchase.warehouseId,
    warehouseName: purchase.warehouse?.name ?? "",
  };
}

export function mapPrismaSupplierPayable(payable: Row): SupplierPayable {
  return {
    balanceAmountLak: toNumber(payable.balanceAmount),
    dueDate: dateOnly(payable.dueDate),
    id: payable.id,
    paidAmountLak: toNumber(payable.paidAmount),
    purchaseId: payable.purchaseId ?? undefined,
    purchaseNo: payable.purchase?.purchaseNo ?? "",
    status: payable.status,
    supplierId: payable.supplierId,
    supplierName: payable.supplier?.companyName ?? payable.supplier?.name ?? "",
    totalAmountLak: toNumber(payable.totalAmount),
  };
}
