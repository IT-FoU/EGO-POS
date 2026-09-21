import type { CashSessionTotals } from "@/features/cash-sessions/types";

export const CASH_OUT_EXCEEDS_EXPECTED_MESSAGE = "Cash Out amount cannot exceed Expected Cash.";

function amount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function cashSessionLedgerLockKey(sessionId: string) {
  return `cash_session:${sessionId}`;
}

export function assertCashOutWithinExpected(amountLak: number, expectedCashLak: number) {
  if (amountLak > expectedCashLak) {
    throw new Error(CASH_OUT_EXCEEDS_EXPECTED_MESSAGE);
  }
}

export function calculateExpectedCash(input: {
  cashInLak: number;
  cashOutLak: number;
  cashSalesLak: number;
  openingCashLak: number;
  refundLak: number;
  voidCashLak: number;
}) {
  return Math.round(
    input.openingCashLak +
      input.cashSalesLak +
      input.cashInLak -
      input.cashOutLak -
      input.refundLak -
      input.voidCashLak,
  );
}

export function calculateVariance(countedCashLak: number, expectedCashLak: number) {
  return Math.round(countedCashLak - expectedCashLak);
}

/** Reconciliation label only — does not mutate accounting. */
export function varianceStatus(varianceLak: number): "exact" | "over" | "short" {
  if (varianceLak === 0) return "exact";
  if (varianceLak > 0) return "over";
  return "short";
}

export function sumCashTransactions(
  transactions: Array<{ amount: unknown; transactionType: string }>,
  type: "cash_in" | "cash_out",
) {
  return Math.round(
    transactions
      .filter((transaction) => transaction.transactionType === type)
      .reduce((total, transaction) => total + amount(transaction.amount), 0),
  );
}

export function summarizeSalePayments(
  payments: Array<{ amount: unknown; changeAmount?: unknown; paymentMethod: string }>,
) {
  let cashSalesLak = 0;
  let nonCashSalesLak = 0;

  for (const payment of payments) {
    const paymentAmount = amount(payment.amount);
    if (payment.paymentMethod === "cash") {
      cashSalesLak += paymentAmount - amount(payment.changeAmount);
    } else {
      nonCashSalesLak += paymentAmount;
    }
  }

  return {
    cashSalesLak: Math.round(cashSalesLak),
    nonCashSalesLak: Math.round(nonCashSalesLak),
  };
}

export function buildCashSessionTotals(input: {
  cashInLak: number;
  cashOutLak: number;
  cashSalesLak: number;
  nonCashSalesLak: number;
  openingCashLak: number;
  refundLak: number;
  voidCashLak: number;
}): CashSessionTotals {
  return {
    ...input,
    expectedCashLak: calculateExpectedCash(input),
  };
}

export function computeCashRefundLak(
  payments: Array<{ amount: unknown; changeAmount?: unknown; paymentMethod: string }>,
  saleTotalLak: number,
  refundAmountLak: number,
) {
  const saleTotal = amount(saleTotalLak);
  if (saleTotal <= 0) {
    return 0;
  }
  const cashPortion = summarizeSalePayments(payments).cashSalesLak;
  const ratio = Math.min(amount(refundAmountLak) / saleTotal, 1);
  return Math.round(cashPortion * ratio);
}

export type CashSessionPaymentRow = {
  amount: unknown;
  changeAmount?: unknown;
  paymentMethod: string;
};

export type CashSessionRefundRow = {
  id?: string | null;
  kind?: string | null;
  paymentAmount?: unknown;
  refundAmount?: unknown;
  refundMethod?: string | null;
  sale?: {
    payments?: CashSessionPaymentRow[] | null;
    saleStatus?: string | null;
    totalAmount?: unknown;
  } | null;
  totalAmount?: unknown;
};

/** Drawer cash-out / exchange cash-in for one persisted refund or exchange row. */
export function cashDrawerEffectFromRefundRow(refund: CashSessionRefundRow) {
  const saleStatus = String(refund.sale?.saleStatus ?? "");
  if (saleStatus === "cancelled") {
    return { exchangeCashInLak: 0, refundLak: 0 };
  }

  const kind = String(refund.kind ?? "refund");
  const method = String(refund.refundMethod ?? "cash");
  const refundAmount =
    amount(refund.refundAmount) || (kind === "refund" ? amount(refund.totalAmount) : 0);
  const paymentAmount = amount(refund.paymentAmount);

  if (kind === "exchange") {
    if (method !== "cash") {
      return { exchangeCashInLak: 0, refundLak: 0 };
    }
    return { exchangeCashInLak: paymentAmount, refundLak: refundAmount };
  }

  if (method !== "cash") {
    return { exchangeCashInLak: 0, refundLak: 0 };
  }

  return {
    exchangeCashInLak: 0,
    refundLak: computeCashRefundLak(
      refund.sale?.payments ?? [],
      amount(refund.sale?.totalAmount),
      refundAmount,
    ),
  };
}

/**
 * Gross cash sales stay on original tender (including fully refunded sales).
 * Cash refunds use persisted refund rows + original sale payments (cash component only).
 * Voids stay on cancelled payments: added to gross then subtracted as voidCashLak.
 */
export function aggregateCashSessionLedger(input: {
  openingCashLak: number;
  payments: CashSessionPaymentRow[];
  refundRows: CashSessionRefundRow[];
  transactions?: Array<{ amount: unknown; transactionType: string }>;
  voidedPayments?: CashSessionPaymentRow[];
}): CashSessionTotals {
  const paymentTotals = summarizeSalePayments(input.payments);
  const voidCashLak = Math.round(summarizeSalePayments(input.voidedPayments ?? []).cashSalesLak);
  const cashInLak = sumCashTransactions(input.transactions ?? [], "cash_in");
  const cashOutLak = sumCashTransactions(input.transactions ?? [], "cash_out");

  const seenRefundIds = new Set<string>();
  let refundLak = 0;
  let exchangeCashInLak = 0;
  for (const refund of input.refundRows) {
    const refundId = refund.id != null && String(refund.id).trim() ? String(refund.id) : "";
    if (refundId) {
      if (seenRefundIds.has(refundId)) {
        continue;
      }
      seenRefundIds.add(refundId);
    }
    const effect = cashDrawerEffectFromRefundRow(refund);
    refundLak += effect.refundLak;
    exchangeCashInLak += effect.exchangeCashInLak;
  }

  return buildCashSessionTotals({
    cashInLak,
    cashOutLak,
    cashSalesLak: paymentTotals.cashSalesLak + Math.round(exchangeCashInLak) + voidCashLak,
    nonCashSalesLak: paymentTotals.nonCashSalesLak,
    openingCashLak: Math.round(amount(input.openingCashLak)),
    refundLak: Math.round(refundLak),
    voidCashLak,
  });
}
