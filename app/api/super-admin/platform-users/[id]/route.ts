import { PLATFORM_AUDIT_ACTIONS, PLATFORM_TARGET_TYPES } from "@/features/audit/audit-log-service";
import { writePlatformAuditForUser } from "@/features/audit/platform-route-audit";
import { requirePlatformApiPermission } from "@/features/permissions/platform-api-guard";
import { PLATFORM_ACTIONS } from "@/features/permissions/platform-permissions";
import { normalizePlatformRole } from "@/lib/auth/platform-user";
import { prisma } from "@/lib/db/prisma";

const db = prisma as any;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { role?: unknown; status?: unknown } | null;
  const nextRole = typeof body?.role === "string" ? normalizePlatformRole(body.role) : null;
  const nextStatus = typeof body?.status === "string" ? body.status.trim().toLowerCase() : null;

  if (!nextRole && nextStatus !== "disabled") {
    return Response.json({ error: "Role or disabled status is required.", ok: false }, { status: 400 });
  }
  const isRoleChange = Boolean(nextRole);
  const permission = await requirePlatformApiPermission(
    request,
    isRoleChange ? PLATFORM_ACTIONS.USER_ROLE_CHANGE : PLATFORM_ACTIONS.USER_DISABLE,
    {
      isStoreUserAction: false,
      targetId: id,
      targetType: PLATFORM_TARGET_TYPES.USER,
    },
  );
  if (!permission.ok) return permission.response;

  const existing = await db.superAdmin.findUnique({
    select: { email: true, id: true, role: true, status: true, username: true },
    where: { id },
  });

  if (!existing) {
    return Response.json({ error: "Platform user not found.", ok: false }, { status: 404 });
  }

  const updated = await db.superAdmin.update({
    data: nextRole ? { role: nextRole } : { status: "disabled" },
    select: { email: true, id: true, role: true, status: true, username: true },
    where: { id },
  });

  await writePlatformAuditForUser({
    action: isRoleChange ? PLATFORM_AUDIT_ACTIONS.USER_ROLE_CHANGE : PLATFORM_AUDIT_ACTIONS.USER_DISABLE,
    actor: permission.user,
    afterValue: isRoleChange ? { role: updated.role } : { status: updated.status },
    beforeValue: isRoleChange ? { role: existing.role } : { status: existing.status },
    request,
    severity: "security",
    targetId: updated.id,
    targetName: updated.username,
    targetType: PLATFORM_TARGET_TYPES.USER,
  });

  return Response.json({ ok: true, user: updated });
}
