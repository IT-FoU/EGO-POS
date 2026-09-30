import { prisma } from "@/lib/db/prisma";

/**
 * Super Admin mutations for business-account plans.
 * POS screens must not call these. Duration and extra-day edits keep companies.created_at
 * and an existing subscription start_date unchanged.
 */

const MAX_DAYS = 3650;

export class PlanAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanAdminError";
  }
}

function assertAdditionalDays(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_DAYS) {
    throw new PlanAdminError("Additional days must be a whole number from 1 to 3650.");
  }
}

function assertDurationDays(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_DAYS) {
    throw new PlanAdminError("Plan duration must be a whole number from 1 to 3650.");
  }
}

export async function updatePlanDurationDays(planId: string, durationDays: number) {
  assertDurationDays(durationDays);
  const before = await prisma.plan.findUnique({
    select: { durationDays: true, id: true, planName: true },
    where: { id: planId },
  });
  if (!before) return null;

  const after = await prisma.plan.update({
    data: { durationDays },
    select: { durationDays: true, id: true, planName: true },
    where: { id: planId },
  });

  return { after, before };
}

export async function grantAccountExtraDays(input: {
  actorId?: string | null;
  additionalDays: number;
  companyId: string;
  reason?: string | null;
}) {
  assertAdditionalDays(input.additionalDays);
  const reason = input.reason?.trim() ? input.reason.trim().slice(0, 500) : null;

  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({
      select: { createdAt: true, id: true, name: true, planId: true },
      where: { id: input.companyId },
    });
    if (!company) throw new PlanAdminError("Business not found.");
    if (!company.planId) throw new PlanAdminError("Assign a plan before extending this account.");

    const subscription = await tx.saaSSubscription.findFirst({
      orderBy: { startDate: "desc" },
      select: { extraDays: true, id: true, startDate: true },
      where: { companyId: company.id },
    });

    const actor = input.actorId
      ? await tx.superAdmin.findUnique({ select: { id: true }, where: { id: input.actorId } })
      : null;

    if (!subscription) {
      const created = await tx.saaSSubscription.create({
        data: {
          billingCycle: "monthly",
          companyId: company.id,
          extraDays: input.additionalDays,
          planId: company.planId,
          registeredAt: company.createdAt,
          startDate: company.createdAt,
          status: "active",
        },
        select: { extraDays: true, id: true, startDate: true },
      });
      await tx.saaSAccountExtension.create({
        data: {
          additionalDays: input.additionalDays,
          companyId: company.id,
          createdById: actor?.id ?? null,
          reason,
          subscriptionId: created.id,
        },
      });
      return {
        afterExtraDays: created.extraDays,
        beforeExtraDays: 0,
        businessName: company.name,
        registeredAt: company.createdAt.toISOString(),
        startDate: created.startDate.toISOString(),
      };
    }

    const nextExtraDays = subscription.extraDays + input.additionalDays;
    const updated = await tx.saaSSubscription.update({
      data: { extraDays: nextExtraDays },
      select: { extraDays: true, startDate: true },
      where: { id: subscription.id },
    });
    await tx.saaSAccountExtension.create({
      data: {
        additionalDays: input.additionalDays,
        companyId: company.id,
        createdById: actor?.id ?? null,
        reason,
        subscriptionId: subscription.id,
      },
    });

    return {
      afterExtraDays: updated.extraDays,
      beforeExtraDays: subscription.extraDays,
      businessName: company.name,
      registeredAt: company.createdAt.toISOString(),
      startDate: updated.startDate.toISOString(),
    };
  });
}
