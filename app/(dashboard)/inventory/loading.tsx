import {
  RouteLoadingCards,
  RouteLoadingHeader,
  RouteLoadingRows,
  RouteLoadingShell,
} from "@/components/layout/route-loading-shell";

export default function InventoryLoading() {
  return (
    <RouteLoadingShell label="Inventory">
      <RouteLoadingHeader />
      <RouteLoadingCards count={4} />
      <RouteLoadingRows count={6} />
    </RouteLoadingShell>
  );
}
