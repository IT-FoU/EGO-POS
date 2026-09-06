import { statusSync } from "@/features/offline/server/sync-service";
import { runRead } from "@/lib/api/write-response";
import { READ_PERMISSIONS } from "@/lib/auth/permissions";

/**
 * Sync diagnostics/status for a device. Session/tenant/permission secured (POS view).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const deviceId = url.searchParams.get("deviceId") ?? "";
  return runRead(
    (tenant) => statusSync(tenant, { deviceId }),
    READ_PERMISSIONS.posView,
  );
}
