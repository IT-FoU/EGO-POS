import { revokeDevice } from "@/features/offline/server/device-service";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

/**
 * Revoke a registered device. Owner/Manager only. Revoked devices are blocked
 * from further offline writes at the next connection.
 */
export async function POST(request: Request) {
  return runWrite(
    (tenant, body) => revokeDevice(tenant, { deviceId: String(body?.deviceId ?? "") }),
    request,
    WRITE_PERMISSIONS.staffManage,
    { route: "/api/offline/device/revoke" },
  );
}
