import { CashMovementReportView } from "@/features/reports/components/cash-report-views";
import { getCashMovementPageData, getCashReportLocale } from "@/features/reports/cash-report-service";

export default async function CashMovementReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getCashReportLocale();
  const params = await searchParams;
  try {
    const data = await getCashMovementPageData(params);
    return <CashMovementReportView data={data} locale={locale} />;
  } catch {
    return <CashMovementReportView error="load" locale={locale} />;
  }
}
