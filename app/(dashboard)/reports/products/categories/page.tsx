import { CategorySalesReportView } from "@/features/reports/components/product-table-report";
import { getCategorySalesPageData, getProductTableLocale } from "@/features/reports/product-table-service";

export default async function CategorySalesReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getProductTableLocale();
  const params = await searchParams;
  try {
    const data = await getCategorySalesPageData(params);
    return <CategorySalesReportView data={data} locale={locale} />;
  } catch {
    return <CategorySalesReportView error="load" locale={locale} />;
  }
}
