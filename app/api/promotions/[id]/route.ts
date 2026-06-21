import { archivePrismaPromotion, updatePrismaPromotion } from "@/features/promotions/prisma-repository";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runWrite((tenant, body) => updatePrismaPromotion(id, body, tenant), request, WRITE_PERMISSIONS.promotionsUpdate);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runWrite((tenant) => archivePrismaPromotion(id, tenant), undefined, WRITE_PERMISSIONS.promotionsDelete);
}
