import { getMembershipLevels } from "@/features/membership-levels/membership-level-service";
import { createPrismaMembershipLevel } from "@/features/membership-levels/prisma-repository";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";
import { isNextProductionBuildPhase } from "@/lib/build/build-phase";

export const dynamic = "force-dynamic";

export async function GET() {
  if (isNextProductionBuildPhase()) {
    return Response.json({ data: [], ok: true });
  }

  return Response.json({ data: await getMembershipLevels(), ok: true });
}

export async function POST(request: Request) {
  return runWrite(
    (tenant, body) => createPrismaMembershipLevel(body, tenant),
    request,
    WRITE_PERMISSIONS.membershipLevelsManage,
  );
}
