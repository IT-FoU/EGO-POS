import type { PaymentMode, PosCartItem } from "@/features/pos/types";

type PersistedSale = {
  changeAmount?: unknown;
  createdAt?: Date | string;
  customer?: { fullName?: string | null } | null;
  discountAmount?: unknown;
  id: string;
  items?: Array<{
    product?: { nameEn?: string | null; nameLo?: string | null } | null;
    productId: string;
    quantity?: unknown;
    sellingPrice?: unknown;
    unit?: { conversionQty?: unknown; unitName?: string | null } | null;
    unitId?: string | null;
  }>;
  payments?: Array<{ amount?: unknown; paymentMethod?: string }>;
  receiptNo?: string | null;
  saleNo: string;
  subtotal?: unknown;
  taxAmount?: unknown;
  totalAmount?: unknown;
};

function money(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function inferPaymentMode(payments: Array<{ paymentMethod: string }>): PaymentMode {
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

export function receiptSnapshotFromPersistedSale(
  sale: PersistedSale,
  context: {
    branchName: string;
    cashierName: string;
    customerName?: string;
  },
) {
  const payments = sale.payments ?? [];
  const paidAmount = payments.reduce((total, payment) => total + money(payment.amount), 0);
  const paymentMode = inferPaymentMode(
    payments.map((payment) => ({ paymentMethod: String(payment.paymentMethod ?? "cash") })),
  ) as PaymentMode;

  const cartItems = (sale.items ?? []).map((item) => ({
    barcode: "",
    cartLineId: `${item.productId}:${item.unitId ?? "default"}`,
    categoryName: "",
    conversionQty: money(item.unit?.conversionQty ?? 1) || 1,
    id: item.productId,
    imageKey: "generic",
    nameEn: item.product?.nameEn || item.product?.nameLo || "Item",
    nameLo: item.product?.nameLo || item.product?.nameEn || "Item",
    priceLak: money(item.sellingPrice),
    quantity: money(item.quantity),
    retailPriceLak: money(item.sellingPrice),
    sku: "",
    stockQty: 0,
    unitId: item.unitId ?? undefined,
    unitName: item.unit?.unitName || "Piece",
  })) as PosCartItem[];

  return {
    branchName: context.branchName,
    cartItems,
    cashierName: context.cashierName,
    /** STEP 8: persisted sale id for canonical audited reprint path. */
    saleId: sale.id,
    changeAmount: money(sale.changeAmount),
    createdAt: sale.createdAt instanceof Date ? sale.createdAt.toISOString() : String(sale.createdAt ?? new Date().toISOString()),
    customerName: context.customerName || sale.customer?.fullName || "Guest",
    discountTotal: money(sale.discountAmount),
    paidAmount,
    paymentMode,
    receiptNo: sale.receiptNo || `RCPT-${sale.saleNo}`,
    saleNo: sale.saleNo,
    subtotal: money(sale.subtotal),
    taxAmount: money(sale.taxAmount),
    totalAmount: money(sale.totalAmount),
  };
}
