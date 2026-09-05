/**
 * Offline loyalty redemption allowance (Phase 3 foundation, requirements §6.4).
 *
 * Loyalty *earning* is queueable offline; *redemption* requires an unexpired
 * server-issued allowance (per member/terminal, capped by points and amount).
 * When no valid allowance exists, offline redemption is blocked (never
 * double-spent). Pure invariants here; the Prisma-backed issuer persists them.
 */

import type { OfflineAllowanceStatus } from "./types";

export interface LoyaltyAllowanceView {
  maxPoints: number;
  usedPoints: number;
  maxAmountLak: number;
  usedAmountLak: number;
  status: OfflineAllowanceStatus;
  expiresAt: string | null;
}

export function isAllowanceActive(allowance: LoyaltyAllowanceView, now: Date): boolean {
  if (allowance.status !== "active") return false;
  if (allowance.expiresAt) {
    const expiry = new Date(allowance.expiresAt).getTime();
    if (!Number.isNaN(expiry) && expiry <= now.getTime()) return false;
  }
  return true;
}

export function remainingPoints(allowance: LoyaltyAllowanceView, now: Date): number {
  if (!isAllowanceActive(allowance, now)) return 0;
  return Math.max(0, allowance.maxPoints - allowance.usedPoints);
}

export function remainingAmountLak(allowance: LoyaltyAllowanceView, now: Date): number {
  if (!isAllowanceActive(allowance, now)) return 0;
  return Math.max(0, allowance.maxAmountLak - allowance.usedAmountLak);
}

export interface RedeemRequest {
  points: number;
  amountLak: number;
}

export function canRedeem(
  allowance: LoyaltyAllowanceView | null,
  request: RedeemRequest,
  now: Date,
): boolean {
  if (!allowance) return false;
  if (request.points <= 0) return false;
  return (
    request.points <= remainingPoints(allowance, now) &&
    request.amountLak <= remainingAmountLak(allowance, now) + 1e-9
  );
}

export class LoyaltyAllowanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoyaltyAllowanceError";
  }
}

/** Pure: apply a redemption against the allowance. */
export function applyRedemption(
  allowance: LoyaltyAllowanceView,
  request: RedeemRequest,
  now: Date,
): LoyaltyAllowanceView {
  if (!canRedeem(allowance, request, now)) {
    throw new LoyaltyAllowanceError("Redemption exceeds or lacks a valid offline allowance");
  }
  const usedPoints = allowance.usedPoints + request.points;
  const usedAmountLak = allowance.usedAmountLak + request.amountLak;
  const status: OfflineAllowanceStatus =
    usedPoints >= allowance.maxPoints ? "used" : "active";
  return { ...allowance, usedPoints, usedAmountLak, status };
}
