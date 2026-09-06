import { activateDevice } from "@/features/offline/server/device-service";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

/**
 * Activate a registered device for offline writes. Owner/Manager only
 * (enforced by `assertPermission(staff.edit)`).
 */
export async function POST(request: Request) {
  return runWrite(
    (tenant, body) => activateDevice(tenant, { deviceId: String(body?.deviceId ?? "") }),
    request,
    WRITE_PERMISSIONS.staffManage,
    { route: "/api/offline/device/activate" },
  );
}
