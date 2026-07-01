import { openCashSession } from "@/features/cash-sessions/prisma-repository";
import { STORE_ACTIONS } from "@/features/permissions/store-permissions";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function POST(request: Request) {
  return runWrite(
    (tenant, body) =>
      openCashSession(
        {
          note: typeof body.note === "string" ? body.note : undefined,
          openingCashLak: Number(body.openingCashLak ?? 0),
        },
        tenant,
      ),
    request,
    WRITE_PERMISSIONS.posCashSessionManage,
    { route: "/api/pos/cash-sessions/open", storeAction: STORE_ACTIONS.SHIFT_OPEN, targetType: "cash_session" },
  );
}
