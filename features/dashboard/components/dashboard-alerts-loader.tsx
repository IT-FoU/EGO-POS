import { DashboardAlertsClient } from "@/features/dashboard/components/dashboard-interactions-client";
import {
  getMiniMartDashboardSecondarySnapshot,
  type DashboardDateRange,
  type ShiftSummary,
} from "@/features/dashboard/dashboard-service";
import type { DashboardCopy } from "@/lib/i18n/dashboard-copy";

export async function DashboardAlertsLoader({
  copy,
  dateRange,
  salesTodayLak,
  shiftSummaries,
}: {
  copy: DashboardCopy;
  dateRange: DashboardDateRange;
  salesTodayLak: number;
  shiftSummaries: ShiftSummary[];
}) {
  const secondary = await getMiniMartDashboardSecondarySnapshot(dateRange, {
    salesTodayLak,
    shiftSummaries,
  });
  return <DashboardAlertsClient alerts={secondary.alerts} copy={copy} />;
}
