import { cookies } from "next/headers";
import {
  RouteLoadingCards,
  RouteLoadingHeader,
  RouteLoadingPanel,
  RouteLoadingShell,
} from "@/components/layout/route-loading-shell";
import { getSettingsCopy } from "@/lib/i18n/settings-copy";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function SettingsLoading() {
  const cookieStore = await cookies();
  const copy = getSettingsCopy(getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value));

  return (
    <RouteLoadingShell label={copy.loadingSettings}>
      <RouteLoadingHeader />
      <RouteLoadingCards count={3} />
      <RouteLoadingPanel tall />
    </RouteLoadingShell>
  );
}
