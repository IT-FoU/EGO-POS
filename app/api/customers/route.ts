import { getCustomers } from "@/features/customers/customer-service";
import { createPrismaCustomer } from "@/features/customers/prisma-repository";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function GET() {
  return Response.json({ data: await getCustomers(), ok: true });
}

export async function POST(request: Request) {
  return runWrite((tenant, body) => createPrismaCustomer(body, tenant), request, WRITE_PERMISSIONS.customersCreate);
}
