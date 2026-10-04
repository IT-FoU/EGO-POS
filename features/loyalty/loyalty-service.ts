import type { TenantContext } from "@/lib/db/write-context";
import { numberValue, withTenantTransaction } from "@/lib/db/write-context";
import { branchOwnedWhere, resolveTenantScope } from "@/lib/db/tenant-scope";
import { assertPermission, WRITE_PERMISSIONS } from "@/lib/auth/permissions";
import { evaluateLoyaltyEarning, formatEarnNote, type LoyaltyEarnLine } from "@/features/loyalty/earning-rules";
import { listActiveLoyaltyRules } from "@/features/loyalty/earning-rule-repository";
import {
  assertRedemptionAllowed,
  expiredPointsFromLedger,
  expiryWindowDays,
  loyaltyPolicyFromSettingsRow,
  loyaltyReversalDelta,
  type LoyaltyPointPolicy,
} from "@/features/loyalty/point-policy";

function amount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function membershipSubscriptionValid(customer: Record<string, any>) {
  const subscriptions: Array<Record<string, any>> = customer.subscriptions ?? [];
  if (subscriptions.length === 0) {
    return true;
  }
  const endDate = subscriptions[0]?.endDate;
  if (!endDate) {
    return false;
  }
  const expiry = new Date(endDate).toISOString().slice(0, 10);
  return new Date(`${expiry}T23:59:59`).getTime() >= Date.now();
}

export function isMembershipEligibleForBenefits(customer: Record<string, any> | null) {
  if (!customer || customer.status !== "active") {
    return false;
  }
  if (!customer.membershipLevelId && !customer.membershipLevel) {
    return false;
  }
  return membershipSubscriptionValid(customer);
}

export function resolveMembershipDiscountPercent(customer: Record<string, any> | null) {
  if (!isMembershipEligibleForBenefits(customer)) {
    return 0;
  }

  const percent = numberValue(customer!.membershipLevel?.discountPercent);
  return percent > 0 ? Math.min(percent, 100) : 0;
}

export function isMembershipBenefitActive(customer: Record<string, any> | null) {
  return resolveMembershipDiscountPercent(customer) > 0;
}

async function assertNoDuplicateLedgerEntry(
  tx: Record<string, any>,
  saleId: string,
  pointType: "earn" | "redeem",
) {
  const existing = await tx.loyaltyPointLedger.findFirst({
    where: { pointType, saleId },
  });
  if (existing) {
    throw new Error(`Loyalty ${pointType} was already recorded for this sale.`);
  }
}

async function lockCustomerRow(tx: Record<string, any>, companyId: string, customerId: string) {
  const rows = await tx.$queryRaw`
    SELECT id FROM customers WHERE id = ${customerId} AND company_id = ${companyId} FOR UPDATE
  `;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Customer was not found.");
  }
}

