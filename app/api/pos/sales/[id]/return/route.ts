import { returnPrismaSale } from "@/features/pos/return-repository";
import { STORE_ACTIONS } from "@/features/permissions/store-permissions";
import { runWrite } from "@/lib/api/write-response";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return runWrite(
    (tenant, body) => returnPrismaSale(tenant, {
      items: Array.isArray(body.items) ? body.items : [],
      managerPinApproval: body.__storeManagerPinApproval,
      reason: typeof body.reason === "string" ? body.reason : undefined,
      refundMethod: body.refundMethod,
      saleId: id,
    }),
    request,
    undefined,
    {
      allowManagerPinApproval: true,
      route: "/api/pos/sales/[id]/return",
      storeAction: [STORE_ACTIONS.SALE_REFUND, STORE_ACTIONS.PAYMENT_REFUND],
      targetId: id,
      targetType: "sale",
    },
  );
}
