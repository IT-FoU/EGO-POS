import { cookies } from "next/headers";
import { AlertTriangle, Boxes, CalendarClock, Warehouse } from "lucide-react";
import { DataTable, MetricCard, ReportHeader } from "@/features/reports/components/report-primitives";
import { formatNumber } from "@/features/reports/format";
import { getReportsSnapshot } from "@/features/reports/report-service";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";
import { localizeReportLabel, tReports } from "@/lib/i18n/reports-copy";

export default async function InventoryReportView() {
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const { inventoryItems } = await getReportsSnapshot();
  const expiringHorizon = new Date();
  expiringHorizon.setDate(expiringHorizon.getDate() + 30);
  const expiringCutoff = expiringHorizon.toISOString().slice(0, 10);
  const lowStock = inventoryItems.filter((item) => item.quantity <= item.minStock);
  const deadStock = inventoryItems.filter((item) => item.daysWithoutSale >= 30);
  const expiringStock = inventoryItems.filter((item) => item.expiryDate && item.expiryDate <= expiringCutoff);
  const currentStock = inventoryItems.reduce((total, item) => total + item.quantity, 0);

  return (
    <div className="flex flex-col gap-6">
      <ReportHeader
        description={tReports("inventoryReports", locale)}
        descriptionKey="inventoryReports"
        locale={locale}
        title={tReports("inventoryReport", locale)}
        titleKey="inventoryReport"
      />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Warehouse} label={tReports("currentStock", locale)} labelKey="currentStock" value={formatNumber(currentStock)} />
        <MetricCard icon={AlertTriangle} label={tReports("lowStock", locale)} labelKey="lowStock" value={formatNumber(lowStock.length)} />
        <MetricCard icon={Boxes} label={tReports("deadStock", locale)} labelKey="deadStock" value={formatNumber(deadStock.length)} />
        <MetricCard icon={CalendarClock} label={tReports("expiringSoon", locale)} labelKey="expiringSoon" value={formatNumber(expiringStock.length)} />
      </section>
      <DataTable
        columnKeys={["product", "sku", "category", "currentStock", "minStock", "expiryDate", "daysWithoutSale"]}
        columns={[
          tReports("product", locale),
          tReports("sku", locale),
          tReports("category", locale),
          tReports("currentStock", locale),
          tReports("minStock", locale),
          tReports("expiryDate", locale),
          tReports("daysWithoutSale", locale),
        ]}
        rows={inventoryItems.map((item) => [
          item.productNameEn,
          item.sku,
          localizeReportLabel(item.category, locale),
          `${formatNumber(item.quantity)} ${item.baseUnit}`,
          formatNumber(item.minStock),
          item.expiryDate ?? tReports("noExpiry", locale),
          formatNumber(item.daysWithoutSale),
        ])}
      />
    </div>
  );
}
