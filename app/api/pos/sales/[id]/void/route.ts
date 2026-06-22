import { voidPrismaSale } from "@/features/pos/post-sale-repository";
import { runWrite } from "@/lib/api/write-response";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return runWrite(
    (tenant, body) => voidPrismaSale(tenant, { reason: typeof body.reason === "string" ? body.reason : undefined, saleId: id }),
    request,
  );
}
