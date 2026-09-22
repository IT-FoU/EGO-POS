import { CashShiftCountReportView } from "@/features/reports/components/cash-report-views";
import { getCashCountPageData, getCashReportLocale } from "@/features/reports/cash-report-service";

export default async function CashShiftCountReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getCashReportLocale();
  const params = await searchParams;
  try {
    const data = await getCashCountPageData(params);
    return <CashShiftCountReportView data={data} locale={locale} />;
  } catch {
    return <CashShiftCountReportView error="load" locale={locale} />;
  }
}
