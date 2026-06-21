import {
  deletePrismaMembershipLevel,
  updatePrismaMembershipLevel,
} from "@/features/membership-levels/prisma-repository";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runWrite(
    (tenant, body) => updatePrismaMembershipLevel(id, body, tenant),
    request,
    WRITE_PERMISSIONS.membershipLevelsManage,
  );
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runWrite(
    (tenant) => deletePrismaMembershipLevel(id, tenant),
    undefined,
    WRITE_PERMISSIONS.membershipLevelsManage,
  );
}
