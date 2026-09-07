import { cookies } from "next/headers";
import { CircleDollarSign, CreditCard, ReceiptText, Truck } from "lucide-react";
import { BarChart, DataTable, MetricCard, ReportHeader } from "@/features/reports/components/report-primitives";
import { formatLak, formatNumber } from "@/features/reports/format";
import { getReportsSnapshot } from "@/features/reports/report-service";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";
import { localizeReportLabel, tReports } from "@/lib/i18n/reports-copy";

export default async function PurchasingReportPage() {
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const { purchaseTrend, supplierPayables, supplierPurchaseOrders, suppliers } = await getReportsSnapshot();
  const payableBySupplier = new Map(supplierPayables.map((row) => [row.supplierId, row.payableBalanceLak]));
  const purchasesBySupplier = suppliers.map((supplier) => {
    const orders = supplierPurchaseOrders.filter((order) => order.supplierId === supplier.id);
    const payableBalance = payableBySupplier.get(supplier.id) ?? supplier.outstandingBalanceLak;
    return {
      orderCount: orders.length,
      outstandingLak: payableBalance,
      supplierName: supplier.companyName,
      totalLak: orders.reduce((total, order) => total + order.totalLak, 0),
    };
  });
  const totalPurchases = purchasesBySupplier.reduce((total, row) => total + row.totalLak, 0);
  const outstandingPayables = supplierPayables.reduce((total, row) => total + row.payableBalanceLak, 0);
  const totalOrders = supplierPurchaseOrders.length;

  return (
    <div className="flex flex-col gap-6">
      <ReportHeader
        description={tReports("purchasingReports", locale)}
        locale={locale}
        title={tReports("purchasingReport", locale)}
      />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Truck} label={tReports("suppliers", locale)} value={formatNumber(suppliers.length)} />
        <MetricCard icon={ReceiptText} label={tReports("purchaseOrders", locale)} value={formatNumber(totalOrders)} />
        <MetricCard icon={CircleDollarSign} label={tReports("purchaseValue", locale)} value={`${formatLak(totalPurchases)} LAK`} />
        <MetricCard icon={CreditCard} label={tReports("outstandingPayables", locale)} value={`${formatLak(outstandingPayables)} LAK`} />
      </section>
      <section className="grid gap-6 xl:grid-cols-2">
        <BarChart
          rows={purchasesBySupplier.map((row) => ({ label: row.supplierName, value: row.totalLak }))}
          title={tReports("purchasesBySupplier", locale)}
          valueKey="value"
        />
        <BarChart
          rows={purchaseTrend.map((point) => ({ label: localizeReportLabel(point.label, locale), value: point.purchaseValueLak }))}
          title={tReports("purchaseTrends", locale)}
          valueKey="value"
        />
      </section>
      <DataTable
        columns={[
          tReports("supplier", locale),
          tReports("orders", locale),
          tReports("purchaseValue", locale),
          tReports("outstandingPayables", locale),
        ]}
        rows={purchasesBySupplier.map((row) => [
          row.supplierName,
          formatNumber(row.orderCount),
          `${formatLak(row.totalLak)} LAK`,
          `${formatLak(row.outstandingLak)} LAK`,
        ])}
      />
    </div>
  );
}
