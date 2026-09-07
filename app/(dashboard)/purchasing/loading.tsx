import { cookies } from "next/headers";
import {
  RouteLoadingCards,
  RouteLoadingHeader,
  RouteLoadingRows,
  RouteLoadingShell,
} from "@/components/layout/route-loading-shell";
import { getPurchasingCopy } from "@/lib/i18n/purchasing-copy";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function PurchasingLoading() {
  const cookieStore = await cookies();
  const copy = getPurchasingCopy(getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value));

  return (
    <RouteLoadingShell label={copy.loadingPurchasing}>
      <RouteLoadingHeader />
      <RouteLoadingCards count={4} />
      <RouteLoadingRows count={6} />
    </RouteLoadingShell>
  );
}
