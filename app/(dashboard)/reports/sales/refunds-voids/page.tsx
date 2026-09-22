import { RefundVoidReportView } from "@/features/reports/components/postsale-table-report";
import { getPostSaleTableLocale, getRefundVoidPageData } from "@/features/reports/postsale-table-service";

export default async function RefundVoidReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getPostSaleTableLocale();
  const params = await searchParams;
  try {
    const data = await getRefundVoidPageData(params);
    return <RefundVoidReportView data={data} locale={locale} />;
  } catch {
    return <RefundVoidReportView error="load" locale={locale} />;
  }
}
