import { cookies } from "next/headers";
import {
  RouteLoadingCards,
  RouteLoadingHeader,
  RouteLoadingRows,
  RouteLoadingShell,
} from "@/components/layout/route-loading-shell";
import { getInventoryCopy } from "@/lib/i18n/inventory-copy";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function InventoryLoading() {
  const cookieStore = await cookies();
  const copy = getInventoryCopy(getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value));

  return (
    <RouteLoadingShell label={copy.loadingInventory}>
      <RouteLoadingHeader />
      <RouteLoadingCards count={4} />
      <RouteLoadingRows count={6} />
    </RouteLoadingShell>
  );
}
