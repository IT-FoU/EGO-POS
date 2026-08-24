export function roundLak(value: number) {
  return Math.round(Number.isFinite(value) ? value : 0);
}

function amount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export type AllocatedSaleItem = {
  id: string;
  originalPaidLak: number;
  quantity: number;
};

/**
 * Allocate the actual amount originally paid across sale lines.
 * Uses post-promotion line totals as weights so bill discount, loyalty,
 * promotion, and tax stay attached to the original paid amount — never today's shelf price.
 */
export function allocateOriginalPaidBySaleItem(sale: {
  items?: Array<{ id?: unknown; totalAmount?: unknown; quantity?: unknown }>;
  totalAmount?: unknown;
}): AllocatedSaleItem[] {
  const items = (sale.items ?? []).map((item) => ({
    id: String(item.id ?? ""),
    quantity: amount(item.quantity),
    weight: Math.max(amount(item.totalAmount), 0),
  }));
  const originalPaid = roundLak(amount(sale.totalAmount));
  const weightTotal = items.reduce((total, item) => total + item.weight, 0);

  if (items.length === 0 || originalPaid <= 0) {
    return items.map((item) => ({ id: item.id, originalPaidLak: 0, quantity: item.quantity }));
  }

  if (weightTotal <= 0) {
    const equalShare = Math.floor(originalPaid / items.length);
    return items.map((item, index) => ({
      id: item.id,
      originalPaidLak: index === items.length - 1 ? originalPaid - equalShare * (items.length - 1) : equalShare,
      quantity: item.quantity,
    }));
  }

  const allocated = items.map((item) => ({
    id: item.id,
    originalPaidLak: Math.floor((originalPaid * item.weight) / weightTotal),
    quantity: item.quantity,
    remainder: ((originalPaid * item.weight) / weightTotal) % 1,
  }));

  let leftover = originalPaid - allocated.reduce((total, item) => total + item.originalPaidLak, 0);
  const ranked = [...allocated].sort((a, b) => b.remainder - a.remainder);
  for (const row of ranked) {
    if (leftover <= 0) break;
    row.originalPaidLak += 1;
    leftover -= 1;
  }

  return allocated.map(({ id, originalPaidLak, quantity }) => ({ id, originalPaidLak, quantity }));
}

export function allocateReturnedAmount(input: {
  originalPaidLak: number;
  originalQuantity: number;
  alreadyRefundedLak: number;
  alreadyReturnedQty: number;
  returnQuantity: number;
}) {
  const remainingQty = roundQty(input.originalQuantity - input.alreadyReturnedQty);
  const remainingPaid = roundLak(input.originalPaidLak - input.alreadyRefundedLak);
  if (input.returnQuantity <= 0) {
    throw new Error("Return quantity must be greater than zero.");
  }
  if (input.returnQuantity - remainingQty > 1e-9) {
    throw new Error("Cannot return more than the remaining purchased quantity.");
  }
  if (remainingPaid < 0) {
    throw new Error("Remaining refundable amount is exhausted.");
  }
  if (Math.abs(input.returnQuantity - remainingQty) <= 1e-9) {
    return remainingPaid;
  }
  return roundLak(remainingPaid * (input.returnQuantity / remainingQty));
}

export function roundQty(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 1000) / 1000;
}
