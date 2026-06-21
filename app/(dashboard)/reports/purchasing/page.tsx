import { t } from "@/lib/i18n/ui";
import { CircleDollarSign, CreditCard, ReceiptText, Truck } from "lucide-react";
import { BarChart, DataTable, MetricCard, ReportHeader, } from "@/features/reports/components/report-primitives";
import { formatLak, formatNumber } from "@/features/reports/format";
import { getReportsSnapshot } from "@/features/reports/report-service";
export default async function PurchasingReportPage() {
    const { purchaseTrend, supplierPurchaseOrders, suppliers } = await getReportsSnapshot();
    const purchasesBySupplier = suppliers.map((supplier) => {
        const orders = supplierPurchaseOrders.filter((order) => order.supplierId === supplier.id);
        return {
            orderCount: orders.length,
            outstandingLak: supplier.outstandingBalanceLak,
            supplierName: supplier.companyName,
            totalLak: orders.reduce((total, order) => total + order.totalLak, 0),
        };
    });
    const totalPurchases = purchasesBySupplier.reduce((total, row) => total + row.totalLak, 0);
    const outstandingPayables = suppliers.reduce((total, supplier) => total + supplier.outstandingBalanceLak, 0);
    const totalOrders = supplierPurchaseOrders.length;
    return (<div className="flex flex-col gap-6">
      <ReportHeader title="Purchasing Report" description={t("ui.purchases.by.supplier.outstanding.payables.a")}/>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Truck} label="Suppliers" value={formatNumber(suppliers.length)}/>
        <MetricCard icon={ReceiptText} label="Purchase Orders" value={formatNumber(totalOrders)}/>
        <MetricCard icon={CircleDollarSign} label="Purchase Value" value={`${formatLak(totalPurchases)} LAK`}/>
        <MetricCard icon={CreditCard} label="Outstanding Payables" value={`${formatLak(outstandingPayables)} LAK`}/>
      </section>
      <section className="grid gap-6 xl:grid-cols-2">
        <BarChart rows={purchasesBySupplier.map((row) => ({ label: row.supplierName, value: row.totalLak }))} title="Purchases by Supplier" valueKey="value"/>
        <BarChart rows={purchaseTrend.map((point) => ({ label: point.label, value: point.purchaseValueLak }))} title="Purchase Trends" valueKey="value"/>
      </section>
      <DataTable columns={["Supplier", "Orders", "Purchase Value", "Outstanding Payables"]} rows={purchasesBySupplier.map((row) => [
            row.supplierName,
            formatNumber(row.orderCount),
            `${formatLak(row.totalLak)} LAK`,
            `${formatLak(row.outstandingLak)} LAK`,
        ])}/>
    </div>);
}
