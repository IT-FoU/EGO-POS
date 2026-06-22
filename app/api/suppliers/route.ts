import { getPrismaSuppliers, createPrismaSupplier } from "@/features/suppliers/prisma-repository";
import { runRead, runWrite } from "@/lib/api/write-response";
import { READ_PERMISSIONS, WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function GET() {
  return runRead((tenant) => getPrismaSuppliers(tenant), READ_PERMISSIONS.purchasingView);
}

export async function POST(request: Request) {
  return runWrite((tenant, body) => createPrismaSupplier(body, tenant), request, WRITE_PERMISSIONS.suppliersCreate);
}
