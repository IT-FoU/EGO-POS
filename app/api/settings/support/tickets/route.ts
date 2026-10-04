import { createStoreSupportTicket, listStoreSupportTickets } from "@/features/support/support-service";
import { runWrite } from "@/lib/api/write-response";
import { READ_PERMISSIONS, WRITE_PERMISSIONS, assertPermission } from "@/lib/auth/permissions";
import { requireApiSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";
import { apiJsonFromError } from "@/lib/api/write-response";

export async function GET(request: Request) {
  try {
    const session = await requireApiSession();
    const tenant = tenantFromSession(session);
    await assertPermission(tenant, READ_PERMISSIONS.helpView);
    const url = new URL(request.url);
    const tickets = await listStoreSupportTickets(tenant, {
      status: url.searchParams.get("status"),
      type: url.searchParams.get("type"),
    });
    return Response.json({ data: tickets, ok: true });
  } catch (error) {
    return apiJsonFromError(error);
  }
}

export async function POST(request: Request) {
  return runWrite(
    (tenant, body) => createStoreSupportTicket(tenant, body),
    request,
    WRITE_PERMISSIONS.helpSubmit,
  );
}
