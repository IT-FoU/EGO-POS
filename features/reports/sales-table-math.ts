/**
 * Shared R2 sales-table accounting.
 *
 * Reuses STEP9 / assembleDashboardSalesKpis semantics:
 * - Gross = original qualifying `sales.total_amount` (discount already applied).
 * - Discount is displayed from persisted `discount_amount` and is NOT subtracted again for Net.
 * - Refund = persisted refund amount (`refundAmount`, else refund `totalAmount`).
 * - Void = cancelled sale original total; cancelled sales are excluded from Gross/Net/Cost/Profit.
 * - Net = Gross + lifecycle revenue delta (refunds reduce net; exchanges net payment − refund).
 * - Cost = sale-item `cost_price` snapshot × qty ± lifecycle COGS.
 * - Profit = persisted `profit_amount` ± lifecycle profit.
 */
import { netReportLifecycle, refundAmountOf } from "@/features/reports/report-lifecycle";

export const SALES_TABLE_STATUSES = [
  "completed",
  "partial_refunded",
  "refunded",
  "cancelled",
  "exchanged",
  "adjusted",
] as const;

export type SalesTableStatus = (typeof SALES_TABLE_STATUSES)[number];

export const SALES_TABLE_PAYMENT_METHODS = ["cash", "qr", "transfer", "visa", "mastercard"] as const;
export type SalesTablePaymentMethod = (typeof SALES_TABLE_PAYMENT_METHODS)[number];

export const SALES_TABLE_PAGE_SIZE = 50;
export const SALES_TABLE_SCAN_LIMIT = 5000;

