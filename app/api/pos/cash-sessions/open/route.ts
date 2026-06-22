import { openCashSession } from "@/features/cash-sessions/prisma-repository";
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
  );
}
