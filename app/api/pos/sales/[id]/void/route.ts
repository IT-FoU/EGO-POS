import { voidPrismaSale } from "@/features/pos/post-sale-repository";
import { STORE_ACTIONS } from "@/features/permissions/store-permissions";
import { runWrite } from "@/lib/api/write-response";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return runWrite(
    (tenant, body) => voidPrismaSale(tenant, { reason: typeof body.reason === "string" ? body.reason : undefined, saleId: id }),
    request,
    undefined,
    { route: "/api/pos/sales/[id]/void", storeAction: [STORE_ACTIONS.SALE_VOID, STORE_ACTIONS.PROMOTION_REVERSE], targetId: id, targetType: "sale" },
  );
}
