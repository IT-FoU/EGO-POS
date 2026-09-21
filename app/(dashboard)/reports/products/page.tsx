import { cookies } from "next/headers";
import { BarChart3, Package, TrendingDown, TrendingUp } from "lucide-react";
import { ReportMetricCard } from "@/features/reports/components/report-metric-card";
import { ReportDetailNav } from "@/features/reports/components/report-page-shell";
import { BarChart, DataTable, ReportHeader } from "@/features/reports/components/report-primitives";
import { formatLak, formatNumber } from "@/features/reports/format";
import { getReportsSnapshot } from "@/features/reports/report-service";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";
import { localizeReportLabel, tReports } from "@/lib/i18n/reports-copy";

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
      <ReportDetailNav categoryKey="productReports" locale={locale} titleKey="productReport" />
      <ReportHeader
        description={tReports("productReports", locale)}
        descriptionKey="productReports"
        locale={locale}
        title={tReports("productReport", locale)}
        titleKey="productReport"
      />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ReportMetricCard icon={Package} label={tReports("productsTracked", locale)} labelKey="productsTracked" value={formatNumber(productRows.length)} />
        <ReportMetricCard icon={TrendingUp} label={tReports("topSeller", locale)} labelKey="topSeller" value={topSelling[0]?.productName ?? tReports("na", locale)} />
        <ReportMetricCard icon={BarChart3} label={tReports("productRevenue", locale)} labelKey="productRevenue" value={`${formatLak(totalRevenue)} LAK`} />
        <ReportMetricCard icon={TrendingDown} label={tReports("productProfit", locale)} labelKey="productProfit" value={`${formatLak(totalProfit)} LAK`} />
      </section>
      <section className="grid gap-6 xl:grid-cols-2">
        <BarChart
          rows={topSelling.map((row) => ({ label: row.productName, qty: row.quantitySold }))}
          title={tReports("topSellingProducts", locale)}
          titleKey="topSellingProducts"
          valueKey="qty"
          valueType="number"
        />
        <BarChart
          rows={lowSelling.map((row) => ({ label: row.productName, qty: row.quantitySold }))}
          title={tReports("lowSellingProducts", locale)}
          titleKey="lowSellingProducts"
          valueKey="qty"
          valueType="number"
        />
      </section>
      <DataTable
        columnKeys={["product", "category", "qtySold", "revenue", "profit"]}
        columns={[
          tReports("product", locale),
          tReports("category", locale),
          tReports("qtySold", locale),
          tReports("revenue", locale),
          tReports("profit", locale),
        ]}
        rows={productRows.map((row) => [
          row.productName,
          localizeReportLabel(row.categoryName, locale),
          formatNumber(row.quantitySold),
          `${formatLak(row.revenueLak)} LAK`,
          `${formatLak(row.profitLak)} LAK`,
        ])}
      />
    </div>
  );
}
