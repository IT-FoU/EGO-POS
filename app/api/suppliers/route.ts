import { getSuppliers } from "@/features/suppliers/supplier-service";
import { createPrismaSupplier } from "@/features/suppliers/prisma-repository";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function GET() {
  return Response.json({ data: await getSuppliers(), ok: true });
}

export async function POST(request: Request) {
  return runWrite((tenant, body) => createPrismaSupplier(body, tenant), request, WRITE_PERMISSIONS.suppliersCreate);
}
