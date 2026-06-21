import { completePrismaSale } from "@/features/pos/prisma-repository";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function POST(request: Request) {
  return runWrite((tenant, body) => completePrismaSale(body, tenant), request, WRITE_PERMISSIONS.posSell);
}
