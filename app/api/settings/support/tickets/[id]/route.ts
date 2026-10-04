import { getStoreSupportTicket } from "@/features/support/support-service";
import { apiJsonFromError } from "@/lib/api/write-response";
import { READ_PERMISSIONS, assertPermission } from "@/lib/auth/permissions";
import { requireApiSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireApiSession();
    const tenant = tenantFromSession(session);
    await assertPermission(tenant, READ_PERMISSIONS.helpView);
    return Response.json({ data: await getStoreSupportTicket(tenant, id), ok: true });
  } catch (error) {
    return apiJsonFromError(error);
  }
}
