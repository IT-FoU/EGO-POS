import { logPrismaReceiptReprint } from "@/features/pos/post-sale-repository";
import { runWrite } from "@/lib/api/write-response";
import { requirePosFineAction } from "@/lib/auth/fine-access";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return runWrite(async (tenant) => {
    await requirePosFineAction(tenant, "reprint_receipt");
    return logPrismaReceiptReprint(tenant, id);
  }, request);
}
