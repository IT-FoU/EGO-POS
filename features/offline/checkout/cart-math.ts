/**
 * Pure offline cart / price / tax / discount / safe-promotion math (Phase 6A).
 *
 * These functions compute a cash-sale's monetary totals deterministically so the
 * offline checkout domain and (later) the UI can share one implementation. They
 * are pure (no DB, no browser) and unit-tested. The CLOUD remains the final
 * authority: on sync the server re-validates every amount and may reject a sale.
 *
 * Reuses the existing POS primitives where possible:
 * - `roundLak` (LAK is a zero-decimal currency),
 * - `cartLineSubtotal` / `requiredBaseQty` from `features/pos/pos-cart`.
 */

import { roundLak } from "@/features/pos/return-allocator";
import { cartLineSubtotal, requiredBaseQty } from "@/features/pos/pos-cart";

/** A cart line for math purposes: a unit price and a quantity in SELL units. */
export interface CartMathLine {
  unitPriceLak: number;
  quantity: number;
  /** Base-unit conversion (defaults to 1). Used only for base-quantity math. */
  conversionQty?: number;
}

/** A promotion reduced to the only fields safe to evaluate offline. */
export interface SafePromotion {
  id: string;
  status: string;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  /** Order-level percentage discount (0–100), if any. */
  discountPercent?: number | null;
  /** Order-level fixed LAK discount, if any. */
  discountAmountLak?: number | null;
}

export function lineTotalLak(line: CartMathLine): number {
  return roundLak(cartLineSubtotal({ priceLak: line.unitPriceLak, quantity: line.quantity }));
}

export function subtotalLak(lines: CartMathLine[]): number {
  return roundLak(lines.reduce((total, line) => total + cartLineSubtotal({ priceLak: line.unitPriceLak, quantity: line.quantity }), 0));
}

export function lineBaseQuantity(line: CartMathLine): number {
  return requiredBaseQty(line.quantity, line.conversionQty ?? 1);
}

function isPromotionActive(promotion: SafePromotion, now: Date): boolean {
  if (promotion.status !== "active") return false;
  const time = now.getTime();
  if (promotion.effectiveFrom) {
    const from = new Date(promotion.effectiveFrom).getTime();
    if (!Number.isNaN(from) && time < from) return false;
  }
  if (promotion.effectiveTo) {
    const to = new Date(promotion.effectiveTo).getTime();
    if (!Number.isNaN(to) && time > to) return false;
  }
  return true;
}

/**
 * Conservative, non-stacking safe-promotion discount: the single BEST active
 * order-level promotion (percentage or fixed amount), capped at the subtotal.
 * Deliberately does not stack promotions — the cloud remains authoritative and
 * may apply a richer (or different) result on sync.
 */
export function safePromotionDiscountLak(
  subtotal: number,
  promotions: SafePromotion[],
  now: Date = new Date(),
): number {
  let best = 0;
  for (const promotion of promotions) {
    if (!isPromotionActive(promotion, now)) continue;
    let candidate = 0;
    if (typeof promotion.discountPercent === "number" && promotion.discountPercent > 0) {
      candidate = Math.max(candidate, (subtotal * promotion.discountPercent) / 100);
    }
    if (typeof promotion.discountAmountLak === "number" && promotion.discountAmountLak > 0) {
      candidate = Math.max(candidate, promotion.discountAmountLak);
    }
    best = Math.max(best, candidate);
  }
  return roundLak(Math.min(best, subtotal));
}

export interface SaleTotalsInput {
  lines: CartMathLine[];
  taxRatePercent: number;
  taxInclusive: boolean;
  /** Manual (cashier) discount in LAK; capped so totals never go negative. */
  manualDiscountLak?: number;
  /** Safe promotions to evaluate offline (best single order-level one applies). */
  promotions?: SafePromotion[];
  now?: Date;
}

export interface SaleTotals {
  subtotalLak: number;
  promotionDiscountLak: number;
  manualDiscountLak: number;
  discountTotalLak: number;
  taxableAmountLak: number;
  taxRatePercent: number;
  taxInclusive: boolean;
  taxAmountLak: number;
  totalLak: number;
}

/**
 * Compute a cash sale's totals. Discounts reduce the taxable base; tax is either
 * extracted from an inclusive base or added to an exclusive base. All amounts are
 * rounded to whole LAK and clamped so nothing goes negative.
 */
export function computeSaleTotals(input: SaleTotalsInput): SaleTotals {
  const now = input.now ?? new Date();
  const subtotal = subtotalLak(input.lines);

  const promotionDiscount = input.promotions?.length
    ? safePromotionDiscountLak(subtotal, input.promotions, now)
    : 0;
  const manualDiscount = roundLak(Math.max(0, input.manualDiscountLak ?? 0));
  const discountTotal = Math.min(subtotal, promotionDiscount + manualDiscount);

  const taxableAmount = Math.max(0, subtotal - discountTotal);
  const rate = Math.max(0, Number(input.taxRatePercent) || 0) / 100;

  let taxAmount = 0;
  let total = taxableAmount;
  if (rate > 0) {
    if (input.taxInclusive) {
      taxAmount = roundLak(taxableAmount - taxableAmount / (1 + rate));
      total = taxableAmount;
    } else {
      taxAmount = roundLak(taxableAmount * rate);
      total = taxableAmount + taxAmount;
    }
  }

  return {
    subtotalLak: subtotal,
    promotionDiscountLak: promotionDiscount,
    manualDiscountLak: manualDiscount,
    discountTotalLak: discountTotal,
    taxableAmountLak: taxableAmount,
    taxRatePercent: input.taxRatePercent,
    taxInclusive: input.taxInclusive,
    taxAmountLak: taxAmount,
    totalLak: roundLak(total),
  };
}

/** Change owed for a cash tender. Never negative. */
export function cashChangeLak(totalLak: number, paidCashLak: number): number {
  return roundLak(Math.max(0, paidCashLak - totalLak));
}

/** Whether a cash tender covers the total (allowing exact payment). */
export function cashCovers(totalLak: number, paidCashLak: number): boolean {
  return roundLak(paidCashLak) + 1e-9 >= roundLak(totalLak);
}
