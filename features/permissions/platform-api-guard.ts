import { auditPlatformAccessDenied } from "@/features/permissions/denied-audit";
import {
  canPerformPlatformAction,
  type PermissionContext,
  type PlatformAction,
} from "@/features/permissions/platform-permissions";
import { getCurrentPlatformUser, type CurrentPlatformUser } from "@/lib/auth/platform-user";

export type PlatformApiPermissionResult =
  | { ok: true; user: CurrentPlatformUser }
  | { ok: false; response: Response };

export function forbiddenPlatformResponse(message = "You do not have permission to perform this action.") {
  return Response.json(
    {
      error: "Forbidden",
      message,
      ok: false,
    },
    { status: 403 },
  );
}

export async function requirePlatformApiPermission(
  request: Request,
  action: PlatformAction,
  context: PermissionContext = {},
): Promise<PlatformApiPermissionResult> {
  const user = await getCurrentPlatformUser();
  if (!user) {
    return {
      ok: false,
      response: Response.json({ error: "Super admin authentication required.", ok: false }, { status: 401 }),
    };
  }

  const route = context.route ?? new URL(request.url).pathname;
  const nextContext = { ...context, requiredPermission: context.requiredPermission ?? action, route };
  if (!canPerformPlatformAction(user, action, nextContext)) {
    await auditPlatformAccessDenied(user, action, {
      ...nextContext,
      reason: nextContext.reason ?? `Role ${user.role} cannot perform ${action}.`,
    });
    return { ok: false, response: forbiddenPlatformResponse() };
  }

  return { ok: true, user };
}
