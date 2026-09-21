import type { PosRecentSaleRecord } from "@/features/pos/post-sale-types";
import type { PaymentMode } from "@/features/pos/types";
import { prisma } from "@/lib/db/prisma";
import { branchOwnedWhere, resolveTenantScope } from "@/lib/db/tenant-scope";
import type { TenantContext } from "@/lib/db/write-context";

const db = prisma as any;

export function amount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function inferPaymentMode(payments: Array<{ paymentMethod: string }>): PaymentMode {
  if (payments.length === 0) {
    return "cash";
  }
  const methods = new Set(payments.map((payment) => payment.paymentMethod));
  if (methods.size > 1) {
    return "mixed";
  }
  const method = payments[0]?.paymentMethod;
  if (method === "transfer") return "transfer";
  if (method === "qr") return "qr";
  if (method === "visa" || method === "mastercard") return "card";
  return "cash";
}

export function mapDbSaleStatus(status: string): PosRecentSaleRecord["status"] {
  if (status === "cancelled" || status === "voided") return "voided";
  if (status === "refunded") return "refunded";
  if (status === "exchanged") return "exchanged";
  if (status === "adjusted") return "adjusted";
  if (status === "partial_refunded" || status === "partial_refund") return "partial_refunded";
  if (status === "completed") return "completed";
  if (status === "paid") return "paid";
  if (status === "deleted") return "deleted";
  return status as PosRecentSaleRecord["status"];
}

export async function resolveCashierName(tx: Record<string, any>, userId: string | null | undefined) {
  if (!userId) {
    return "Cashier";
  }
  const user = await tx.user.findFirst({
    select: { fullName: true, username: true },
    where: { id: userId },
  });
  return String(user?.fullName ?? user?.username ?? "Cashier");
}

export const postSaleInclude = {
  _count: { select: { items: true } },
  customer: { select: { fullName: true, phone: true } },
  items: {
    include: {
      product: { select: { barcode: true, nameEn: true, nameLo: true, sku: true } },
      unit: { select: { conversionQty: true, unitName: true } },
    },
  },
  payments: true,
  refunds: {
    include: {
      exchangeItems: true,
      items: true,
    },
  },
};

export function mapSaleRow(sale: Record<string, any>, cashierName: string): PosRecentSaleRecord {
  const payments = sale.payments ?? [];
  const paidAmount = payments.reduce((total: number, payment: Record<string, any>) => total + amount(payment.amount), 0);
  const refundedAmountLak = (sale.refunds ?? []).reduce(
    (total: number, refund: Record<string, any>) => total + amount(refund.totalAmount),
    0,
  );
  const items = (sale.items ?? []).map((item: Record<string, any>) => ({
    conversionQty: amount(item.unit?.conversionQty) || 1,
    id: String(item.productId),
    lineDiscountLak: amount(item.discountAmount),
    nameEn: String(item.product?.nameEn ?? item.product?.nameLo ?? "Item"),
    nameLo: String(item.product?.nameLo ?? item.product?.nameEn ?? "Item"),
    priceLak: amount(item.sellingPrice),
    quantity: amount(item.quantity),
    unitId: item.unitId ? String(item.unitId) : undefined,
    unitName: item.unit?.unitName ? String(item.unit.unitName) : undefined,
  }));
  const timeline = [
    { at: new Date(sale.createdAt).toISOString(), label: "Created", user: cashierName },
    ...(sale.refunds ?? []).map((refund: Record<string, any>) => ({
      at: new Date(refund.createdAt).toISOString(),
      label: String(refund.kind) === "exchange" ? "Exchanged" : "Returned",
      user: cashierName,
    })),
  ];
  return {
    branchId: String(sale.branchId),
    cashierName,
    changeAmount: amount(sale.changeAmount),
    createdAt: new Date(sale.createdAt).toISOString(),
    customerId: sale.customerId ? String(sale.customerId) : undefined,
    customerName: sale.customer?.fullName ? String(sale.customer.fullName) : "Guest",
    customerPhone: sale.customer?.phone ? String(sale.customer.phone) : undefined,
    discountAmount: amount(sale.discountAmount),
    discountPercent: amount(sale.discountPercent),
    id: String(sale.id),
    itemCount: Number(sale._count?.items ?? items.length) || items.length,
    items,
    paidAmount,
    paymentBreakdown: payments.map((payment: Record<string, any>) => ({
      amountLak: amount(payment.amount),
      method: String(payment.paymentMethod ?? "cash"),
    })),
    paymentMode: inferPaymentMode(payments),
    receiptNo: sale.receiptNo ? String(sale.receiptNo) : `RCPT-${sale.saleNo}`,
    remainingRefundableLak: Math.max(amount(sale.totalAmount) - refundedAmountLak, 0),
    refundedAmountLak,
    saleNo: String(sale.saleNo),
    status: mapDbSaleStatus(String(sale.saleStatus)),
    subtotal: amount(sale.subtotal),
    taxAmount: amount(sale.taxAmount),
    timeline,
    totalAmount: amount(sale.totalAmount),
    warehouseId: String(sale.warehouseId),
  };
}

export async function loadMutableSale(tx: Record<string, any>, tenant: TenantContext, saleId: string) {
  const scope = await resolveTenantScope(tenant, tx);
  const sale = await tx.sale.findFirst({
    include: postSaleInclude,
    where: {
      companyId: tenant.companyId,
      id: saleId,
      ...branchOwnedWhere(scope),
    },
  });
  if (!sale) {
    throw new Error("Sale was not found.");
  }
  return sale;
}

export async function lockSaleForUpdate(tx: Record<string, any>, tenant: TenantContext, saleId: string) {
  const rows = await tx.$queryRaw`
    SELECT id
    FROM sales
    WHERE id = ${saleId}
      AND company_id = ${tenant.companyId}
    FOR UPDATE
  `;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Sale was not found.");
  }
}

export async function getPrismaSaleById(tenant: TenantContext, saleId: string) {
  const scope = await resolveTenantScope(tenant);
  const sale = await db.sale.findFirst({
    include: postSaleInclude,
    where: {
      companyId: tenant.companyId,
      id: saleId,
      ...branchOwnedWhere(scope),
    },
  });
  if (!sale) {
    return null;
  }
  const cashierName = await resolveCashierName(db, sale.createdBy);
  return mapSaleRow(sale, cashierName);
}

export const RECENT_SALE_STATUSES = [
  "completed",
  "cancelled",
  "refunded",
  "partial_refunded",
  "exchanged",
  "adjusted",
] as const;

export const CASH_SESSION_SALE_STATUSES = [
  "completed",
  "partial_refunded",
  "exchanged",
  "adjusted",
  "refunded",
] as const;

export const REPORT_SALE_STATUSES = [
  "completed",
  "partial_refunded",
  "exchanged",
  "adjusted",
  "refunded",
] as const;
