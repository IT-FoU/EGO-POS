import { PLATFORM_AUDIT_ACTIONS, PLATFORM_TARGET_TYPES } from "@/features/audit/audit-log-service";
import { writePlatformAuditForUser } from "@/features/audit/platform-route-audit";
import { requirePlatformApiPermission } from "@/features/permissions/platform-api-guard";
import { PLATFORM_ACTIONS } from "@/features/permissions/platform-permissions";
import { prisma } from "@/lib/db/prisma";

const db = prisma as any;

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => null)) as { key?: unknown; value?: unknown } | null;
  const key = typeof body?.key === "string" ? body.key.trim() : "";

  if (!key) {
    return Response.json({ error: "Setting key is required.", ok: false }, { status: 400 });
  }
  const permission = await requirePlatformApiPermission(request, PLATFORM_ACTIONS.SETTINGS_UPDATE, {
    targetType: PLATFORM_TARGET_TYPES.SETTINGS,
  });
  if (!permission.ok) return permission.response;

  const existing = await db.platformSetting.findUnique({ where: { key } });
  const updated = await db.platformSetting.upsert({
    create: { key, updatedBy: permission.user.id, value: body?.value ?? null },
    update: { updatedBy: permission.user.id, value: body?.value ?? null },
    where: { key },
  });

  await writePlatformAuditForUser({
    action: PLATFORM_AUDIT_ACTIONS.SETTINGS_UPDATE,
    actor: permission.user,
    afterValue: { key: updated.key, value: updated.value },
    beforeValue: existing ? { key: existing.key, value: existing.value } : null,
    request,
    severity: "warning",
    targetId: updated.id,
    targetName: key,
    targetType: PLATFORM_TARGET_TYPES.SETTINGS,
  });

  return Response.json({ ok: true, setting: updated });
}
