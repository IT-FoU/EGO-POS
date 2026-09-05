import { pushSync } from "@/features/offline/server/sync-service";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

/**
 * Batched offline command push. Session/tenant/permission secured (POS sell).
 * The engine validates tenant/device/terminal/policy scope, orders by
 * dependency, and returns a per-operation result. Idempotent by companyId+operationId.
 */
export async function POST(request: Request) {
  return runWrite(
    (tenant, body) => pushSync(tenant, body),
    request,
    WRITE_PERMISSIONS.posSell,
    { route: "/api/offline/sync/push" },
  );
}
