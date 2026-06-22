import { closeCashSession } from "@/features/cash-sessions/prisma-repository";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function POST(request: Request) {
  return runWrite(
    (tenant, body) =>
      closeCashSession(
        String(body.sessionId ?? ""),
        {
          countedCashLak: Number(body.countedCashLak ?? 0),
          note: typeof body.note === "string" ? body.note : undefined,
        },
        tenant,
      ),
    request,
    WRITE_PERMISSIONS.posCashSessionManage,
  );
}
