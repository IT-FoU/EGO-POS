import { archivePrismaCustomer, updatePrismaCustomer } from "@/features/customers/prisma-repository";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runWrite((tenant, body) => updatePrismaCustomer(id, body, tenant), request, WRITE_PERMISSIONS.customersUpdate);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runWrite((tenant) => archivePrismaCustomer(id, tenant), undefined, WRITE_PERMISSIONS.customersUpdate);
}
