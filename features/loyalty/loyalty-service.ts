import type { TenantContext } from "@/lib/db/write-context";
import { numberValue, withTenantTransaction } from "@/lib/db/write-context";
import { branchOwnedWhere, resolveTenantScope } from "@/lib/db/tenant-scope";
import { assertPermission, WRITE_PERMISSIONS } from "@/lib/auth/permissions";

function amount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function resolveMembershipDiscountPercent(customer: Record<string, any> | null) {
  if (!customer || customer.status !== "active") {
    return 0;
  }
  if (!customer.membershipLevelId || !customer.membershipLevel) {
    return 0;
  }

  const subscriptions: Array<Record<string, any>> = customer.subscriptions ?? [];
  if (subscriptions.length > 0) {
    const endDate = subscriptions[0]?.endDate ? new Date(subscriptions[0].endDate).getTime() : 0;
    if (!endDate || endDate < Date.now()) {
      return 0;
    }
  }

  const percent = numberValue(customer.membershipLevel?.discountPercent);
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

export async function applyLoyaltyLedger(
  tx: Record<string, any>,
  input: {
    companyId: string;
    customerId: string;
    earnedPoints: number;
    redeemDiscountLak: number;
    redeemPoints: number;
    saleId: string;
    saleNo: string;
    totalAmountLak: number;
  },
) {
  if (input.redeemPoints > 0) {
    await assertNoDuplicateLedgerEntry(tx, input.saleId, "redeem");
    await tx.loyaltyPointLedger.create({
      data: {
        amountLak: input.redeemDiscountLak,
        companyId: input.companyId,
        customerId: input.customerId,
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
        note: `Earned from POS sale ${input.saleNo}`,
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

export async function reverseSaleLoyalty(tx: Record<string, any>, sale: Record<string, any>) {
  if (!sale.customerId) {
    return;
  }

  const existingReversal = await tx.loyaltyPointLedger.findFirst({
    where: {
      companyId: sale.companyId,
      pointType: "adjust",
      saleId: sale.id,
      note: { startsWith: "Reversed" },
    },
  });
  if (existingReversal) {
    throw new Error("Loyalty impact was already reversed for this sale.");
  }

  const ledgerRows = await tx.loyaltyPointLedger.findMany({
    where: { companyId: sale.companyId, pointType: { in: ["earn", "redeem"] }, saleId: sale.id },
  });
  if (ledgerRows.length === 0) {
    return;
  }

  let earnedPoints = 0;
  let redeemedPoints = 0;
  let totalSpentDelta = 0;

  for (const row of ledgerRows) {
    const points = amount(row.points);
    if (String(row.pointType) === "earn") {
      earnedPoints += points;
      totalSpentDelta += amount(row.amountLak);
      await tx.loyaltyPointLedger.create({
        data: {
          amountLak: -amount(row.amountLak),
          companyId: sale.companyId,
          customerId: sale.customerId,
          note: `Reversed earn from sale ${sale.saleNo}`,
          pointType: "adjust",
          points: -points,
          saleId: sale.id,
        },
      });
    }
    if (String(row.pointType) === "redeem") {
      redeemedPoints += Math.abs(points);
      await tx.loyaltyPointLedger.create({
        data: {
          amountLak: amount(row.amountLak),
          companyId: sale.companyId,
          customerId: sale.customerId,
          note: `Reversed redeem from sale ${sale.saleNo}`,
          pointType: "adjust",
          points: Math.abs(points),
          saleId: sale.id,
        },
      });
    }
  }

  const customer = await tx.customer.findFirst({
    select: { pointsBalance: true },
    where: { id: sale.customerId },
  });
  const nextBalance = amount(customer?.pointsBalance) + redeemedPoints - earnedPoints;
  if (nextBalance < 0) {
    throw new Error("Loyalty reversal would make point balance negative.");
  }

  await tx.customer.update({
    data: {
      pointsBalance: { increment: redeemedPoints - earnedPoints },
      totalSpent: { decrement: totalSpentDelta },
    },
    where: { id: sale.customerId },
  });

  await recomputeMembershipTier(tx, sale.companyId, sale.customerId);
}

export async function adjustCustomerLoyaltyPoints(
  tenant: TenantContext,
  input: { customerId: string; note?: string; pointsDelta: number },
) {
  const customerId = String(input.customerId).trim();
  const pointsDelta = Math.trunc(numberValue(input.pointsDelta));
  if (!customerId) {
    throw new Error("Customer id is required.");
  }
  if (pointsDelta === 0) {
    throw new Error("Point adjustment cannot be zero.");
  }

  await assertPermission(tenant, WRITE_PERMISSIONS.customersUpdate);

  return withTenantTransaction({
    action: "adjust_points",
    module: "customers",
    newData: input,
    tenant,
    write: async (tx) => {
      const scope = await resolveTenantScope(tenant, tx);
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
          customerId,
          note: input.note?.trim() || "Manual point adjustment",
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
    companyId: string;
    customerId?: string;
    enabled: boolean;
    minRedeemPoints: number;
    pointValueLak: number;
    redeemableAmountLak: number;
    redeemPoints?: number;
  },
) {
  const redeemPoints = Math.max(Math.floor(numberValue(input.redeemPoints)), 0);

  if (!input.enabled) {
    if (redeemPoints > 0) {
      throw new Error("Loyalty point redemption is disabled.");
    }
    return { customer: null, discountAmountLak: 0, redeemPoints: 0 };
  }

  if (!input.customerId) {
    if (redeemPoints > 0) {
      throw new Error("A customer is required to redeem loyalty points.");
    }
    return { customer: null, discountAmountLak: 0, redeemPoints: 0 };
  }

  const customer = await tx.customer.findFirst({
    select: { id: true, pointsBalance: true, status: true },
    where: { companyId: input.companyId, id: input.customerId, status: "active" },
  });

  if (!customer) {
    throw new Error("Active customer was not found for loyalty points.");
  }

  if (redeemPoints <= 0) {
    return { customer, discountAmountLak: 0, redeemPoints: 0 };
  }

  if (redeemPoints < input.minRedeemPoints) {
    throw new Error(`Minimum redeem points is ${input.minRedeemPoints}.`);
  }

  const currentBalance = Number(customer.pointsBalance ?? 0);
  if (currentBalance < redeemPoints) {
    throw new Error(`Insufficient loyalty points. Available ${currentBalance}, requested ${redeemPoints}.`);
  }

  const maxRedeemablePoints =
    input.pointValueLak > 0 ? Math.floor(input.redeemableAmountLak / input.pointValueLak) : 0;
  if (redeemPoints > maxRedeemablePoints) {
    throw new Error(`Redeem points exceed sale amount. Maximum redeemable points ${maxRedeemablePoints}.`);
  }

  return {
    customer,
    discountAmountLak: redeemPoints * input.pointValueLak,
    redeemPoints,
  };
}
