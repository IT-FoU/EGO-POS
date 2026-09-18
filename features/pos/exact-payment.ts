import type { PaymentMode } from "@/features/pos/types";

export type ExactPaymentAmounts = {
  cashAmount: number;
  qrAmount: number;
  transferAmount: number;
  cardAmount: number;
};

export type ExactPaymentMethod = "cash" | "qr" | "transfer" | "card";

/** Remaining unpaid amount after all entered payment splits. */
export function remainingDue(totalAmount: number, amounts: ExactPaymentAmounts): number {
  const paid =
    amounts.cashAmount + amounts.qrAmount + amounts.transferAmount + amounts.cardAmount;
  return Math.max(totalAmount - paid, 0);
}

/**
 * Fill one payment method so Paid covers Total, preserving other methods.
 * Returns null when Due is already zero (Exact should no-op / stay disabled).
 */
export function applyExactPaymentToMethod(
  method: ExactPaymentMethod,
  totalAmount: number,
  amounts: ExactPaymentAmounts,
): ExactPaymentAmounts | null {
  const due = remainingDue(totalAmount, amounts);
  if (due <= 0) {
    return null;
  }

  const others =
    (method === "cash" ? 0 : amounts.cashAmount) +
    (method === "qr" ? 0 : amounts.qrAmount) +
    (method === "transfer" ? 0 : amounts.transferAmount) +
    (method === "card" ? 0 : amounts.cardAmount);

  const nextForMethod = Math.max(totalAmount - others, 0);

  return {
    cashAmount: method === "cash" ? nextForMethod : amounts.cashAmount,
    qrAmount: method === "qr" ? nextForMethod : amounts.qrAmount,
    transferAmount: method === "transfer" ? nextForMethod : amounts.transferAmount,
    cardAmount: method === "card" ? nextForMethod : amounts.cardAmount,
  };
}

/** Map active POS payment mode to the Exact target method (mixed handled separately). */
export function exactMethodForPaymentMode(mode: PaymentMode): ExactPaymentMethod | null {
  if (mode === "cash" || mode === "qr" || mode === "transfer" || mode === "card") {
    return mode;
  }
  return null;
}
