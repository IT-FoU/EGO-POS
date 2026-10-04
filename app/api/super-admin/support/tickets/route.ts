import { listAdminSupportTickets, SupportAccessError } from "@/features/support/support-service";
import { requirePlatformApiPermission } from "@/features/permissions/platform-api-guard";
import { PLATFORM_ACTIONS } from "@/features/permissions/platform-permissions";

export async function GET(request: Request) {
  const permission = await requirePlatformApiPermission(request, PLATFORM_ACTIONS.SUPPORT_MANAGE);
  if (!permission.ok) return permission.response;
  const url = new URL(request.url);
  try {
    const data = await listAdminSupportTickets({
      company: url.searchParams.get("company"),
      status: url.searchParams.get("status"),
      type: url.searchParams.get("type"),
    });
    return Response.json({ data, ok: true });
  } catch (error) {
    const status = error instanceof SupportAccessError ? error.status : 400;
    const message = error instanceof Error ? error.message : "Support request failed.";
    return Response.json({ error: message, ok: false }, { status });
  }
}
