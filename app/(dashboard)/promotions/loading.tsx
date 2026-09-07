import { cookies } from "next/headers";
import {
  RouteLoadingCards,
  RouteLoadingHeader,
  RouteLoadingRows,
  RouteLoadingShell,
} from "@/components/layout/route-loading-shell";
import { getPromotionsCopy } from "@/lib/i18n/promotions-copy";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function PromotionsLoading() {
  const cookieStore = await cookies();
  const copy = getPromotionsCopy(getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value));

  return (
    <RouteLoadingShell label={copy.loadingPromotions}>
      <RouteLoadingHeader />
      <RouteLoadingCards count={5} />
      <RouteLoadingRows count={6} />
    </RouteLoadingShell>
  );
}
