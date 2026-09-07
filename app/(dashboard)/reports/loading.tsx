import { cookies } from "next/headers";
import {
  RouteLoadingCards,
  RouteLoadingHeader,
  RouteLoadingPanel,
  RouteLoadingShell,
} from "@/components/layout/route-loading-shell";
import { getReportsCopy } from "@/lib/i18n/reports-copy";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function ReportsLoading() {
  const cookieStore = await cookies();
  const copy = getReportsCopy(getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value));

  return (
    <RouteLoadingShell label={copy.loadingReports}>
      <RouteLoadingHeader />
      <RouteLoadingCards count={4} />
      <div className="grid min-w-0 gap-5 xl:grid-cols-2">
        <RouteLoadingPanel tall />
        <RouteLoadingPanel tall />
      </div>
    </RouteLoadingShell>
  );
}
