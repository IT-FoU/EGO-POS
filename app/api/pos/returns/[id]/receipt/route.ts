import { getPrismaReturnReceipt } from "@/features/pos/return-repository";
import { runRead } from "@/lib/api/write-response";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return runRead((tenant) => getPrismaReturnReceipt(tenant, id), undefined, { request });
}