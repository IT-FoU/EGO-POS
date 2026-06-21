import { t } from "@/lib/i18n/ui";
import { BarChart3, CircleDollarSign, ReceiptText, Scale } from "lucide-react";
import { BarChart, DataTable, MetricCard, ReportHeader, } from "@/features/reports/components/report-primitives";
import { formatLak, formatNumber } from "@/features/reports/format";
import { getReportsSnapshot } from "@/features/reports/report-service";
export default async function SalesReportPage() {
    const { revenueTrend, salesMetrics } = await getReportsSnapshot();
    const monthly = salesMetrics.find((metric) => metric.period === "monthly") ?? salesMetrics[0];
    return (<div className="flex flex-col gap-6">
      <ReportHeader title="Sales Report" description={t("ui.daily.weekly.monthly.and.yearly.sales.perfor")}/>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={CircleDollarSign} label="Revenue" value={`${formatLak(monthly.revenueLak)} LAK`}/>
        <MetricCard icon={BarChart3} label="Profit" value={`${formatLak(monthly.profitLak)} LAK`}/>
        <MetricCard icon={Scale} label="Tax" value={`${formatLak(monthly.taxLak)} LAK`}/>
        <MetricCard icon={ReceiptText} label="Transactions" value={formatNumber(monthly.transactions)}/>
      </section>
      <section className="grid gap-6 xl:grid-cols-2">
        <BarChart rows={revenueTrend.map((point) => ({ label: point.label, revenue: point.revenueLak }))} title="Revenue Trend" valueKey="revenue"/>
        <BarChart rows={revenueTrend.map((point) => ({ label: point.label, sales: point.salesCount }))} title="Sales Trend" valueKey="sales" valueType="number"/>
      </section>
      <DataTable columns={["Period", "Revenue", "Profit", "Tax", "Transactions"]} rows={salesMetrics.map((metric) => [
            metric.label,
            `${formatLak(metric.revenueLak)} LAK`,
            `${formatLak(metric.profitLak)} LAK`,
            `${formatLak(metric.taxLak)} LAK`,
            formatNumber(metric.transactions),
        ])}/>
    </div>);
}
