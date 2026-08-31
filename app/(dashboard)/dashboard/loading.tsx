import {
  RouteLoadingCards,
  RouteLoadingHeader,
  RouteLoadingPanel,
  RouteLoadingShell,
} from "@/components/layout/route-loading-shell";

export default function DashboardLoading() {
  return (
    <RouteLoadingShell label="Dashboard">
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
