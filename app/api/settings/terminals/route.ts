import { createStoreTerminal, listStoreTerminals } from "@/features/terminals/terminal-service";
import { runRead, runWrite } from "@/lib/api/write-response";
import { READ_PERMISSIONS, WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function GET() {
  return runRead((tenant) => listStoreTerminals(tenant), READ_PERMISSIONS.terminalsView);
}

export async function POST(request: Request) {
  return runWrite(
    (tenant, body) => createStoreTerminal(tenant, body),
    request,
    WRITE_PERMISSIONS.terminalsEdit,
  );
}
