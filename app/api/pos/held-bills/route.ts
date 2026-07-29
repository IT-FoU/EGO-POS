import { createPrismaHeldBill, listPrismaHeldBills } from "@/features/pos/held-bills-repository";
import { runRead, runWrite } from "@/lib/api/write-response";
import { READ_PERMISSIONS, WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function GET() {
  return runRead((tenant) => listPrismaHeldBills(tenant), READ_PERMISSIONS.posView);
}

export async function POST(request: Request) {
  return runWrite(
    (tenant, body) => createPrismaHeldBill(body, tenant),
    request,
    WRITE_PERMISSIONS.posSell,
  );
}
