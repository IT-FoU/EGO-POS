import { ShiftSummaryReportView } from "@/features/reports/components/shift-table-report";
import { getShiftSummaryPageData, getShiftTableLocale } from "@/features/reports/shift-table-service";

export default async function ShiftSummaryReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getShiftTableLocale();
  const params = await searchParams;
  try {
    const data = await getShiftSummaryPageData(params);
    return <ShiftSummaryReportView data={data} locale={locale} />;
  } catch {
    return <ShiftSummaryReportView error="load" locale={locale} />;
  }
}
