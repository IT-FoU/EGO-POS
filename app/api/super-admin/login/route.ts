import { authenticateSuperAdminLogin } from "@/lib/auth/super-admin-login";
import {
  createPlatformAuditLog,
  PLATFORM_AUDIT_ACTIONS,
  PLATFORM_TARGET_TYPES,
} from "@/features/audit/audit-log-service";

async function writeLoginAudit(input: {
  identifier: string;
  ok: boolean;
  request: Request;
  status?: number;
}) {
  try {
    await createPlatformAuditLog({
      action: input.ok ? PLATFORM_AUDIT_ACTIONS.AUTH_LOGIN : PLATFORM_AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
      actorEmail: input.identifier || null,
      actorName: input.identifier || "Unknown platform user",
      actorRole: null,
      actorType: "human",
      ipAddress: input.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      metadata: { statusCode: input.status },
      severity: input.ok ? "info" : "security",
      status: input.ok ? "success" : "failed",
      targetName: input.identifier || "Super Admin Login",
      targetType: PLATFORM_TARGET_TYPES.AUTH,
      userAgent: input.request.headers.get("user-agent"),
    });
  } catch (error) {
    console.warn("[platform-audit] super admin login audit write failed", error);
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { email?: unknown; identifier?: unknown; password?: unknown; username?: unknown }
    | null;
  const identifier =
    typeof body?.email === "string"
      ? body.email.trim()
      : typeof body?.identifier === "string"
        ? body.identifier.trim()
        : typeof body?.username === "string"
          ? body.username.trim()
          : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const result = await authenticateSuperAdminLogin(identifier, password);

  if (!result.ok) {
    await writeLoginAudit({ identifier, ok: false, request, status: result.status });
    return Response.json({ error: result.error, ok: false }, { status: result.status });
  }

  await writeLoginAudit({ identifier, ok: true, request, status: 200 });
  return Response.json({ ok: true, redirectTo: result.redirectTo });
}
