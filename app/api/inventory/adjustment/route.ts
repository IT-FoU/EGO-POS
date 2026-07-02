import { createStockAdjustment } from "@/features/inventory/prisma-repository";
import { STORE_ACTIONS } from "@/features/permissions/store-permissions";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function POST(request: Request) {
  return runWrite(
    (tenant, body) => createStockAdjustment(body, tenant),
    request,
    WRITE_PERMISSIONS.inventoryAdjust,
    { allowManagerPinApproval: true, route: "/api/inventory/adjustment", storeAction: STORE_ACTIONS.INVENTORY_ADJUST, targetType: "inventory" },
  );
}
