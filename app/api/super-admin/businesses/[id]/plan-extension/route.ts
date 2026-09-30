import { PLATFORM_AUDIT_ACTIONS, PLATFORM_TARGET_TYPES } from "@/features/audit/audit-log-service";
import { writePlatformAuditForUser } from "@/features/audit/platform-route-audit";
import { grantAccountExtraDays, PlanAdminError } from "@/features/business-plan/plan-admin";
import { requirePlatformApiPermission } from "@/features/permissions/platform-api-guard";
import { PLATFORM_ACTIONS } from "@/features/permissions/platform-permissions";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { additionalDays?: unknown; reason?: unknown } | null;
  const additionalDays = body?.additionalDays;
  if (typeof additionalDays !== "number") {
    return Response.json({ error: "Additional days are required.", ok: false }, { status: 400 });
  }

  const permission = await requirePlatformApiPermission(request, PLATFORM_ACTIONS.PLAN_CUSTOM_OVERRIDE, {
    businessId: id,
    reason: typeof body?.reason === "string" ? body.reason : undefined,
    targetId: id,
    targetType: PLATFORM_TARGET_TYPES.SUBSCRIPTION,
  });
  if (!permission.ok) return permission.response;

  try {
    const updated = await grantAccountExtraDays({
      actorId: permission.user.id,
      additionalDays,
      companyId: id,
      reason: typeof body?.reason === "string" ? body.reason : null,
    });

    await writePlatformAuditForUser({
      action: PLATFORM_AUDIT_ACTIONS.SUBSCRIPTION_EXTEND,
      actor: permission.user,
      afterValue: {
        extraDays: updated.afterExtraDays,
        registeredAt: updated.registeredAt,
        startDate: updated.startDate,
      },
      beforeValue: {
        extraDays: updated.beforeExtraDays,
        registeredAt: updated.registeredAt,
        startDate: updated.startDate,
      },
      businessId: id,
      metadata: {
        additionalDays,
        preservesRegistrationDate: true,
        reason: typeof body?.reason === "string" ? body.reason : undefined,
      },
      request,
      severity: "warning",
      targetId: id,
      targetName: updated.businessName,
      targetType: PLATFORM_TARGET_TYPES.SUBSCRIPTION,
    });

    return Response.json({
      extraDays: updated.afterExtraDays,
      ok: true,
      registeredAt: updated.registeredAt,
      startDate: updated.startDate,
    });
  } catch (error) {
    if (error instanceof PlanAdminError) {
      const status = error.message === "Business not found." ? 404 : 400;
      return Response.json({ error: error.message, ok: false }, { status });
    }
    throw error;
  }
}
