import { LowStockReportView } from "@/features/reports/components/inventory-table-report";
import { getInventoryTableLocale, getLowStockPageData } from "@/features/reports/inventory-table-service";

export default async function LowStockReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getInventoryTableLocale();
  const params = await searchParams;
  try {
    const data = await getLowStockPageData(params);
    return <LowStockReportView data={data} locale={locale} />;
  } catch {
    return <LowStockReportView error="load" locale={locale} />;
  }
}
