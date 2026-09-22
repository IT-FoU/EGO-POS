import { ProductPerformanceReportView } from "@/features/reports/components/product-table-report";
import { getProductPerformancePageData, getProductTableLocale } from "@/features/reports/product-table-service";

export default async function ProductPerformanceReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getProductTableLocale();
  const params = await searchParams;
  try {
    const data = await getProductPerformancePageData(params);
    return <ProductPerformanceReportView data={data} locale={locale} />;
  } catch {
    return <ProductPerformanceReportView error="load" locale={locale} />;
  }
}
