import { PaymentMethodSalesReportView } from "@/features/reports/components/sales-table-report";
import { getPaymentMethodSalesTablePageData, getSalesTableLocale } from "@/features/reports/sales-table-service";

export default async function PaymentMethodSalesReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getSalesTableLocale();
  const params = await searchParams;
  try {
    const data = await getPaymentMethodSalesTablePageData(params);
    return <PaymentMethodSalesReportView data={data} locale={locale} />;
  } catch {
    return <PaymentMethodSalesReportView error="load" locale={locale} />;
  }
}
