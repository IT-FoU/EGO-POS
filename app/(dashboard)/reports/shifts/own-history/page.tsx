import { OwnShiftHistoryReportView } from "@/features/reports/components/shift-table-report";
import { getOwnShiftHistoryPageData, getShiftTableLocale } from "@/features/reports/shift-table-service";

export default async function OwnShiftHistoryReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getShiftTableLocale();
  const params = await searchParams;
  try {
    const data = await getOwnShiftHistoryPageData(params);
    return <OwnShiftHistoryReportView data={data} locale={locale} />;
  } catch {
    return <OwnShiftHistoryReportView error="load" locale={locale} />;
  }
}
