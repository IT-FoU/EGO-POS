import { recordCashSessionMovement } from "@/features/cash-sessions/prisma-repository";
import { runWrite } from "@/lib/api/write-response";
import { FINE, requireFinePermission } from "@/lib/auth/fine-access";

export async function POST(request: Request) {
  return runWrite(
    async (tenant, body) => {
      await requireFinePermission(tenant, FINE.posCashIn);
      return recordCashSessionMovement(
        String(body.sessionId ?? ""),
        "cash_in",
        {
          amountLak: Number(body.amountLak ?? 0),
          reason: typeof body.reason === "string" ? body.reason : undefined,
        },
        tenant,
      );
    },
    request,
  );
}
