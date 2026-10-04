/**
 * Loyalty V2 point policy.
 *
 * Redemption ceiling is the smallest of the balance, the payable cap
 * (floor of payable / point value), and the optional per-sale maximum.
 * Partial redemption is allowed unless the company turns it off. When it is
 * off, a sale may redeem the full ceiling or nothing.
 *
 * Promotions and manual discounts are applied before redemption. Earning uses
 * the payable total after those discounts and after redemption. When
 * redemption with discounts is off, any promotion or manual discount rejects
 * redemption on the server.
 *
 * Partial void/refund reversal is proportional to the cumulative refunded
 * payable divided by the original sale total. The sale stores one earn total,
 * so this is the deterministic fallback. A full void or full refund restores
 * the remaining earn and redeem so rounding leftovers are not left behind.
 *
 * Expiry walks the ledger in time order. Positive rows open FIFO lots.
 * Negative rows consume the oldest lots. Lots older than the window are
 * written as new expire rows. Historical earn rows are not rewritten.
 */

export type LoyaltyExpiryUnit = "days" | "months";

export type LoyaltyPointPolicy = {
  allowPartial: boolean;
  allowRedeemWithDiscount: boolean;
  expiryDays: number | null;
  expiryEnabled: boolean;
  expiryUnit: LoyaltyExpiryUnit;
  maxRedeemPoints: number | null;
};

export const DEFAULT_LOYALTY_POINT_POLICY: LoyaltyPointPolicy = {
  allowPartial: true,
  allowRedeemWithDiscount: true,
  expiryDays: null,
  expiryEnabled: false,
  expiryUnit: "days",
  maxRedeemPoints: null,
};

function whole(value: unknown) {
  const parsed = Math.floor(Number(value ?? 0));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function loyaltyPolicyFromSettingsRow(row: Record<string, unknown> | null | undefined): LoyaltyPointPolicy {
  const source = row ?? {};
  const maxRedeem = whole(source.loyaltyMaxRedeemPoints);
  const expiryDays = whole(source.loyaltyExpiryDays);
  return {
    allowPartial: source.loyaltyAllowPartial !== false,
    allowRedeemWithDiscount: source.loyaltyAllowRedeemWithDiscount !== false,
    expiryDays: expiryDays > 0 ? expiryDays : null,
    expiryEnabled: source.loyaltyExpiryEnabled === true,
    expiryUnit: source.loyaltyExpiryUnit === "months" ? "months" : "days",
    maxRedeemPoints: maxRedeem > 0 ? maxRedeem : null,
  };
}

export function expiryWindowDays(policy: LoyaltyPointPolicy) {
  if (!policy.expiryEnabled || !policy.expiryDays || policy.expiryDays < 1) return 0;
  return policy.expiryUnit === "months" ? policy.expiryDays * 30 : policy.expiryDays;
}

export function redemptionCeiling(input: {
  balance: number;
  maxRedeemPoints?: number | null;
  payableLak: number;
  pointValueLak: number;
}) {
  const balance = Math.max(whole(input.balance), 0);
  const byPayable = input.pointValueLak > 0 ? Math.floor(Math.max(Number(input.payableLak) || 0, 0) / input.pointValueLak) : 0;
  const cap = input.maxRedeemPoints && input.maxRedeemPoints > 0 ? whole(input.maxRedeemPoints) : byPayable;
  return Math.max(Math.min(balance, byPayable, cap), 0);
}

export function acceptedRedeemPoints(input: {
  allowPartial: boolean;
  allowRedeemWithDiscount: boolean;
  balance: number;
  hasPromotionOrManualDiscount: boolean;
  maxRedeemPoints?: number | null;
  payableLak: number;
  pointValueLak: number;
  requestedPoints: number;
}) {
  if (!input.allowRedeemWithDiscount && input.hasPromotionOrManualDiscount) return 0;
  const ceiling = redemptionCeiling(input);
  const requested = Math.max(whole(input.requestedPoints), 0);
  if (requested <= 0 || ceiling <= 0) return 0;
  if (!input.allowPartial) return ceiling;
  return Math.min(requested, ceiling);
}

export function assertRedemptionAllowed(input: {
  allowPartial: boolean;
  allowRedeemWithDiscount: boolean;
  balance: number;
  hasPromotionOrManualDiscount: boolean;
  maxRedeemPoints?: number | null;
  minRedeemPoints: number;
  payableLak: number;
  pointValueLak: number;
  redeemPoints: number;
}) {
  const redeemPoints = Math.max(whole(input.redeemPoints), 0);
  if (redeemPoints <= 0) return { ceiling: redemptionCeiling(input), redeemPoints: 0 };
  if (!input.allowRedeemWithDiscount && input.hasPromotionOrManualDiscount) {
    throw new Error("Loyalty redemption is not allowed while a promotion or discount is applied.");
  }
  const ceiling = redemptionCeiling(input);
  if (redeemPoints < input.minRedeemPoints) {
    throw new Error(`Minimum redeem points is ${input.minRedeemPoints}.`);
  }
  if (input.balance < redeemPoints) {
    throw new Error(`Insufficient loyalty points. Available ${input.balance}, requested ${redeemPoints}.`);
  }
  if (redeemPoints > ceiling) {
    throw new Error(`Redeem points exceed sale amount. Maximum redeemable points ${ceiling}.`);
  }
  if (!input.allowPartial && redeemPoints !== ceiling) {
    throw new Error("Partial loyalty redemption is disabled.");
  }
  return { ceiling, redeemPoints };
}

export function loyaltyReversalDelta(input: {
  fullyReturned: boolean;
  originalEarn: number;
  originalRedeem: number;
  originalTotal: number;
  refundedAmountLak: number;
  reversedEarn: number;
  reversedRedeem: number;
}) {
  const ratio = input.originalTotal > 0
    ? Math.min(Math.max(Number(input.refundedAmountLak) / input.originalTotal, 0), 1)
    : input.fullyReturned ? 1 : 0;
  const targetEarn = input.fullyReturned ? input.originalEarn : Math.floor(input.originalEarn * ratio);
  const targetRedeem = input.fullyReturned ? input.originalRedeem : Math.floor(input.originalRedeem * ratio);
  return {
    deltaEarn: Math.max(targetEarn - input.reversedEarn, 0),
    deltaRedeem: Math.max(targetRedeem - input.reversedRedeem, 0),
  };
}

type LedgerPointRow = { createdAt: Date | string; points: number };

export function expiredPointsFromLedger(rows: LedgerPointRow[], now: Date, expiryDays: number) {
  if (expiryDays < 1) return 0;
  const windowMs = expiryDays * 24 * 60 * 60 * 1000;
  const lots: Array<{ expiresAt: number; remaining: number }> = [];
  for (const row of rows) {
    const points = whole(row.points);
    if (points > 0) {
      const created = new Date(row.createdAt).getTime();
      if (!Number.isFinite(created)) continue;
      lots.push({ expiresAt: created + windowMs, remaining: points });
      continue;
    }
    let left = -points;
    for (const lot of lots) {
      if (left <= 0) break;
      const take = Math.min(lot.remaining, left);
      lot.remaining -= take;
      left -= take;
    }
  }
  const nowMs = now.getTime();
  return lots.reduce((total, lot) => total + (lot.expiresAt <= nowMs ? lot.remaining : 0), 0);
}
