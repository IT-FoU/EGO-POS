import { STORE_ACTIONS } from "@/features/permissions/store-permissions";
import {
  getStoreActivityLogFilterOptions,
  listStoreActivityLogsForTenant,
  parseStoreActivityLogFilters,
} from "@/features/store-activity/store-activity-log-service";
import { runRead } from "@/lib/api/write-response";

export async function GET(request: Request) {
  const filters = parseStoreActivityLogFilters(new URL(request.url).searchParams);
  return runRead(
    async (tenant) => {
      const [result, options] = await Promise.all([
        listStoreActivityLogsForTenant(tenant, filters),
        getStoreActivityLogFilterOptions(tenant),
      ]);
      return { ...result, options };
    },
    undefined,
    {
      route: "/api/store/activity-logs",
      storeAction: STORE_ACTIONS.STORE_ACTIVITY_LOGS_VIEW_OWN_STORE,
      targetType: "store_activity_logs",
    },
  );
}
