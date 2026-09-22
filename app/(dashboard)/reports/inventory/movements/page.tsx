import { StockMovementReportView } from "@/features/reports/components/movement-table-report";
import { getMovementTableLocale, getStockMovementPageData } from "@/features/reports/movement-table-service";

export default async function StockMovementReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getMovementTableLocale();
  const params = await searchParams;
  try {
    const data = await getStockMovementPageData(params);
    return <StockMovementReportView data={data} locale={locale} />;
  } catch {
    return <StockMovementReportView error="load" locale={locale} />;
  }
}