export async function applyLoyaltyLedger(
  tx: Record<string, any>,
  input: {
    companyId: string;
    customerId: string;
    earnedPoints: number;
    redeemDiscountLak: number;
    redeemPoints: number;
    createdBy?: string | null;
    earnNote?: string;
    saleId: string;
    saleNo: string;
    totalAmountLak: number;
  },
) {
  await lockCustomerRow(tx, input.companyId, input.customerId);
  if (input.redeemPoints > 0) {
    await assertNoDuplicateLedgerEntry(tx, input.saleId, "redeem");
    await tx.loyaltyPointLedger.create({
      data: {
        amountLak: input.redeemDiscountLak,
        companyId: input.companyId,
        customerId: input.customerId,
        createdBy: input.createdBy ?? null,
        note: `Redeemed on POS sale ${input.saleNo}`,
        pointType: "redeem",
        points: -input.redeemPoints,
        saleId: input.saleId,
      },
    });
  }

  if (input.earnedPoints > 0) {
    await assertNoDuplicateLedgerEntry(tx, input.saleId, "earn");
    await tx.loyaltyPointLedger.create({
      data: {
        amountLak: input.totalAmountLak,
        companyId: input.companyId,
        customerId: input.customerId,
        createdBy: input.createdBy ?? null,
        note: input.earnNote ?? `Earned from POS sale ${input.saleNo}`,
        pointType: "earn",
        points: input.earnedPoints,
        saleId: input.saleId,
      },
    });
  }

  if (input.earnedPoints > 0 || input.redeemPoints > 0) {
    const customer = await tx.customer.findFirst({
      select: { pointsBalance: true },
      where: { companyId: input.companyId, id: input.customerId },
    });
    const nextBalance = amount(customer?.pointsBalance) + input.earnedPoints - input.redeemPoints;
    if (nextBalance < 0) {
      throw new Error("Loyalty point balance cannot be negative.");
    }

    await tx.customer.update({
      data: {
        pointsBalance: { increment: input.earnedPoints - input.redeemPoints },
        totalSpent: { increment: input.totalAmountLak },
      },
      where: { id: input.customerId },
    });

    await recomputeMembershipTier(tx, input.companyId, input.customerId);
  }
}

export async function recomputeMembershipTier(tx: Record<string, any>, companyId: string, customerId: string) {
  const customer = await tx.customer.findFirst({
    select: { membershipLevelId: true, totalSpent: true },
    where: { companyId, id: customerId },
  });
  if (!customer) {
    return null;
  }

  const levels = await tx.membershipLevel.findMany({
    orderBy: { minSpendLak: "desc" },
    where: { companyId, isActive: true },
  });
  const spent = amount(customer.totalSpent);
  const match = levels.find((level: Record<string, any>) => spent >= amount(level.minSpendLak));
  if (match && match.id !== customer.membershipLevelId) {
    await tx.customer.update({
      data: { membershipLevelId: match.id },
      where: { id: customerId },
    });
    return String(match.id);
  }

  return customer.membershipLevelId ? String(customer.membershipLevelId) : null;
}

