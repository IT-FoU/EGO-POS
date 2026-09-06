import { cookies } from "next/headers";
import {
  RouteLoadingHeader,
  RouteLoadingRows,
  RouteLoadingShell,
} from "@/components/layout/route-loading-shell";
import { getProductsCopy } from "@/lib/i18n/products-copy";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function CategoriesLoading() {
  const cookieStore = await cookies();
  const copy = getProductsCopy(getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value));

  return (
    <RouteLoadingShell label={copy.loadingCategories}>
      <RouteLoadingHeader />
      <RouteLoadingRows count={6} />
    </RouteLoadingShell>
  );
}
