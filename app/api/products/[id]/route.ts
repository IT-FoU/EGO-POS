import { archivePrismaProduct, deletePrismaProduct, updatePrismaProduct } from "@/features/products/prisma-repository";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runWrite((tenant, body) => updatePrismaProduct(id, body, tenant), request, WRITE_PERMISSIONS.productsUpdate);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  return runWrite(
    (tenant) => url.searchParams.get("hard") === "true" ? deletePrismaProduct(id, tenant) : archivePrismaProduct(id, tenant),
    undefined,
    WRITE_PERMISSIONS.productsDelete,
  );
}
