import { resumePrismaHeldBill } from "@/features/pos/held-bills-repository";
import { runWrite } from "@/lib/api/write-response";
import { requirePosFineAction } from "@/lib/auth/fine-access";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return runWrite(async (tenant) => {
    await requirePosFineAction(tenant, "resume_bill");
    return resumePrismaHeldBill(id, tenant);
  }, undefined, WRITE_PERMISSIONS.posSell);
}