export async function reverseSaleLoyaltyPortion(
  tx: Record<string, any>,
  sale: Record<string, any>,
  input: { createdBy?: string | null; fullyReturned: boolean; refundedAmountLak: number },
) {
  if (!sale.customerId) {
    return;
  }

  await lockCustomerRow(tx, sale.companyId, sale.customerId);

  const originalTotal = amount(sale.totalAmount);
  const ledgerRows = await tx.loyaltyPointLedger.findMany({
    where: { companyId: sale.companyId, pointType: { in: ["earn", "redeem"] }, saleId: sale.id },
  });
  if (ledgerRows.length === 0) {
    return;
  }

  const adjustRows = await tx.loyaltyPointLedger.findMany({
    where: {
      companyId: sale.companyId,
      pointType: "adjust",
      saleId: sale.id,
      note: { startsWith: "Reversed" },
    },
  });

  let originalEarn = 0;
  let originalRedeem = 0;
  let originalEarnAmount = 0;
  for (const row of ledgerRows) {
    const points = amount(row.points);
    if (String(row.pointType) === "earn") {
      originalEarn += points;
      originalEarnAmount += amount(row.amountLak);
    }
    if (String(row.pointType) === "redeem") {
      originalRedeem += Math.abs(points);
    }
  }

  let reversedEarn = 0;
  let reversedRedeem = 0;
  let reversedEarnAmount = 0;
  for (const row of adjustRows) {
    const note = String(row.note ?? "");
    if (note.startsWith("Reversed earn")) {
      reversedEarn += Math.abs(amount(row.points));
      reversedEarnAmount += Math.abs(amount(row.amountLak));
    }
    if (note.startsWith("Reversed redeem")) {
      reversedRedeem += Math.abs(amount(row.points));
    }
  }

  if (input.fullyReturned && reversedEarn >= originalEarn && reversedRedeem >= originalRedeem) {
    throw new Error("Loyalty impact was already reversed for this sale.");
  }

  const reversal = loyaltyReversalDelta({
    fullyReturned: input.fullyReturned,
    originalEarn,
    originalRedeem,
    originalTotal,
    refundedAmountLak: amount(input.refundedAmountLak),
    reversedEarn,
    reversedRedeem,
  });
  const targetEarnAmount = input.fullyReturned ? originalEarnAmount : Math.round(originalEarnAmount * (originalTotal > 0 ? Math.min(amount(input.refundedAmountLak) / originalTotal, 1) : 0));
  const deltaEarn = reversal.deltaEarn;
  const deltaEarnAmount = Math.max(targetEarnAmount - reversedEarnAmount, 0);
  const deltaRedeem = reversal.deltaRedeem;
  if (deltaEarn === 0 && deltaRedeem === 0) {
    return;
  }

  if (deltaEarn > 0) {
    await tx.loyaltyPointLedger.create({
      data: {
        amountLak: -deltaEarnAmount,
        companyId: sale.companyId,
        customerId: sale.customerId,
        createdBy: input.createdBy ?? null,
        note: `Reversed earn from sale ${sale.saleNo}`,
        pointType: "adjust",
        points: -deltaEarn,
        saleId: sale.id,
      },
    });
  }
  if (deltaRedeem > 0) {
    await tx.loyaltyPointLedger.create({
      data: {
        amountLak: 0,
        companyId: sale.companyId,
        customerId: sale.customerId,
        createdBy: input.createdBy ?? null,
        note: `Reversed redeem from sale ${sale.saleNo}`,
        pointType: "adjust",
        points: deltaRedeem,
        saleId: sale.id,
      },
    });
  }

  const customer = await tx.customer.findFirst({
    select: { pointsBalance: true },
    where: { id: sale.customerId },
  });
  const nextBalance = amount(customer?.pointsBalance) + deltaRedeem - deltaEarn;
  if (nextBalance < 0) {
    throw new Error("Loyalty reversal would make point balance negative.");
  }

  await tx.customer.update({
    data: {
      pointsBalance: { increment: deltaRedeem - deltaEarn },
      totalSpent: { decrement: deltaEarnAmount },
    },
    where: { id: sale.customerId },
  });

  await recomputeMembershipTier(tx, sale.companyId, sale.customerId);
}

export async function applyExchangeLoyaltyEarn(
  tx: Record<string, any>,
  input: {
    amountLak: number;
    companyId: string;
    customerId: string;
    enabled: boolean;
    lines?: LoyaltyEarnLine[];
    createdBy?: string | null;
    refundNo: string;
    saleId: string;
    spendPerPointLak?: number;
  },
) {
  if (!input.enabled) return 0;
  const customer = await tx.customer.findFirst({
    select: { status: true },
    where: { companyId: input.companyId, id: input.customerId },
  });
  if (!customer || customer.status !== "active") return 0;
  const existing = await tx.loyaltyPointLedger.findFirst({
    where: {
      companyId: input.companyId,
      note: { startsWith: `Exchange earn from ${input.refundNo}` },
      pointType: "adjust",
      saleId: input.saleId,
    },
  });
  if (existing) return 0;
  const rules = await listActiveLoyaltyRules(tx, input.companyId, input.spendPerPointLak ?? 10000);
  const evaluated = evaluateLoyaltyEarning({
    enabled: true,
    hasCustomer: true,
    lines: input.lines ?? [],
    payableLak: Math.max(amount(input.amountLak), 0),
    rules,
  });
  const earnedPoints = evaluated.totalPoints;
  if (earnedPoints <= 0) {
    return 0;
  }

  await lockCustomerRow(tx, input.companyId, input.customerId);

  await tx.loyaltyPointLedger.create({
    data: {
      amountLak: amount(input.amountLak),
      companyId: input.companyId,
      customerId: input.customerId,
      createdBy: input.createdBy ?? null,
      note: formatEarnNote(`Exchange earn from ${input.refundNo}`, evaluated.breakdown),
      pointType: "adjust",
      points: earnedPoints,
      saleId: input.saleId,
    },
  });

  await tx.customer.update({
    data: {
      pointsBalance: { increment: earnedPoints },
      totalSpent: { increment: amount(input.amountLak) },
    },
    where: { id: input.customerId },
  });
  await recomputeMembershipTier(tx, input.companyId, input.customerId);
  return earnedPoints;
}

