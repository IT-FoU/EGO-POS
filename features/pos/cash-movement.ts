export type CashMovementType = "cash_in" | "cash_out";

export const NO_OPEN_CASH_SHIFT_MESSAGE =
  "No open cash shift. Open a shift before recording cash movements.";

export function parseCashMovementAmountLak(raw: string) {
  const trimmed = raw.trim().replace(/,/g, "");
  if (!trimmed) {
    return { ok: false as const, reason: "empty" };
  }
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false as const, reason: "invalid" };
  }
  const amountLak = Number(trimmed);
  if (!Number.isSafeInteger(amountLak) || amountLak <= 0) {
    return { ok: false as const, reason: "invalid" };
  }
  return { ok: true as const, amountLak };
}

export function previewExpectedCashAfter(
  expectedCashLak: number,
  type: CashMovementType,
  amountLak: number,
) {
  return type === "cash_in" ? expectedCashLak + amountLak : expectedCashLak - amountLak;
}

export function claimCashMovementSubmit(lock: { current: boolean }) {
  if (lock.current) return false;
  lock.current = true;
  return true;
}
