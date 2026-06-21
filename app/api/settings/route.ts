import { getPrismaSettings, updatePrismaSettings } from "@/features/settings/prisma-repository";
import { requireSession } from "@/lib/auth/session";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";
import { tenantFromSession } from "@/lib/db/write-context";

export async function GET() {
  const session = await requireSession();
  return Response.json({ data: await getPrismaSettings(tenantFromSession(session)), ok: true });
}

export async function PATCH(request: Request) {
  return runWrite((tenant, body) => updatePrismaSettings(body, tenant), request, WRITE_PERMISSIONS.settingsManage);
}
