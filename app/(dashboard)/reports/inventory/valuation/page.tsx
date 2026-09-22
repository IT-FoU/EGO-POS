import { StockValuationReportView } from "@/features/reports/components/inventory-table-report";
import { getMovementTableLocale, getStockValuationPageData } from "@/features/reports/movement-table-service";

export default async function StockValuationReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getMovementTableLocale();
  const params = await searchParams;
  try {
    const data = await getStockValuationPageData(params);
    return <StockValuationReportView data={data} locale={locale} />;
  } catch {
    return <StockValuationReportView error="load" locale={locale} />;
  }
}