export async function reverseSaleLoyalty(tx: Record<string, any>, sale: Record<string, any>, createdBy?: string | null) {
  return reverseSaleLoyaltyPortion(tx, sale, {
    createdBy,
    fullyReturned: true,
    refundedAmountLak: amount(sale.totalAmount),
  });
}

const RESERVED_ADJUST_PREFIXES = ["Reversed ", "Exchange earn", "Expired points"];

export async function settleCustomerPointExpiry(
  tx: Record<string, any>,
  companyId: string,
  customerId: string,
  policy: LoyaltyPointPolicy,
  now = new Date(),
) {
  const expiryDays = expiryWindowDays(policy);
  if (expiryDays < 1) return 0;
  await lockCustomerRow(tx, companyId, customerId);
  const rows = await tx.loyaltyPointLedger.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    where: { companyId, customerId },
  });
  const overdue = expiredPointsFromLedger(rows, now, expiryDays);
  if (overdue <= 0) return 0;
  const customer = await tx.customer.findFirst({
    select: { pointsBalance: true },
    where: { companyId, id: customerId },
  });
  const burn = Math.min(overdue, Math.max(amount(customer?.pointsBalance), 0));
  if (burn <= 0) return 0;
  await tx.loyaltyPointLedger.create({
    data: {
      amountLak: 0,
      companyId,
      customerId,
      note: "Expired points",
      pointType: "expire",
      points: -burn,
    },
  });
  await tx.customer.update({
    data: { pointsBalance: { decrement: burn } },
    where: { id: customerId },
  });
  return burn;
}

export async function settleCompanyLoyaltyExpiry(client: Record<string, any>, companyId: string) {
  const settings = await client.companySetting.findUnique({ where: { companyId } });
  const policy = loyaltyPolicyFromSettingsRow(settings);
  if (expiryWindowDays(policy) < 1) return;
  const customers = await client.customer.findMany({
    select: { id: true },
    take: 200,
    where: { companyId, pointsBalance: { gt: 0 } },
  });
  for (const customer of customers as Array<{ id: string }>) {
    await client.$transaction(async (tx: Record<string, any>) => {
      await settleCustomerPointExpiry(tx, companyId, customer.id, policy);
    });
  }
}

