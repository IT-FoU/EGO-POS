import { cancelPrismaHeldBill } from "@/features/pos/held-bills-repository";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return runWrite(
    (tenant, body) => cancelPrismaHeldBill(id, typeof body.reason === "string" ? body.reason : undefined, tenant),
    request,
    WRITE_PERMISSIONS.posSell,
  );
}
