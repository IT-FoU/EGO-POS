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
