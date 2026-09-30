import { businessInstantParts, endOfBusinessDay, startOfBusinessDay } from "@/lib/datetime/business-timezone";

/**
 * Business-account entitlement math for EGO POS plans.
 *
 * The countdown anchor is the company registration instant (companies.created_at).
 * Remaining days = configured duration + account extra days - elapsed business calendar days.
 * A stored subscriptions.end_date is ignored so it cannot drift from that formula.
 *
 * The account stays valid through 23:59 on the last included calendar day
 * (Asia/Vientiane). It expires at the start of the next business day.
 *
 * Fallback when a Free plan has no duration_days yet: 30 days from the original
 * registration date. This default is replaced as soon as the plan row has a duration.
 * It does not create a new start date.
 *
 * POS access is not blocked unless enforceAccessBlock is explicitly true.
 * The store loader always passes false.
 */

export const UNCONFIGURED_FREE_PLAN_DURATION_DAYS = 30;
export const BUSINESS_PLAN_ACCESS_ENFORCEMENT_ENABLED = false;

const DAY_MS = 86_400_000;

export type PlanExpiryBehaviorCode = "BLOCK_ACCESS" | "FALLBACK_TO_FREE";
export type BusinessEntitlementStatus = "active" | "cancelled" | "expired" | "fallback_free" | "grace";
export type PlanDurationSource = "billing_cycle" | "plan" | "unconfigured_free_default";

export type BusinessEntitlementInput = {
  autoRenew?: boolean;
  autoRenewAvailable?: boolean;
  billingCycle?: "monthly" | "yearly" | null;
  companyCreatedAt: Date;
  durationDays?: number | null;
  enforceAccessBlock?: boolean;
  expiryBehavior?: PlanExpiryBehaviorCode | null;
  extraDays?: number | null;
  gracePeriodDays?: number | null;
  now?: Date;
  planName: string;
  storedEndDate?: Date | null;
  storedStatus?: "active" | "cancelled" | "expired" | null;
  subscriptionStartDate?: Date | null;
};

export type BusinessEntitlement = {
  accessBlocked: boolean;
  anchorAt: Date;
  autoRenew: boolean;
  autoRenewAvailable: boolean;
  billingCycle: "monthly" | "yearly" | null;
  displayPlanName: string;
  durationDays: number;
  durationSource: PlanDurationSource;
  effectiveDays: number;
  effectiveStatus: BusinessEntitlementStatus;
  elapsedDays: number;
  expiresAt: Date;
  expiryBehavior: PlanExpiryBehaviorCode;
  extraDays: number;
  gracePeriodDays: number;
  planName: string;
  registeredAt: Date;
  remainingDays: number;
  startDate: Date;
};

export type BusinessPlanLimits = {
  customLogo: boolean;
  maxBranches: number | null;
  maxCashiers: number | null;
  maxProducts: number | null;
  maxPromotions: number | null;
  maxReports: number | null;
  removeWatermark: boolean;
};

export type BusinessPlanHeaderStatus = {
  autoRenew: boolean;
  autoRenewAvailable: boolean;
  billingCycle: "monthly" | "yearly" | null;
  displayPlanName: string;
  durationDays: number;
  durationSource: PlanDurationSource;
  effectiveStatus: BusinessEntitlementStatus;
  expiresAt: string;
  expiryBehavior: PlanExpiryBehaviorCode;
  extraDays: number;
  gracePeriodDays: number;
  limits: BusinessPlanLimits;
  registeredAt: string;
  remainingDays: number;
  startDate: string;
};

