import { PLATFORM_AUDIT_ACTIONS, PLATFORM_TARGET_TYPES } from "@/features/audit/audit-log-service";
import { writePlatformAuditForUser } from "@/features/audit/platform-route-audit";
import { requirePlatformApiPermission } from "@/features/permissions/platform-api-guard";
import { PLATFORM_ACTIONS } from "@/features/permissions/platform-permissions";
import { prisma } from "@/lib/db/prisma";

const db = prisma as any;

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const permission = await requirePlatformApiPermission(request, PLATFORM_ACTIONS.BUSINESS_DELETE, {
    businessId: id,
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
    data: { status: "deleted" },
    select: { id: true, name: true, status: true },
    where: { id },
  });

  await writePlatformAuditForUser({
    action: PLATFORM_AUDIT_ACTIONS.BUSINESS_DELETE,
    actor: permission.user,
    afterValue: { status: updated.status },
    beforeValue: { status: existing.status },
    businessId: updated.id,
    request,
    severity: "critical",
    targetId: updated.id,
    targetName: updated.name,
    targetType: PLATFORM_TARGET_TYPES.BUSINESS,
  });

  return Response.json({ business: updated, ok: true });
}
