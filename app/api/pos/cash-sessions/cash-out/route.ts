import { recordCashSessionMovement } from "@/features/cash-sessions/prisma-repository";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function POST(request: Request) {
  return runWrite(
    (tenant, body) =>
      recordCashSessionMovement(
        String(body.sessionId ?? ""),
        "cash_out",
        {
          amountLak: Number(body.amountLak ?? 0),
          reason: typeof body.reason === "string" ? body.reason : undefined,
        },
        tenant,
      ),
    request,
    WRITE_PERMISSIONS.posCashSessionManage,
  );
}
