import { getPrismaMembershipLevels, createPrismaMembershipLevel } from "@/features/membership-levels/prisma-repository";
import { runRead, runWrite } from "@/lib/api/write-response";
import { READ_PERMISSIONS, WRITE_PERMISSIONS } from "@/lib/auth/permissions";
import { isNextProductionBuildPhase } from "@/lib/build/build-phase";

export const dynamic = "force-dynamic";

export async function GET() {
  if (isNextProductionBuildPhase()) {
    return Response.json({ data: [], ok: true });
  }

  return runRead((tenant) => getPrismaMembershipLevels(tenant), READ_PERMISSIONS.membershipView);
}

export async function POST(request: Request) {
  return runWrite(
    (tenant, body) => createPrismaMembershipLevel(body, tenant),
    request,
    WRITE_PERMISSIONS.membershipLevelsManage,
  );
}
