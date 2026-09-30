import { PLATFORM_AUDIT_ACTIONS, PLATFORM_TARGET_TYPES } from "@/features/audit/audit-log-service";
import { writePlatformAuditForUser } from "@/features/audit/platform-route-audit";
import { PlanAdminError, updatePlanDurationDays } from "@/features/business-plan/plan-admin";
import { requirePlatformApiPermission } from "@/features/permissions/platform-api-guard";
import { PLATFORM_ACTIONS } from "@/features/permissions/platform-permissions";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { durationDays?: unknown; reason?: unknown } | null;
  const durationDays = body?.durationDays;
  if (typeof durationDays !== "number") {
    return Response.json({ error: "Plan duration is required.", ok: false }, { status: 400 });
  }

  const permission = await requirePlatformApiPermission(request, PLATFORM_ACTIONS.PLAN_CHANGE, {
    reason: typeof body?.reason === "string" ? body.reason : undefined,
    targetId: id,
    targetType: PLATFORM_TARGET_TYPES.PLAN,
  });
  if (!permission.ok) return permission.response;

  try {
    const updated = await updatePlanDurationDays(id, durationDays);
    if (!updated) {
      return Response.json({ error: "Plan not found.", ok: false }, { status: 404 });
    }

    await writePlatformAuditForUser({
      action: PLATFORM_AUDIT_ACTIONS.PLAN_CHANGE,
      actor: permission.user,
      afterValue: { durationDays: updated.after.durationDays, planName: updated.after.planName },
      beforeValue: { durationDays: updated.before.durationDays, planName: updated.before.planName },
      metadata: {
        preservesRegistrationDate: true,
        reason: typeof body?.reason === "string" ? body.reason : undefined,
      },
      request,
      severity: "warning",
      targetId: updated.after.id,
      targetName: updated.after.planName,
      targetType: PLATFORM_TARGET_TYPES.PLAN,
    });

    return Response.json({ ok: true, plan: updated.after });
  } catch (error) {
    if (error instanceof PlanAdminError) {
      return Response.json({ error: error.message, ok: false }, { status: 400 });
    }
    throw error;
  }
}
