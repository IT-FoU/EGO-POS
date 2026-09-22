import { ReceiptSalesReportView } from "@/features/reports/components/postsale-table-report";
import { getPostSaleTableLocale, getReceiptSalesPageData } from "@/features/reports/postsale-table-service";

export default async function ReceiptSalesReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getPostSaleTableLocale();
  const params = await searchParams;
  try {
    const data = await getReceiptSalesPageData(params);
    return <ReceiptSalesReportView data={data} locale={locale} />;
  } catch {
    return <ReceiptSalesReportView error="load" locale={locale} />;
  }
}
