import {
  RouteLoadingCards,
  RouteLoadingHeader,
  RouteLoadingPanel,
  RouteLoadingShell,
} from "@/components/layout/route-loading-shell";

export default function ReportsLoading() {
  return (
    <RouteLoadingShell label="Reports">
      <RouteLoadingHeader />
      <RouteLoadingCards count={4} />
      <div className="grid min-w-0 gap-5 xl:grid-cols-2">
        <RouteLoadingPanel tall />
        <RouteLoadingPanel tall />
      </div>
    </RouteLoadingShell>
  );
}
