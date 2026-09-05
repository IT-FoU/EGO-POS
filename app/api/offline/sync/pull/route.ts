import { pullSync } from "@/features/offline/server/sync-service";
import { runRead } from "@/lib/api/write-response";
import { READ_PERMISSIONS } from "@/lib/auth/permissions";

/**
 * Cursor-based delta pull. Session/tenant/permission secured (POS view).
 * Empty means empty (never seeds defaults).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const deviceId = url.searchParams.get("deviceId") ?? "";
  const cursor = url.searchParams.get("cursor");
  const limit = url.searchParams.get("limit");
  return runRead(
    (tenant) => pullSync(tenant, { deviceId, cursor, limit }),
    READ_PERMISSIONS.posView,
  );
}
