import { getDevicePolicy } from "@/features/offline/server/device-service";
import { runWrite } from "@/lib/api/write-response";
import { READ_PERMISSIONS } from "@/lib/auth/permissions";

/**
 * Bootstrap the device/terminal policy and return the minimal cached security
 * snapshot for an ACTIVE device (records a successful policy sync). POST because
 * it records lastPolicySyncAt; secured via the standard wrapper (POS view).
 */
export async function POST(request: Request) {
  return runWrite(
    (tenant, body) => getDevicePolicy(tenant, { deviceId: String(body?.deviceId ?? "") }),
    request,
    READ_PERMISSIONS.posView,
    { route: "/api/offline/device/policy" },
  );
}
