import { cookies } from "next/headers";
import {
  RouteLoadingCards,
  RouteLoadingHeader,
  RouteLoadingRows,
  RouteLoadingShell,
} from "@/components/layout/route-loading-shell";
import { getCustomersCopy } from "@/lib/i18n/customers-copy";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function CustomersLoading() {
  const cookieStore = await cookies();
  const copy = getCustomersCopy(getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value));

  return (
    <RouteLoadingShell label={copy.loadingCustomers}>
      <RouteLoadingHeader />
      <RouteLoadingCards count={4} />
      <RouteLoadingRows count={6} />
    </RouteLoadingShell>
  );
}
