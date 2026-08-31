import {
  RouteLoadingHeader,
  RouteLoadingRows,
  RouteLoadingShell,
} from "@/components/layout/route-loading-shell";

export default function ProductsLoading() {
  return (
    <RouteLoadingShell label="Products">
      <RouteLoadingHeader />
      <RouteLoadingRows count={8} />
    </RouteLoadingShell>
  );
}
