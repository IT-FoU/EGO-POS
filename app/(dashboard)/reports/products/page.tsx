import { cookies } from "next/headers";
import { BarChart3, Package, TrendingDown, TrendingUp } from "lucide-react";
import { BarChart, DataTable, MetricCard, ReportHeader } from "@/features/reports/components/report-primitives";
import { formatLak, formatNumber } from "@/features/reports/format";
import { getReportsSnapshot } from "@/features/reports/report-service";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";
import { tReports } from "@/lib/i18n/reports-copy";

export default async function ProductReportPage() {
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const { productRows } = await getReportsSnapshot();
  const topSelling = [...productRows].sort((a, b) => b.quantitySold - a.quantitySold);
  const lowSelling = [...productRows].sort((a, b) => a.quantitySold - b.quantitySold);
  const totalRevenue = productRows.reduce((total, row) => total + row.revenueLak, 0);
  const totalProfit = productRows.reduce((total, row) => total + row.profitLak, 0);

  return (
    <div className="flex flex-col gap-6">
      <ReportHeader
        description={tReports("productReports", locale)}
        locale={locale}
        title={tReports("productReport", locale)}
      />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Package} label={tReports("productsTracked", locale)} value={formatNumber(productRows.length)} />
        <MetricCard icon={TrendingUp} label={tReports("topSeller", locale)} value={topSelling[0]?.productName ?? tReports("na", locale)} />
        <MetricCard icon={BarChart3} label={tReports("productRevenue", locale)} value={`${formatLak(totalRevenue)} LAK`} />
        <MetricCard icon={TrendingDown} label={tReports("productProfit", locale)} value={`${formatLak(totalProfit)} LAK`} />
      </section>
      <section className="grid gap-6 xl:grid-cols-2">
        <BarChart
          rows={topSelling.map((row) => ({ label: row.productName, qty: row.quantitySold }))}
          title={tReports("topSellingProducts", locale)}
          valueKey="qty"
          valueType="number"
        />
        <BarChart
          rows={lowSelling.map((row) => ({ label: row.productName, qty: row.quantitySold }))}
          title={tReports("lowSellingProducts", locale)}
          valueKey="qty"
          valueType="number"
        />
      </section>
      <DataTable
        columns={[
          tReports("product", locale),
          tReports("category", locale),
          tReports("qtySold", locale),
          tReports("revenue", locale),
          tReports("profit", locale),
        ]}
        rows={productRows.map((row) => [
          row.productName,
          row.categoryName,
          formatNumber(row.quantitySold),
          `${formatLak(row.revenueLak)} LAK`,
          `${formatLak(row.profitLak)} LAK`,
        ])}
      />
    </div>
  );
}
