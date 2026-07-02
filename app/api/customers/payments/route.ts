import { createPrismaCustomerPayment } from "@/features/customers/prisma-repository";
import { STORE_ACTIONS } from "@/features/permissions/store-permissions";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function POST(request: Request) {
  return runWrite(
    (tenant, body) => createPrismaCustomerPayment(body, tenant),
    request,
    WRITE_PERMISSIONS.customersPayment,
    { allowManagerPinApproval: true, route: "/api/customers/payments", storeAction: [STORE_ACTIONS.PAYMENT_RECEIVE, STORE_ACTIONS.CUSTOMER_CREDIT_UPDATE], targetType: "customer" },
  );
}
