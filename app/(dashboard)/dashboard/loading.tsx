import { cookies } from "next/headers";
import {
  RouteLoadingCards,
  RouteLoadingHeader,
  RouteLoadingPanel,
  RouteLoadingShell,
} from "@/components/layout/route-loading-shell";
import { getDashboardCopy } from "@/lib/i18n/dashboard-copy";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function DashboardLoading() {
  const cookieStore = await cookies();
  const copy = getDashboardCopy(getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value));

  return (
    <RouteLoadingShell label={copy.dashboard}>
      <RouteLoadingHeader />
      <RouteLoadingCards count={4} />
      <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
        <RouteLoadingPanel tall />
        <div className="grid min-w-0 gap-5">
          <RouteLoadingPanel />
          <RouteLoadingPanel />
        </div>
      </section>
      <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)]">
        <RouteLoadingPanel />
        <RouteLoadingPanel />
      </section>
    </RouteLoadingShell>
  );
}
