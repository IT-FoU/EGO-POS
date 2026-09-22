import { StockOnHandReportView } from "@/features/reports/components/inventory-table-report";
import { getInventoryTableLocale, getStockOnHandPageData } from "@/features/reports/inventory-table-service";

export default async function StockOnHandReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getInventoryTableLocale();
  const params = await searchParams;
  try {
    const data = await getStockOnHandPageData(params);
    return <StockOnHandReportView data={data} locale={locale} />;
  } catch {
    return <StockOnHandReportView error="load" locale={locale} />;
  }
}
