import { PLATFORM_AUDIT_ACTIONS, PLATFORM_TARGET_TYPES } from "@/features/audit/audit-log-service";
import { writePlatformAuditForUser } from "@/features/audit/platform-route-audit";
import { requirePlatformApiPermission } from "@/features/permissions/platform-api-guard";
import { PLATFORM_ACTIONS } from "@/features/permissions/platform-permissions";
import { prisma } from "@/lib/db/prisma";

const db = prisma as any;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { planId?: unknown; reason?: unknown } | null;
  const planId = typeof body?.planId === "string" ? body.planId.trim() : "";

  if (!planId) {
    return Response.json({ error: "Plan is required.", ok: false }, { status: 400 });
  }
  const permission = await requirePlatformApiPermission(request, PLATFORM_ACTIONS.PLAN_CHANGE, {
    businessId: id,
    reason: typeof body?.reason === "string" ? body.reason : undefined,
    targetId: id,
    targetType: PLATFORM_TARGET_TYPES.PLAN,
  });
  if (!permission.ok) return permission.response;

  const [business, nextPlan] = await Promise.all([
    db.company.findUnique({
      include: { plan: { select: { id: true, planName: true } } },
      where: { id },
    }),
    db.plan.findUnique({ select: { id: true, planName: true }, where: { id: planId } }),
  ]);

  if (!business) {
    return Response.json({ error: "Business not found.", ok: false }, { status: 404 });
  }
  if (!nextPlan) {
    return Response.json({ error: "Plan not found.", ok: false }, { status: 404 });
  }

  const updated = await db.company.update({
    include: { plan: { select: { id: true, planName: true } } },
    data: { planId },
    where: { id },
  });

  await writePlatformAuditForUser({
    action: PLATFORM_AUDIT_ACTIONS.PLAN_CHANGE,
    actor: permission.user,
    afterValue: { planId: updated.planId, planName: updated.plan?.planName ?? null },
    beforeValue: { planId: business.planId, planName: business.plan?.planName ?? null },
    businessId: business.id,
    metadata: { reason: typeof body?.reason === "string" ? body.reason : undefined },
    request,
    severity: "warning",
    targetId: business.id,
    targetName: business.name,
    targetType: PLATFORM_TARGET_TYPES.PLAN,
  });

  return Response.json({ business: updated, ok: true });
}
