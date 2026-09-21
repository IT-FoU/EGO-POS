import { cookies } from "next/headers";
import { ReportsAnalyticsClient } from "@/features/reports/components/reports-analytics-client";
import { ReportDetailNav } from "@/features/reports/components/report-page-shell";
import { getReportsPageData } from "@/features/reports/report-service";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function ReportsAnalyticsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const params = searchParams ? await searchParams : undefined;
  const { filterOptions, filters, hub, productRows } = await getReportsPageData(params);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ReportDetailNav categoryKey="reportCenter" locale={locale} titleKey="reportsAnalytics" />
      <ReportsAnalyticsClient
        filterOptions={filterOptions}
        filters={filters}
        generatedAt={new Date().toISOString()}
        hub={hub}
        locale={locale}
        productRows={productRows}
      />
    </div>
  );
}
