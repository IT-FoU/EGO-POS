import { updatePurchaseOrderStatus } from "@/features/purchasing/prisma-repository";
import { runWrite } from "@/lib/api/write-response";
import { requireFinePermission } from "@/lib/auth/fine-access";
import { assertPermission, WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function POST(request: Request) {
  return runWrite(async (tenant, body) => {
    const status = String((body as { status?: unknown }).status ?? "");
    if (status === "cancelled") await requireFinePermission(tenant, "purchasing.delete");
    else await assertPermission(tenant, WRITE_PERMISSIONS.purchasingEdit);
    return updatePurchaseOrderStatus(body, tenant);
  }, request);
}
