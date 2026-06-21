import { deletePrismaCategory, upsertPrismaCategory } from "@/features/products/prisma-repository";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runWrite((tenant, body) => upsertPrismaCategory({ ...body, id }, tenant), request, WRITE_PERMISSIONS.categoriesManage);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runWrite((tenant) => deletePrismaCategory(id, tenant), undefined, WRITE_PERMISSIONS.categoriesManage);
}
