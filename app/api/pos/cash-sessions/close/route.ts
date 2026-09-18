import { closeCashSession } from "@/features/cash-sessions/prisma-repository";
import { STORE_ACTIONS } from "@/features/permissions/store-permissions";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

function readClosingCountBreakdown(body: Record<string, unknown>) {
  const breakdown = body.countBreakdown;
  if (breakdown == null || typeof breakdown !== "object" || Array.isArray(breakdown)) {
    return undefined;
  }
  const closing = (breakdown as Record<string, unknown>).closing;
  if (closing === undefined) {
    return undefined;
  }
  return { closing: closing as Record<string, number> };
}

export async function POST(request: Request) {
  return runWrite(
    (tenant, body) =>
      closeCashSession(
        String(body.sessionId ?? ""),
        {
          countBreakdown: readClosingCountBreakdown(body),
          countedCashLak: Number(body.countedCashLak ?? 0),
          note: typeof body.note === "string" ? body.note : undefined,
        },
        tenant,
      ),
    request,
    WRITE_PERMISSIONS.posCashSessionManage,
    { route: "/api/pos/cash-sessions/close", storeAction: STORE_ACTIONS.SHIFT_CLOSE, targetType: "cash_session" },
  );
}
