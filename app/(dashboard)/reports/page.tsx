import { cookies } from "next/headers";
import { StoreAccessDenied } from "@/components/permissions/store-access-denied";
import { canViewFullStoreReports } from "@/features/permissions/store-ui-permissions";
import { ReportsAnalyticsClient } from "@/features/reports/components/reports-analytics-client";
import { getReportsPageData } from "@/features/reports/report-service";
import { requireSession } from "@/lib/auth/session";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  if (!canViewFullStoreReports(session.user.roles)) {
    return <StoreAccessDenied />;
  }

  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const params = searchParams ? await searchParams : undefined;
  const { filterOptions, filters, hub, productRows } = await getReportsPageData(params);
  return (
    <ReportsAnalyticsClient
      filterOptions={filterOptions}
      filters={filters}
      generatedAt={new Date().toISOString()}
      hub={hub}
      locale={locale}
      productRows={productRows}
    />
  );
}
