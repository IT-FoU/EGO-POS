import { PLATFORM_AUDIT_ACTIONS, PLATFORM_TARGET_TYPES } from "@/features/audit/audit-log-service";
import { writePlatformAuditForUser } from "@/features/audit/platform-route-audit";
import { prisma } from "@/lib/db/prisma";
import { requireCurrentPlatformUser } from "@/lib/auth/platform-user";

const db = prisma as any;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireCurrentPlatformUser();
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { reason?: unknown } | null;
  const existing = await db.saaSSubscription.findUnique({
    include: {
      company: { select: { id: true, name: true } },
      plan: { select: { id: true, planName: true } },
    },
    where: { id },
  });

  if (!existing) {
    return Response.json({ error: "Subscription not found.", ok: false }, { status: 404 });
  }

  const updated = await db.saaSSubscription.update({
    include: {
      company: { select: { id: true, name: true } },
      plan: { select: { id: true, planName: true } },
    },
    data: { status: "cancelled" },
    where: { id },
  });

  await writePlatformAuditForUser({
    action: PLATFORM_AUDIT_ACTIONS.SUBSCRIPTION_CANCEL,
    actor,
    afterValue: { status: updated.status },
    beforeValue: { status: existing.status },
    businessId: updated.companyId,
    metadata: {
      planId: updated.planId,
      planName: updated.plan?.planName ?? null,
      reason: typeof body?.reason === "string" ? body.reason : undefined,
    },
    request,
    severity: "warning",
    targetId: updated.id,
    targetName: updated.company?.name ?? updated.id,
    targetType: PLATFORM_TARGET_TYPES.SUBSCRIPTION,
  });

  return Response.json({ ok: true, subscription: updated });
}
