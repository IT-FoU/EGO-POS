import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import {
  BUSINESS_PLAN_ACCESS_ENFORCEMENT_ENABLED,
  mapExpiryBehavior,
  resolveBusinessEntitlement,
  toHeaderStatus,
  type BusinessPlanHeaderStatus,
  type BusinessPlanLimits,
} from "@/features/business-plan/entitlement";

const EMPTY_LIMITS: BusinessPlanLimits = {
  customLogo: false,
  maxBranches: null,
  maxCashiers: null,
  maxProducts: null,
  maxPromotions: null,
  maxReports: null,
  removeWatermark: false,
};

function isMissingEntitlementSchema(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  if (code === "P2021" || code === "P2022") return true;
  const message = "message" in error ? String(error.message) : "";
  return /duration_days|extra_days|expiry_behavior|grace_period_days|auto_renew_available|auto_renew/i.test(message);
}

async function readConfiguredEntitlement(companyId: string) {
  try {
    const company = await prisma.company.findUnique({
      select: {
        plan: {
          select: {
            autoRenewAvailable: true,
            durationDays: true,
            expiryBehavior: true,
            gracePeriodDays: true,
          },
        },
        subscriptions: {
          orderBy: { startDate: "desc" },
          select: { autoRenew: true, extraDays: true },
          take: 1,
        },
      },
      where: { id: companyId },
    });
    const subscription = company?.subscriptions[0];
    return {
      autoRenew: subscription?.autoRenew ?? false,
      autoRenewAvailable: company?.plan?.autoRenewAvailable ?? false,
      durationDays: company?.plan?.durationDays ?? null,
      expiryBehavior: company?.plan?.expiryBehavior ?? null,
      extraDays: subscription?.extraDays ?? 0,
      gracePeriodDays: company?.plan?.gracePeriodDays ?? 0,
    };
  } catch (error) {
    if (isMissingEntitlementSchema(error)) return null;
    throw error;
  }
}

/**
 * Tenant-scoped read for the signed-in company only.
 * Missing subscription rows use companies.created_at. This function does not insert dates.
 * subscriptions.end_date is not selected.
 * Before the entitlement migration is applied, duration and extra days fall back to the
 * documented Free Plan default without writing a new registration date.
 */
export const loadBusinessPlanStatus = cache(async (companyId: string): Promise<BusinessPlanHeaderStatus | null> => {
  if (!companyId) return null;

  try {
    const company = await prisma.company.findUnique({
      select: {
        createdAt: true,
        id: true,
        plan: {
          select: {
            customLogo: true,
            maxBranches: true,
            maxCashiers: true,
            maxProducts: true,
            maxPromotions: true,
            maxReports: true,
            planName: true,
            removeWatermark: true,
          },
        },
        subscriptions: {
          orderBy: { startDate: "desc" },
          select: {
            billingCycle: true,
            startDate: true,
            status: true,
          },
          take: 1,
        },
      },
      where: { id: companyId },
    });

    if (!company) return null;

    const configured = await readConfiguredEntitlement(companyId);
    const subscription = company.subscriptions[0] ?? null;
    const planName = company.plan?.planName ?? "Free";
    const entitlement = resolveBusinessEntitlement({
      autoRenew: configured?.autoRenew ?? false,
      autoRenewAvailable: configured?.autoRenewAvailable ?? false,
      billingCycle: subscription?.billingCycle ?? null,
      companyCreatedAt: company.createdAt,
      durationDays: configured?.durationDays ?? null,
      enforceAccessBlock: BUSINESS_PLAN_ACCESS_ENFORCEMENT_ENABLED,
      expiryBehavior: mapExpiryBehavior(configured?.expiryBehavior),
      extraDays: configured?.extraDays ?? 0,
      gracePeriodDays: configured?.gracePeriodDays ?? 0,
      planName,
      storedStatus: subscription?.status ?? "active",
      subscriptionStartDate: subscription?.startDate ?? null,
    });

    const limits: BusinessPlanLimits = company.plan
      ? {
          customLogo: company.plan.customLogo,
          maxBranches: company.plan.maxBranches,
          maxCashiers: company.plan.maxCashiers,
          maxProducts: company.plan.maxProducts,
          maxPromotions: company.plan.maxPromotions,
          maxReports: company.plan.maxReports,
          removeWatermark: company.plan.removeWatermark,
        }
      : EMPTY_LIMITS;

    return toHeaderStatus(entitlement, limits);
  } catch (error) {
    if (isMissingEntitlementSchema(error)) return null;
    throw error;
  }
});
