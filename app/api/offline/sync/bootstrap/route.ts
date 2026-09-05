import { bootstrapSync } from "@/features/offline/server/sync-service";
import { runRead } from "@/lib/api/write-response";
import { READ_PERMISSIONS } from "@/lib/auth/permissions";

/**
 * Resumable/paginated initial bootstrap. Session/tenant/permission secured
 * (POS view). Reference-data wiring lands in Phase 5.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const limit = url.searchParams.get("limit");
  return runRead(
    (tenant) => bootstrapSync(tenant, { cursor, limit }),
    READ_PERMISSIONS.posView,
  );
}
