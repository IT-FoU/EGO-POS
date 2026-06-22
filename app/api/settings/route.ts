import { getPrismaSettings, updatePrismaSettings } from "@/features/settings/prisma-repository";
import { runRead, runWrite } from "@/lib/api/write-response";
import { READ_PERMISSIONS, WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function GET() {
  return runRead((tenant) => getPrismaSettings(tenant), READ_PERMISSIONS.settingsView);
}

export async function PATCH(request: Request) {
  return runWrite((tenant, body) => updatePrismaSettings(body, tenant), request, WRITE_PERMISSIONS.settingsManage);
}
