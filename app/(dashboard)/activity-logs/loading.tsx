import { cookies } from "next/headers";
import {
  RouteLoadingHeader,
  RouteLoadingRows,
  RouteLoadingShell,
} from "@/components/layout/route-loading-shell";
import { getSettingsCopy } from "@/lib/i18n/settings-copy";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function ActivityLogsLoading() {
  const cookieStore = await cookies();
  const copy = getSettingsCopy(getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value));

  return (
    <RouteLoadingShell label={copy.storeActivityLogs}>
      <RouteLoadingHeader />
      <RouteLoadingRows count={6} />
    </RouteLoadingShell>
  );
}
