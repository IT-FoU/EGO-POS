import { ProductSalesReportView } from "@/features/reports/components/product-table-report";
import { getProductSalesPageData, getProductTableLocale } from "@/features/reports/product-table-service";

export default async function ProductSalesReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getProductTableLocale();
  const params = await searchParams;
  try {
    const data = await getProductSalesPageData(params);
    return <ProductSalesReportView data={data} locale={locale} />;
  } catch {
    return <ProductSalesReportView error="load" locale={locale} />;
  }
}
