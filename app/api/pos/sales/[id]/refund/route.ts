import { refundPrismaSale } from "@/features/pos/post-sale-repository";
import { STORE_ACTIONS } from "@/features/permissions/store-permissions";
import { runWrite } from "@/lib/api/write-response";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return runWrite(
    (tenant, body) => refundPrismaSale(tenant, { reason: typeof body.reason === "string" ? body.reason : undefined, saleId: id }),
    request,
    undefined,
    { route: "/api/pos/sales/[id]/refund", storeAction: [STORE_ACTIONS.SALE_REFUND, STORE_ACTIONS.PAYMENT_REFUND], targetId: id, targetType: "sale" },
  );
}
