import { cookies } from "next/headers";
import Link from "next/link";
import { ReportsAnalyticsClient } from "@/features/reports/components/reports-analytics-client";
import { getReportsPageData } from "@/features/reports/report-service";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";
import { tReports } from "@/lib/i18n/reports-copy";

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
      <Link className="w-fit text-sm font-medium text-primary hover:underline" href="/reports">
        {tReports("backToReports", locale)}
      </Link>
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
