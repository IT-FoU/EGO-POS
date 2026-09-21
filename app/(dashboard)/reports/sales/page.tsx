import { cookies } from "next/headers";
import { BarChart3, CircleDollarSign, ReceiptText, Scale } from "lucide-react";
import { BarChart, DataTable, MetricCard, ReportHeader } from "@/features/reports/components/report-primitives";
import { formatLak, formatNumber } from "@/features/reports/format";
import { getReportsSnapshot } from "@/features/reports/report-service";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";
import { localizeReportLabel, tReports } from "@/lib/i18n/reports-copy";

export default async function SalesReportPage() {
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const { revenueTrend, salesMetrics } = await getReportsSnapshot();
  const monthly = salesMetrics.find((metric) => metric.period === "monthly") ?? salesMetrics[0];

  return (
    <div className="flex flex-col gap-6">
      <ReportHeader
        description={tReports("salesSummary", locale)}
        descriptionKey="salesSummary"
        locale={locale}
        title={tReports("salesReport", locale)}
        titleKey="salesReport"
      />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={CircleDollarSign} label={tReports("revenue", locale)} labelKey="revenue" value={`${formatLak(monthly.revenueLak)} LAK`} />
        <MetricCard icon={BarChart3} label={tReports("profit", locale)} labelKey="profit" value={`${formatLak(monthly.profitLak)} LAK`} />
        <MetricCard icon={Scale} label={tReports("tax", locale)} labelKey="tax" value={`${formatLak(monthly.taxLak)} LAK`} />
        <MetricCard icon={ReceiptText} label={tReports("transactions", locale)} labelKey="transactions" value={formatNumber(monthly.transactions)} />
      </section>
      <section className="grid gap-6 xl:grid-cols-2">
        <BarChart
          rows={revenueTrend.map((point) => ({ label: localizeReportLabel(point.label, locale), revenue: point.revenueLak }))}
          title={tReports("revenueTrend", locale)}
          titleKey="revenueTrend"
          valueKey="revenue"
        />
        <BarChart
          rows={revenueTrend.map((point) => ({ label: localizeReportLabel(point.label, locale), sales: point.salesCount }))}
          title={tReports("salesTrend", locale)}
          titleKey="salesTrend"
          valueKey="sales"
          valueType="number"
        />
      </section>
      <DataTable
        columnKeys={["period", "revenue", "profit", "tax", "transactions"]}
        columns={[
          tReports("period", locale),
          tReports("revenue", locale),
          tReports("profit", locale),
          tReports("tax", locale),
          tReports("transactions", locale),
        ]}
        rows={salesMetrics.map((metric) => [
          localizeReportLabel(metric.label, locale),
          `${formatLak(metric.revenueLak)} LAK`,
          `${formatLak(metric.profitLak)} LAK`,
          `${formatLak(metric.taxLak)} LAK`,
          formatNumber(metric.transactions),
        ])}
      />
    </div>
  );
}
