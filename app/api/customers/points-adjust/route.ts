import { adjustCustomerLoyaltyPoints } from "@/features/loyalty/loyalty-service";
import { STORE_ACTIONS } from "@/features/permissions/store-permissions";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function POST(request: Request) {
  return runWrite(
    (tenant, body) =>
      adjustCustomerLoyaltyPoints(tenant, {
        customerId: String(body.customerId ?? ""),
        note: typeof body.note === "string" ? body.note : undefined,
        pointsDelta: Number(body.pointsDelta ?? 0),
      }),
    request,
    WRITE_PERMISSIONS.customersUpdate,
    { route: "/api/customers/points-adjust", storeAction: STORE_ACTIONS.CUSTOMER_CREDIT_UPDATE, targetType: "customer" },
  );
}
