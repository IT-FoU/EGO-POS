import { ReportsAnalyticsClient } from "@/features/reports/components/reports-analytics-client";
import { getReportsPageData } from "@/features/reports/report-service";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const { filterOptions, filters, hub, productRows } = await getReportsPageData(params);
  return (
    <ReportsAnalyticsClient
      filterOptions={filterOptions}
      filters={filters}
      hub={hub}
      productRows={productRows}
    />
  );
}
