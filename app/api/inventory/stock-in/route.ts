import { createStockIn } from "@/features/inventory/prisma-repository";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function POST(request: Request) {
  return runWrite((tenant, body) => createStockIn(body, tenant), request, WRITE_PERMISSIONS.inventoryStockIn);
}
