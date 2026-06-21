import { t } from "@/lib/i18n/ui";
import { BarChart3, Package, TrendingDown, TrendingUp } from "lucide-react";
import { BarChart, DataTable, MetricCard, ReportHeader, } from "@/features/reports/components/report-primitives";
import { formatLak, formatNumber } from "@/features/reports/format";
import { getReportsSnapshot } from "@/features/reports/report-service";
export default async function ProductReportPage() {
    const { productRows } = await getReportsSnapshot();
    const topSelling = [...productRows].sort((a, b) => b.quantitySold - a.quantitySold);
    const lowSelling = [...productRows].sort((a, b) => a.quantitySold - b.quantitySold);
    const totalRevenue = productRows.reduce((total, row) => total + row.revenueLak, 0);
    const totalProfit = productRows.reduce((total, row) => total + row.profitLak, 0);
    return (<div className="flex flex-col gap-6">
      <ReportHeader title="Product Report" description={t("ui.top.selling.products.low.selling.products.pr")}/>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Package} label="Products tracked" value={formatNumber(productRows.length)}/>
        <MetricCard icon={TrendingUp} label="Top seller" value={topSelling[0]?.productName ?? "N/A"}/>
        <MetricCard icon={BarChart3} label="Product revenue" value={`${formatLak(totalRevenue)} LAK`}/>
        <MetricCard icon={TrendingDown} label="Product profit" value={`${formatLak(totalProfit)} LAK`}/>
      </section>
      <section className="grid gap-6 xl:grid-cols-2">
        <BarChart rows={topSelling.map((row) => ({ label: row.productName, qty: row.quantitySold }))} title="Top Selling Products" valueKey="qty" valueType="number"/>
        <BarChart rows={lowSelling.map((row) => ({ label: row.productName, qty: row.quantitySold }))} title="Low Selling Products" valueKey="qty" valueType="number"/>
      </section>
      <DataTable columns={["Product", "Category", "Qty Sold", "Revenue", "Profit"]} rows={productRows.map((row) => [
            row.productName,
            row.categoryName,
            formatNumber(row.quantitySold),
            `${formatLak(row.revenueLak)} LAK`,
            `${formatLak(row.profitLak)} LAK`,
        ])}/>
    </div>);
}
