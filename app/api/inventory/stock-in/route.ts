import { createStockIn } from "@/features/inventory/prisma-repository";
import { STORE_ACTIONS } from "@/features/permissions/store-permissions";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function POST(request: Request) {
  return runWrite(
    (tenant, body) => createStockIn(body, tenant),
    request,
    WRITE_PERMISSIONS.inventoryStockIn,
    { route: "/api/inventory/stock-in", storeAction: STORE_ACTIONS.INVENTORY_STOCK_IN, targetType: "inventory" },
  );
}
