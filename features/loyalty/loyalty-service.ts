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

export async function reverseSaleLoyaltyPortion(
  tx: Record<string, any>,
  sale: Record<string, any>,
  input: { fullyReturned: boolean; refundedAmountLak: number },
) {
  if (!sale.customerId) {
    return;
  }

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

  const ratio = originalTotal > 0 ? Math.min(Math.max(amount(input.refundedAmountLak) / originalTotal, 0), 1) : 0;
  const targetEarn = input.fullyReturned ? originalEarn : Math.floor(originalEarn * ratio);
  const targetEarnAmount = input.fullyReturned ? originalEarnAmount : Math.round(originalEarnAmount * ratio);
  const targetRedeem = input.fullyReturned ? originalRedeem : 0;

  const deltaEarn = Math.max(targetEarn - reversedEarn, 0);
  const deltaEarnAmount = Math.max(targetEarnAmount - reversedEarnAmount, 0);
  const deltaRedeem = Math.max(targetRedeem - reversedRedeem, 0);
  if (deltaEarn === 0 && deltaRedeem === 0) {
    return;
  }

  if (deltaEarn > 0) {
    await tx.loyaltyPointLedger.create({
      data: {
        amountLak: -deltaEarnAmount,
        companyId: sale.companyId,
        customerId: sale.customerId,
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
    refundNo: string;
    saleId: string;
    spendPerPointLak: number;
  },
) {
  const earnedPoints = Math.floor(Math.max(amount(input.amountLak), 0) / Math.max(input.spendPerPointLak, 1));
  if (earnedPoints <= 0) {
    return 0;
  }

  await tx.loyaltyPointLedger.create({
    data: {
      amountLak: amount(input.amountLak),
      companyId: input.companyId,
      customerId: input.customerId,
      note: `Exchange earn from ${input.refundNo}`,
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

export async function reverseSaleLoyalty(tx: Record<string, any>, sale: Record<string, any>) {
  return reverseSaleLoyaltyPortion(tx, sale, {
    fullyReturned: true,
    refundedAmountLak: amount(sale.totalAmount),
  });
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
