import {
  createPlatformAuditLog,
  type AuditSeverity,
  type AuditStatus,
} from "@/features/audit/audit-log-service";
import type { CurrentPlatformUser } from "@/lib/auth/platform-user";

export async function writePlatformAuditForUser(input: {
  action: string;
  actor: CurrentPlatformUser;
  afterValue?: unknown;
  beforeValue?: unknown;
  businessId?: string | null;
  metadata?: unknown;
  request?: Request;
  severity?: AuditSeverity;
  status?: AuditStatus;
  targetId?: string | null;
  targetName?: string | null;
  targetType: string;
}) {
  return createPlatformAuditLog({
    action: input.action,
    actorEmail: input.actor.email,
    actorId: input.actor.id,
    actorName: input.actor.name,
    actorRole: input.actor.role,
    afterValue: input.afterValue,
    beforeValue: input.beforeValue,
    businessId: input.businessId,
    ipAddress: input.request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    metadata: input.metadata,
    severity: input.severity ?? "info",
    status: input.status ?? "success",
    targetId: input.targetId,
    targetName: input.targetName,
    targetType: input.targetType,
    userAgent: input.request?.headers.get("user-agent") ?? null,
  });
}
