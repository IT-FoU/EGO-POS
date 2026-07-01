import { PLATFORM_AUDIT_ACTIONS, PLATFORM_TARGET_TYPES } from "@/features/audit/audit-log-service";
import { writePlatformAuditForUser } from "@/features/audit/platform-route-audit";
import { requirePlatformApiPermission } from "@/features/permissions/platform-api-guard";
import { PLATFORM_ACTIONS } from "@/features/permissions/platform-permissions";
import { prisma } from "@/lib/db/prisma";

const db = prisma as any;

const STATUS_ACTIONS: Record<string, { action: string; permission: typeof PLATFORM_ACTIONS[keyof typeof PLATFORM_ACTIONS]; severity: "critical" | "security" | "warning" }> = {
  active: { action: PLATFORM_AUDIT_ACTIONS.BUSINESS_REACTIVATE, permission: PLATFORM_ACTIONS.BUSINESS_REACTIVATE, severity: "critical" },
  disabled: { action: PLATFORM_AUDIT_ACTIONS.BUSINESS_ARCHIVE, permission: PLATFORM_ACTIONS.BUSINESS_ARCHIVE, severity: "critical" },
  suspended: { action: PLATFORM_AUDIT_ACTIONS.BUSINESS_SUSPEND, permission: PLATFORM_ACTIONS.BUSINESS_SUSPEND, severity: "critical" },
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { reason?: unknown; status?: unknown } | null;
  const nextStatus = typeof body?.status === "string" ? body.status.trim().toLowerCase() : "";
  const auditConfig = STATUS_ACTIONS[nextStatus];

  if (!auditConfig) {
    return Response.json({ error: "Unsupported business status.", ok: false }, { status: 400 });
  }
  const permission = await requirePlatformApiPermission(request, auditConfig.permission, {
    businessId: id,
    reason: typeof body?.reason === "string" ? body.reason : undefined,
    targetId: id,
    targetType: PLATFORM_TARGET_TYPES.BUSINESS,
  });
  if (!permission.ok) return permission.response;

  const existing = await db.company.findUnique({
    select: { id: true, name: true, status: true },
    where: { id },
  });

  if (!existing) {
    return Response.json({ error: "Business not found.", ok: false }, { status: 404 });
  }

  const updated = await db.company.update({
    data: { status: nextStatus },
    select: { id: true, name: true, status: true },
    where: { id },
  });

  await writePlatformAuditForUser({
    action: auditConfig.action,
    actor: permission.user,
    afterValue: { status: updated.status },
    beforeValue: { status: existing.status },
    businessId: updated.id,
    metadata: { reason: typeof body?.reason === "string" ? body.reason : undefined },
    request,
    severity: auditConfig.severity,
    targetId: updated.id,
    targetName: updated.name,
    targetType: PLATFORM_TARGET_TYPES.BUSINESS,
  });

  return Response.json({ business: updated, ok: true });
}
