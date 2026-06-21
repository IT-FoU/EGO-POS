import { createPrismaCustomerPayment } from "@/features/customers/prisma-repository";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function POST(request: Request) {
  return runWrite((tenant, body) => createPrismaCustomerPayment(body, tenant), request, WRITE_PERMISSIONS.customersPayment);
}