export async function adjustCustomerLoyaltyPoints(
  tenant: TenantContext,
  input: { customerId: string; note?: string; pointsDelta: number },
) {
  const customerId = String(input.customerId).trim();
  const pointsDelta = Math.trunc(numberValue(input.pointsDelta));
  const note = String(input.note ?? "").trim();
  if (!customerId) {
    throw new Error("Customer id is required.");
  }
  if (pointsDelta === 0) {
    throw new Error("Point adjustment cannot be zero.");
  }
  if (!note || note.length > 240) {
    throw new Error("A reason is required for a point adjustment.");
  }
  if (RESERVED_ADJUST_PREFIXES.some((prefix) => note.startsWith(prefix))) {
    throw new Error("Point adjustment reason is not allowed.");
  }

  await assertPermission(tenant, WRITE_PERMISSIONS.membershipPointsAdjust);

  return withTenantTransaction({
    action: "adjust_points",
    module: "customers",
    newData: { customerId, note, pointsDelta },
    tenant,
    write: async (tx) => {
      const scope = await resolveTenantScope(tenant, tx);
      const settings = await tx.companySetting.findUnique({ where: { companyId: tenant.companyId } });
      await settleCustomerPointExpiry(tx, tenant.companyId, customerId, loyaltyPolicyFromSettingsRow(settings));
      await lockCustomerRow(tx, tenant.companyId, customerId);
      const customer = await tx.customer.findFirst({
        select: { id: true, pointsBalance: true },
        where: { companyId: tenant.companyId, id: customerId, ...branchOwnedWhere(scope) },
      });
      if (!customer) {
        throw new Error("Customer was not found.");
      }

      const nextBalance = amount(customer.pointsBalance) + pointsDelta;
      if (nextBalance < 0) {
        throw new Error("Point balance cannot be negative.");
      }

      await tx.loyaltyPointLedger.create({
        data: {
          amountLak: 0,
          companyId: tenant.companyId,
          createdBy: tenant.userId,
          customerId,
          note,
          pointType: "adjust",
          points: pointsDelta,
        },
      });

      await tx.customer.update({
        data: { pointsBalance: nextBalance },
        where: { id: customerId },
      });

      return { customerId, pointsBalance: nextBalance, pointsDelta };
    },
  });
}

export async function calculateLoyaltyRedemption(
  tx: Record<string, any>,
  input: {
    allowPartial?: boolean;
    allowRedeemWithDiscount?: boolean;
    companyId: string;
    customerId?: string;
    enabled: boolean;
    hasPromotionOrManualDiscount?: boolean;
    maxRedeemPoints?: number | null;
    minRedeemPoints: number;
    pointValueLak: number;
    policy?: LoyaltyPointPolicy;
    redeemableAmountLak: number;
    redeemPoints?: number;
  },
) {
  const requestedPoints = Math.max(Math.floor(numberValue(input.redeemPoints)), 0);
  const policy = input.policy ?? {
    allowPartial: input.allowPartial !== false,
    allowRedeemWithDiscount: input.allowRedeemWithDiscount !== false,
    expiryDays: null,
    expiryEnabled: false,
    expiryUnit: "days" as const,
    maxRedeemPoints: input.maxRedeemPoints ?? null,
  };

  if (!input.enabled) {
    if (requestedPoints > 0) {
      throw new Error("Loyalty point redemption is disabled.");
    }
    return { customer: null, discountAmountLak: 0, redeemPoints: 0 };
  }

  if (!input.customerId) {
    if (requestedPoints > 0) {
      throw new Error("A customer is required to redeem loyalty points.");
    }
    return { customer: null, discountAmountLak: 0, redeemPoints: 0 };
  }

  await settleCustomerPointExpiry(tx, input.companyId, input.customerId, policy);
  await lockCustomerRow(tx, input.companyId, input.customerId);
  const customer = await tx.customer.findFirst({
    select: { id: true, pointsBalance: true, status: true },
    where: { companyId: input.companyId, id: input.customerId, status: "active" },
  });

  if (!customer) {
    throw new Error("Active customer was not found for loyalty points.");
  }

  if (requestedPoints <= 0) {
    return { customer, discountAmountLak: 0, redeemPoints: 0 };
  }

  const decision = assertRedemptionAllowed({
    allowPartial: policy.allowPartial,
    allowRedeemWithDiscount: policy.allowRedeemWithDiscount,
    balance: Number(customer.pointsBalance ?? 0),
    hasPromotionOrManualDiscount: input.hasPromotionOrManualDiscount === true,
    maxRedeemPoints: policy.maxRedeemPoints,
    minRedeemPoints: input.minRedeemPoints,
    payableLak: input.redeemableAmountLak,
    pointValueLak: input.pointValueLak,
    redeemPoints: requestedPoints,
  });

  return {
    customer,
    discountAmountLak: decision.redeemPoints * input.pointValueLak,
    redeemPoints: decision.redeemPoints,
  };
}
