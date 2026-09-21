import { MonthlySalesReportView } from "@/features/reports/components/sales-table-report";
import { getMonthlySalesTablePageData, getSalesTableLocale } from "@/features/reports/sales-table-service";

export default async function MonthlySalesReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getSalesTableLocale();
  const params = await searchParams;
  try {
    const data = await getMonthlySalesTablePageData(params);
    return <MonthlySalesReportView data={data} locale={locale} />;
  } catch {
    return <MonthlySalesReportView error="load" locale={locale} />;
  }
}
