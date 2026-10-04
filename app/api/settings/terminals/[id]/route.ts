import { deleteStoreTerminal, updateStoreTerminal } from "@/features/terminals/terminal-service";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return runWrite(
    (tenant, body) => updateStoreTerminal(tenant, id, body),
    request,
    WRITE_PERMISSIONS.terminalsEdit,
  );
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return runWrite(
    (tenant, body) => deleteStoreTerminal(tenant, id, body),
    request,
    WRITE_PERMISSIONS.terminalsEdit,
  );
}
