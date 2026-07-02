import { createStockCount } from "@/features/inventory/prisma-repository";
import { STORE_ACTIONS } from "@/features/permissions/store-permissions";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function POST(request: Request) {
  return runWrite(
    (tenant, body) => createStockCount(body, tenant),
    request,
    WRITE_PERMISSIONS.inventoryCount,
    { allowManagerPinApproval: true, route: "/api/inventory/count", storeAction: STORE_ACTIONS.INVENTORY_COUNT, targetType: "inventory" },
  );
}
