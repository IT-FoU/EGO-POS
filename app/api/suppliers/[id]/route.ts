import { archivePrismaSupplier, updatePrismaSupplier } from "@/features/suppliers/prisma-repository";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runWrite((tenant, body) => updatePrismaSupplier(id, body, tenant), request, WRITE_PERMISSIONS.suppliersUpdate);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runWrite((tenant) => archivePrismaSupplier(id, tenant), undefined, WRITE_PERMISSIONS.suppliersDelete);
}
