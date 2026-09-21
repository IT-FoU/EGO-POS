import { DailySalesReportView } from "@/features/reports/components/sales-table-report";
import { getDailySalesTablePageData, getSalesTableLocale } from "@/features/reports/sales-table-service";

export default async function DailySalesReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getSalesTableLocale();
  const params = await searchParams;
  try {
    const data = await getDailySalesTablePageData(params);
    return <DailySalesReportView data={data} locale={locale} />;
  } catch {
    return <DailySalesReportView error="load" locale={locale} />;
  }
}
