import { exchangePrismaSale } from "@/features/pos/return-repository";
import { STORE_ACTIONS } from "@/features/permissions/store-permissions";
import { runWrite } from "@/lib/api/write-response";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return runWrite(
    (tenant, body) => exchangePrismaSale(tenant, {
      managerPinApproval: body.__storeManagerPinApproval,
      paidAmountLak: body.paidAmountLak,
      reason: typeof body.reason === "string" ? body.reason : undefined,
      refundMethod: body.refundMethod,
      replacementItems: Array.isArray(body.replacementItems) ? body.replacementItems : [],
      returnedItems: Array.isArray(body.returnedItems) ? body.returnedItems : [],
      saleId: id,
    }),
    request,
    undefined,
    {
      allowManagerPinApproval: true,
      route: "/api/pos/sales/[id]/exchange",
      storeAction: [STORE_ACTIONS.SALE_REFUND, STORE_ACTIONS.PAYMENT_REFUND, STORE_ACTIONS.SALE_COMPLETE, STORE_ACTIONS.PAYMENT_RECEIVE],
      targetId: id,
      targetType: "sale",
    },
  );
}
