/**
 * R6 Refund/Void + Receipt report semantics.
 * Reuses Batch H / STEP9 cash refund math. Voids = Sale.saleStatus cancelled (no Refund row).
 */
import { computeCashRefundLak } from "@/features/cash-sessions/cash-session-calculator";
import { refundAmountOf } from "@/features/reports/report-lifecycle";
import { moneyLak, SALES_TABLE_PAGE_SIZE, SALES_TABLE_SCAN_LIMIT } from "@/features/reports/sales-table-math";

export { moneyLak, SALES_TABLE_PAGE_SIZE as POSTSALE_TABLE_PAGE_SIZE, SALES_TABLE_SCAN_LIMIT as POSTSALE_TABLE_SCAN_LIMIT };

export const POSTSALE_EVENT_TYPES = [
  "all",
  "refund",
  "partial_refund",
  "full_refund",
  "void",
  "exchange",
] as const;

export type PostSaleEventType = (typeof POSTSALE_EVENT_TYPES)[number];
export type PostSaleEventTypeFilter = PostSaleEventType;

export function classifyRefundEventType(input: {
  kind: string;
  refundAmountLak: number;
  saleStatus: string;
  saleTotalLak: number;
}): Exclude<PostSaleEventType, "all"> {
  const kind = String(input.kind ?? "refund").toLowerCase();
  if (kind === "exchange") return "exchange";
  if (input.saleStatus === "partial_refunded") return "partial_refund";
  if (input.saleStatus === "refunded") return "full_refund";
  if (input.refundAmountLak > 0 && input.refundAmountLak + 0.5 < input.saleTotalLak) return "partial_refund";
  return "full_refund";
}

export function cashAndNoncashRefundLak(input: {
  payments: Array<{ amount?: unknown; changeAmount?: unknown; paymentMethod: string }>;
  refundAmountLak: number;
  saleTotalLak: number;
}) {
  const refundLak = moneyLak(input.refundAmountLak);
  const cashRefundLak = moneyLak(
    computeCashRefundLak(
      input.payments.map((payment) => ({
        amount: payment.amount ?? 0,
        changeAmount: payment.changeAmount,
        paymentMethod: payment.paymentMethod,
      })),
      input.saleTotalLak,
      refundLak,
    ),
  );
  const noncashRefundLak = Math.max(0, refundLak - cashRefundLak);
  return { cashRefundLak, noncashRefundLak, refundLak };
}

export function refundAmountFromRow(refund: Record<string, unknown>) {
  return moneyLak(refundAmountOf(refund));
}

export type PostSaleEventSummary = {
  cashRefundLak: number;
  itemsReturned: number;
  netPostSaleEffectLak: number;
  noncashRefundLak: number;
  refundAmountLak: number;
  refundTransactions: number;
  voidAmountLak: number;
  voidTransactions: number;
};

export function emptyPostSaleEventSummary(): PostSaleEventSummary {
  return {
    cashRefundLak: 0,
    itemsReturned: 0,
    netPostSaleEffectLak: 0,
    noncashRefundLak: 0,
    refundAmountLak: 0,
    refundTransactions: 0,
    voidAmountLak: 0,
    voidTransactions: 0,
  };
}

export function summarizePostSaleEvents(
  rows: Array<{
    cashRefundLak: number;
    items: number;
    noncashRefundLak: number;
    refundLak: number;
    type: string;
    voidLak: number;
  }>,
): PostSaleEventSummary {
  const summary = emptyPostSaleEventSummary();
  for (const row of rows) {
    if (row.type === "void") {
      summary.voidTransactions += 1;
      summary.voidAmountLak += moneyLak(row.voidLak);
    } else {
      summary.refundTransactions += 1;
      summary.refundAmountLak += moneyLak(row.refundLak);
      summary.cashRefundLak += moneyLak(row.cashRefundLak);
      summary.noncashRefundLak += moneyLak(row.noncashRefundLak);
      summary.itemsReturned += moneyLak(row.items);
    }
  }
  summary.netPostSaleEffectLak = moneyLak(-(summary.refundAmountLak + summary.voidAmountLak));
  return summary;
}

export function paymentLabelList(methods: string[]) {
  const unique = [...new Set(methods.filter(Boolean))];
  if (unique.length === 0) return ["cash"];
  return unique;
}

export function isMixedPayment(methods: string[]) {
  return new Set(methods.filter(Boolean)).size > 1;
}
