import { replyStoreSupportTicket } from "@/features/support/support-service";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runWrite(
    (tenant, body) => replyStoreSupportTicket(tenant, id, body),
    request,
    WRITE_PERMISSIONS.helpSubmit,
  );
}
