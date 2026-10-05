import { STORE_ACTIONS } from "@/features/permissions/store-permissions";
import {
  listStoreActivityLogsForTenant,
  parseStoreActivityLogFilters,
} from "@/features/store-activity/store-activity-log-service";
import { runRead } from "@/lib/api/write-response";

export async function GET(request: Request) {
  const filters = parseStoreActivityLogFilters(new URL(request.url).searchParams);
  return runRead(
    async (tenant) => {
      return listStoreActivityLogsForTenant(tenant, filters);
    },
    undefined,
    {
      request,
      route: "/api/store/activity-logs",
      storeAction: STORE_ACTIONS.STORE_ACTIVITY_VIEW,
      targetType: "store_activity_logs",
    },
  );
}
