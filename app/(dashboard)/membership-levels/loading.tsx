import { cookies } from "next/headers";
import {
  RouteLoadingCards,
  RouteLoadingHeader,
  RouteLoadingRows,
  RouteLoadingShell,
} from "@/components/layout/route-loading-shell";
import { getMembershipsCopy } from "@/lib/i18n/memberships-copy";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function MembershipLevelsLoading() {
  const cookieStore = await cookies();
  const copy = getMembershipsCopy(getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value));

  return (
    <RouteLoadingShell label={copy.loadingMemberships}>
      <RouteLoadingHeader />
      <RouteLoadingCards count={4} />
      <RouteLoadingRows count={6} />
    </RouteLoadingShell>
  );
}
