import { createPrismaHeldBill, listPrismaHeldBills } from "@/features/pos/held-bills-repository";
import { runRead, runWrite } from "@/lib/api/write-response";
import { requirePosFineAction } from "@/lib/auth/fine-access";
import { READ_PERMISSIONS, WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function GET() {
  return runRead((tenant) => listPrismaHeldBills(tenant), READ_PERMISSIONS.posView);
}

export async function POST(request: Request) {
  return runWrite(
    async (tenant, body) => {
      await requirePosFineAction(tenant, "hold_bill");
      return createPrismaHeldBill(body, tenant);
    },
    request,
    WRITE_PERMISSIONS.posSell,
  );
}
