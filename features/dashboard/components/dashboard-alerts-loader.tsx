import { cookies } from "next/headers";
import { DashboardAlertsClient } from "@/features/dashboard/components/dashboard-interactions-client";
import {
  getMiniMartDashboardSecondarySnapshot,
  type DashboardDateRange,
  type ShiftSummary,
} from "@/features/dashboard/dashboard-service";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

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
  const cookieStore = await cookies();
  const initialLocale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  return <DashboardAlertsClient alerts={secondary.alerts} initialLocale={initialLocale} />;
}
