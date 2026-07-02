import { refundPrismaSale } from "@/features/pos/post-sale-repository";
import { STORE_ACTIONS } from "@/features/permissions/store-permissions";
import { runWrite } from "@/lib/api/write-response";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return runWrite(
    (tenant, body) => refundPrismaSale(tenant, {
      managerPinApproval: body.__storeManagerPinApproval,
      reason: typeof body.reason === "string" ? body.reason : typeof body.approval?.reason === "string" ? body.approval.reason : undefined,
      saleId: id,
    }),
    request,
    undefined,
    { allowManagerPinApproval: true, route: "/api/pos/sales/[id]/refund", storeAction: [STORE_ACTIONS.SALE_REFUND, STORE_ACTIONS.PAYMENT_REFUND], targetId: id, targetType: "sale" },
  );
}
