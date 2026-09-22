import { ReorderReportView } from "@/features/reports/components/reorder-report-views";
import { getReorderPageData, getReorderReportLocale } from "@/features/reports/reorder-report-service";

export default async function ReorderReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getReorderReportLocale();
  const params = await searchParams;
  try {
    const data = await getReorderPageData(params);
    return <ReorderReportView data={data} locale={locale} />;
  } catch {
    return <ReorderReportView error="load" locale={locale} />;
  }
}