export function formatPlanDisplayName(planName: string) {
  const trimmed = planName.trim().replace(/\s+/g, " ");
  if (!trimmed) return "Free Plan";
  const words = trimmed.split(" ");
  const titled = words
    .map((word, index) => {
      if (index === words.length - 1 && /^plan$/i.test(word)) return "Plan";
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
  return /plan$/i.test(titled) ? titled : `${titled} Plan`;
}

export function formatRemainingDayLabel(remainingDays: number) {
  return remainingDays === 1 ? "1 day" : `${remainingDays} days`;
}

export function isFreePlanName(planName: string) {
  return /^free(\s+plan)?$/i.test(planName.trim());
}

export function mapExpiryBehavior(value: string | null | undefined): PlanExpiryBehaviorCode {
  return value === "block_access" || value === "BLOCK_ACCESS" ? "BLOCK_ACCESS" : "FALLBACK_TO_FREE";
}

function wholeDays(value: number | null | undefined, fallback: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return fallback;
  return value;
}

function calendarDayNumber(date: Date) {
  const parts = businessInstantParts(date);
  return Math.floor(Date.UTC(parts.year, parts.month, parts.day) / DAY_MS);
}

function resolveDuration(input: BusinessEntitlementInput): { days: number; source: PlanDurationSource } {
  if (typeof input.durationDays === "number" && Number.isInteger(input.durationDays) && input.durationDays >= 0) {
    return { days: input.durationDays, source: "plan" };
  }
  if (isFreePlanName(input.planName)) {
    return { days: UNCONFIGURED_FREE_PLAN_DURATION_DAYS, source: "unconfigured_free_default" };
  }
  if (input.billingCycle === "yearly") return { days: 365, source: "billing_cycle" };
  if (input.billingCycle === "monthly") return { days: 30, source: "billing_cycle" };
  return { days: UNCONFIGURED_FREE_PLAN_DURATION_DAYS, source: "unconfigured_free_default" };
}

function expiryInstant(anchor: Date, effectiveDays: number) {
  const start = startOfBusinessDay(anchor);
  if (effectiveDays <= 0) return new Date(start.getTime() - 1);
  const lastDayStart = new Date(start.getTime() + (effectiveDays - 1) * DAY_MS);
  return endOfBusinessDay(lastDayStart);
}

export function resolveBusinessEntitlement(input: BusinessEntitlementInput): BusinessEntitlement {
  const now = input.now ?? new Date();
  const registeredAt = input.companyCreatedAt;
  const startDate = input.subscriptionStartDate ?? registeredAt;
  const duration = resolveDuration(input);
  const extraDays = wholeDays(input.extraDays, 0);
  const gracePeriodDays = wholeDays(input.gracePeriodDays, 0);
  const effectiveDays = duration.days + extraDays;
  const elapsedDays = Math.max(0, calendarDayNumber(now) - calendarDayNumber(registeredAt));
  const remainingDays = Math.max(0, effectiveDays - elapsedDays);
  const expiresAt = expiryInstant(registeredAt, effectiveDays);
  const graceEndsAt = new Date(expiresAt.getTime() + gracePeriodDays * DAY_MS);
  const expiryBehavior = input.expiryBehavior ?? "FALLBACK_TO_FREE";
  const withinEntitlement = now.getTime() <= expiresAt.getTime();
  const withinGrace = !withinEntitlement && now.getTime() <= graceEndsAt.getTime();
  const freePlan = isFreePlanName(input.planName);

  let effectiveStatus: BusinessEntitlementStatus = "active";
  if (input.storedStatus === "cancelled") {
    effectiveStatus = "cancelled";
  } else if (withinEntitlement) {
    effectiveStatus = "active";
  } else if (withinGrace) {
    effectiveStatus = "grace";
  } else if (expiryBehavior === "FALLBACK_TO_FREE" && !freePlan) {
    effectiveStatus = "fallback_free";
  } else {
    effectiveStatus = "expired";
  }

  const pastGrace = !withinEntitlement && !withinGrace && input.storedStatus !== "cancelled";
  const accessBlocked =
    pastGrace && expiryBehavior === "BLOCK_ACCESS" && input.enforceAccessBlock === true;

  return {
    accessBlocked,
    anchorAt: registeredAt,
    autoRenew: input.autoRenew === true,
    autoRenewAvailable: input.autoRenewAvailable === true,
    billingCycle: input.billingCycle ?? null,
    displayPlanName: formatPlanDisplayName(input.planName),
    durationDays: duration.days,
    durationSource: duration.source,
    effectiveDays,
    effectiveStatus,
    elapsedDays,
    expiresAt,
    expiryBehavior,
    extraDays,
    gracePeriodDays,
    planName: input.planName,
    registeredAt,
    remainingDays,
    startDate,
  };
}

export function toHeaderStatus(
  entitlement: BusinessEntitlement,
  limits: BusinessPlanLimits,
): BusinessPlanHeaderStatus {
  return {
    autoRenew: entitlement.autoRenew,
    autoRenewAvailable: entitlement.autoRenewAvailable,
    billingCycle: entitlement.billingCycle,
    displayPlanName: entitlement.displayPlanName,
    durationDays: entitlement.durationDays,
    durationSource: entitlement.durationSource,
    effectiveStatus: entitlement.effectiveStatus,
    expiresAt: entitlement.expiresAt.toISOString(),
    expiryBehavior: entitlement.expiryBehavior,
    extraDays: entitlement.extraDays,
    gracePeriodDays: entitlement.gracePeriodDays,
    limits,
    registeredAt: entitlement.registeredAt.toISOString(),
    remainingDays: entitlement.remainingDays,
    startDate: entitlement.startDate.toISOString(),
  };
}
