import { cookies } from "next/headers";
import {
  RouteLoadingCards,
  RouteLoadingHeader,
  RouteLoadingRows,
  RouteLoadingShell,
} from "@/components/layout/route-loading-shell";
import { getSuppliersCopy } from "@/lib/i18n/suppliers-copy";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function SuppliersLoading() {
  const cookieStore = await cookies();
  const copy = getSuppliersCopy(getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value));

  return (
    <RouteLoadingShell label={copy.loadingSuppliers}>
      <RouteLoadingHeader />
      <RouteLoadingCards count={5} />
      <RouteLoadingRows count={6} />
    </RouteLoadingShell>
  );
}
