import { cookies } from "next/headers";
import { StoreAccessDenied } from "@/components/permissions/store-access-denied";
import { canUseStoreAction } from "@/features/permissions/store-ui-permissions";
import { STORE_ACTIONS } from "@/features/permissions/store-permissions";
import { StoreActivityLogsClient } from "@/features/store-activity/components/store-activity-logs-client";
import { requireSession } from "@/lib/auth/session";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";
import { tSettings } from "@/lib/i18n/settings-copy";

export default async function ActivityLogsPage() {
  const session = await requireSession();
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  if (!canUseStoreAction(session.user.roles, STORE_ACTIONS.STORE_ACTIVITY_LOGS_VIEW_OWN_STORE)) {
    return <StoreAccessDenied description={tSettings("accessDeniedBody", locale)} title={tSettings("accessDeniedTitle", locale)} />;
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-semibold">{tSettings("storeActivityLogs", locale)}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{tSettings("activityLogsSubtitle", locale)}</p>
      </div>
      <StoreActivityLogsClient locale={locale} />
    </div>
  );
}
