import { archivePrismaProduct, deletePrismaProduct, updatePrismaProduct } from "@/features/products/prisma-repository";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";
import { STORE_ACTIONS } from "@/features/permissions/store-permissions";
import { productMutationActionsFromBody } from "@/lib/auth/store-permission-guard";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runWrite(
    (tenant, body) => updatePrismaProduct(id, body, tenant),
    request,
    WRITE_PERMISSIONS.productsUpdate,
    { allowManagerPinApproval: true, route: "/api/products/[id]", storeAction: productMutationActionsFromBody, targetId: id, targetType: "product" },
  );
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  return runWrite(
    (tenant) => url.searchParams.get("hard") === "true" ? deletePrismaProduct(id, tenant) : archivePrismaProduct(id, tenant),
    undefined,
    WRITE_PERMISSIONS.productsDelete,
    { allowManagerPinApproval: true, route: "/api/products/[id]", storeAction: STORE_ACTIONS.PRODUCT_DELETE, targetId: id, targetType: "product" },
  );
}
