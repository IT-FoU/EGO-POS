import { DashboardAlertsClient } from "@/features/dashboard/components/dashboard-interactions-client";
import {
  getMiniMartDashboardSecondarySnapshot,
  type DashboardDateRange,
  type ShiftSummary,
} from "@/features/dashboard/dashboard-service";

export async function DashboardAlertsLoader({
  dateRange,
  salesTodayLak,
  shiftSummaries,
}: {
  dateRange: DashboardDateRange;
  salesTodayLak: number;
  shiftSummaries: ShiftSummary[];
}) {
  const secondary = await getMiniMartDashboardSecondarySnapshot(dateRange, {
    salesTodayLak,
    shiftSummaries,
  });
  return <DashboardAlertsClient alerts={secondary.alerts} />;
}
