import { registerDevice } from "@/features/offline/server/device-service";
import { runWrite } from "@/lib/api/write-response";
import { READ_PERMISSIONS } from "@/lib/auth/permissions";

/**
 * Register an offline-capable device as PENDING for the authenticated tenant.
 * Secured via the standard session/tenant wrapper; requires POS view access.
 */
export async function POST(request: Request) {
  return runWrite(
    (tenant, body) =>
      registerDevice(tenant, {
        deviceId: String(body?.deviceId ?? ""),
        deviceName: String(body?.deviceName ?? ""),
        terminalId: body?.terminalId ? String(body.terminalId) : undefined,
      }),
    request,
    READ_PERMISSIONS.posView,
    { route: "/api/offline/device/register" },
  );
}
