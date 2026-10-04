import { replyAdminSupportTicket, SupportAccessError } from "@/features/support/support-service";
import { requirePlatformApiPermission } from "@/features/permissions/platform-api-guard";
import { PLATFORM_ACTIONS } from "@/features/permissions/platform-permissions";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const permission = await requirePlatformApiPermission(request, PLATFORM_ACTIONS.SUPPORT_MANAGE);
  if (!permission.ok) return permission.response;
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return Response.json({ data: await replyAdminSupportTicket(permission.user.id, id, body), ok: true });
  } catch (error) {
    const status = error instanceof SupportAccessError ? error.status : 400;
    const message = error instanceof Error ? error.message : "Support request failed.";
    return Response.json({ error: message, ok: false }, { status });
  }
}
