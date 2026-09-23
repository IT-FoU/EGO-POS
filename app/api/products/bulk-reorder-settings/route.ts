import { bulkUpdatePrismaReorderSettings } from "@/features/products/prisma-repository";
import { STORE_ACTIONS } from "@/features/permissions/store-permissions";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function POST(request: Request) {
  return runWrite(
    (tenant, body) =>
      bulkUpdatePrismaReorderSettings(
        {
          minStock: body?.minStock ?? null,
          productIds: Array.isArray(body?.productIds) ? body.productIds : [],
          reorderQtyMode: body?.reorderQtyMode ?? null,
          targetStock: body?.targetStock ?? null,
        },
        tenant,
      ),
    request,
    WRITE_PERMISSIONS.productsUpdate,
    {
      route: "/api/products/bulk-reorder-settings",
      storeAction: STORE_ACTIONS.PRODUCT_UPDATE,
      targetType: "product",
    },
  );
}
