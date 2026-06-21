import { createSupplierPayment } from "@/features/purchasing/prisma-repository";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function POST(request: Request) {
  return runWrite((tenant, body) => createSupplierPayment(body, tenant), request, WRITE_PERMISSIONS.purchasingPayment);
}
