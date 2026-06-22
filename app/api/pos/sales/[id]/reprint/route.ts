import { logPrismaReceiptReprint } from "@/features/pos/post-sale-repository";
import { runWrite } from "@/lib/api/write-response";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return runWrite((tenant) => logPrismaReceiptReprint(tenant, id));
}
