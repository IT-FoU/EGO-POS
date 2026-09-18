import { openCashSession } from "@/features/cash-sessions/prisma-repository";
import { STORE_ACTIONS } from "@/features/permissions/store-permissions";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

function readOpeningCountBreakdown(body: Record<string, unknown>) {
  const breakdown = body.countBreakdown;
  if (breakdown == null || typeof breakdown !== "object" || Array.isArray(breakdown)) {
    return undefined;
  }
  const opening = (breakdown as Record<string, unknown>).opening;
  if (opening === undefined) {
    return undefined;
  }
  return { opening: opening as Record<string, number> };
}

export async function POST(request: Request) {
  return runWrite(
    (tenant, body) =>
      openCashSession(
        {
          countBreakdown: readOpeningCountBreakdown(body),
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