export function moneyLak(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

export function isVoidSaleStatus(status: string) {
  return status === "cancelled";
}

export function isGrossQualifyingStatus(status: string) {
  return (
    status === "completed" ||
    status === "partial_refunded" ||
    status === "exchanged" ||
    status === "adjusted" ||
    status === "refunded"
  );
}

export function isSalesTableStatus(status: string): status is SalesTableStatus {
  return (SALES_TABLE_STATUSES as readonly string[]).includes(status);
}

export function netTenderLak(payment: { amount?: unknown; changeAmount?: unknown; paymentMethod?: unknown }) {
  const amount = moneyLak(payment.amount);
  const method = String(payment.paymentMethod ?? "cash");
  if (method === "cash") {
    return amount - moneyLak(payment.changeAmount);
  }
  return amount;
}

export function isCardPaymentMethod(method: string) {
  return method === "visa" || method === "mastercard" || method === "card";
}

export type SaleReportItemFact = {
  costPrice: unknown;
  id: string;
  profitAmount?: unknown;
  quantity: unknown;
};

export type SaleReportPaymentFact = {
  amount: unknown;
  changeAmount?: unknown;
  paymentMethod: string;
};

export type SaleReportFacts = {
  createdAt: Date;
  createdBy: string;
  discountAmount: unknown;
  id: string;
  items: SaleReportItemFact[];
  payments: SaleReportPaymentFact[];
  profitAmount: unknown;
  receiptNo: string | null;
  refunds: Array<Record<string, unknown>>;
  saleNo: string;
  saleStatus: string;
  totalAmount: unknown;
};

export type SaleReportRowMetrics = {
  costLak: number;
  discountLak: number;
  grossLak: number;
  itemsDisplay: number;
  itemsSold: number;
  netLak: number;
  profitLak: number;
  qualifying: boolean;
  refundLak: number;
  saleId: string;
  voidLak: number;
};

export function computeSaleReportMetrics(sale: SaleReportFacts): SaleReportRowMetrics {
  const originalGross = moneyLak(sale.totalAmount);
  const originalDiscount = moneyLak(sale.discountAmount);
  const originalProfit = moneyLak(sale.profitAmount);
  const originalQty = sale.items.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
  const originalCost = sale.items.reduce(
    (sum, item) => sum + moneyLak(item.costPrice) * Number(item.quantity ?? 0),
    0,
  );
  const refundLak = sale.refunds.reduce((sum, refund) => sum + refundAmountOf(refund), 0);
  const lifecycle = netReportLifecycle(sale.refunds, sale.items);

  if (isVoidSaleStatus(sale.saleStatus)) {
    return {
      costLak: 0,
      discountLak: originalDiscount,
      grossLak: 0,
      itemsDisplay: originalQty,
      itemsSold: 0,
      netLak: 0,
      profitLak: 0,
      qualifying: false,
      refundLak: 0,
      saleId: sale.id,
      voidLak: originalGross,
    };
  }

  if (!isGrossQualifyingStatus(sale.saleStatus)) {
    return {
      costLak: 0,
      discountLak: 0,
      grossLak: 0,
      itemsDisplay: originalQty,
      itemsSold: 0,
      netLak: 0,
      profitLak: 0,
      qualifying: false,
      refundLak: 0,
      saleId: sale.id,
      voidLak: 0,
    };
  }

  return {
    costLak: moneyLak(originalCost + lifecycle.cogsLak),
    discountLak: originalDiscount,
    grossLak: originalGross,
    itemsDisplay: originalQty,
    itemsSold: originalQty + lifecycle.quantitySold,
    netLak: moneyLak(originalGross + lifecycle.revenueLak),
    profitLak: moneyLak(originalProfit + lifecycle.profitLak),
    qualifying: true,
    refundLak,
    saleId: sale.id,
    voidLak: 0,
  };
}

export type SalesTableSummary = {
  bills: number;
  costLak: number;
  discountLak: number;
  grossLak: number;
  itemsSold: number;
  netLak: number;
  profitLak: number;
  refundLak: number;
  voidLak: number;
};

export function emptySalesTableSummary(): SalesTableSummary {
  return {
    bills: 0,
    costLak: 0,
    discountLak: 0,
    grossLak: 0,
    itemsSold: 0,
    netLak: 0,
    profitLak: 0,
    refundLak: 0,
    voidLak: 0,
  };
}

export function summarizeSaleMetrics(rows: SaleReportRowMetrics[]): SalesTableSummary {
  return rows.reduce<SalesTableSummary>((summary, row) => {
    summary.bills += row.qualifying ? 1 : 0;
    summary.costLak += row.costLak;
    summary.discountLak += row.qualifying ? row.discountLak : 0;
    summary.grossLak += row.grossLak;
    summary.itemsSold += row.itemsSold;
    summary.netLak += row.netLak;
    summary.profitLak += row.profitLak;
    summary.refundLak += row.refundLak;
    summary.voidLak += row.voidLak;
    return summary;
  }, emptySalesTableSummary());
}

export function addSalesTableSummaries(left: SalesTableSummary, right: SalesTableSummary): SalesTableSummary {
  return {
    bills: left.bills + right.bills,
    costLak: left.costLak + right.costLak,
    discountLak: left.discountLak + right.discountLak,
    grossLak: left.grossLak + right.grossLak,
    itemsSold: left.itemsSold + right.itemsSold,
    netLak: left.netLak + right.netLak,
    profitLak: left.profitLak + right.profitLak,
    refundLak: left.refundLak + right.refundLak,
    voidLak: left.voidLak + right.voidLak,
  };
}

export type PaymentMethodTotals = {
  bills: number;
  cardLak: number;
  cashLak: number;
  mastercardLak: number;
  qrLak: number;
  totalPaidLak: number;
  transferLak: number;
  visaLak: number;
};

export function emptyPaymentMethodTotals(): PaymentMethodTotals {
  return {
    bills: 0,
    cardLak: 0,
    cashLak: 0,
    mastercardLak: 0,
    qrLak: 0,
    totalPaidLak: 0,
    transferLak: 0,
    visaLak: 0,
  };
}

export function accumulatePaymentMethod(totals: PaymentMethodTotals, method: string, amountLak: number) {
  const value = moneyLak(amountLak);
  totals.totalPaidLak += value;
  if (method === "cash") totals.cashLak += value;
  else if (method === "qr") totals.qrLak += value;
  else if (method === "transfer") totals.transferLak += value;
  else if (method === "visa") {
    totals.visaLak += value;
    totals.cardLak += value;
  } else if (method === "mastercard") {
    totals.mastercardLak += value;
    totals.cardLak += value;
  } else if (method === "card") {
    totals.visaLak += value;
    totals.cardLak += value;
  }
}

export function paymentMethodsOnSale(payments: SaleReportPaymentFact[]) {
  const unique: string[] = [];
  for (const payment of payments) {
    const method = String(payment.paymentMethod ?? "cash");
    if (!unique.includes(method)) unique.push(method);
  }
  return unique;
}

export function saleStatusCopyKey(status: string) {
  switch (status) {
    case "completed":
      return "saleStatusCompleted";
    case "partial_refunded":
      return "saleStatusPartialRefunded";
    case "refunded":
      return "saleStatusRefunded";
    case "cancelled":
      return "saleStatusCancelled";
    case "exchanged":
      return "saleStatusExchanged";
    case "adjusted":
      return "saleStatusAdjusted";
    default:
      return "status";
  }
}
