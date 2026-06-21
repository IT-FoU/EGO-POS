import { t } from "@/lib/i18n/ui";
import { AlertTriangle, Boxes, CalendarClock, Warehouse } from "lucide-react";
import { DataTable, MetricCard, ReportHeader, } from "@/features/reports/components/report-primitives";
import { formatNumber } from "@/features/reports/format";
import { getReportsSnapshot } from "@/features/reports/report-service";
export default async function InventoryReportPage() {
    const { inventoryItems } = await getReportsSnapshot();
    const expiringHorizon = new Date();
    expiringHorizon.setDate(expiringHorizon.getDate() + 30);
    const expiringCutoff = expiringHorizon.toISOString().slice(0, 10);
    const lowStock = inventoryItems.filter((item) => item.quantity <= item.minStock);
    const deadStock = inventoryItems.filter((item) => item.daysWithoutSale >= 30);
    const expiringStock = inventoryItems.filter((item) => item.expiryDate && item.expiryDate <= expiringCutoff);
    const currentStock = inventoryItems.reduce((total, item) => total + item.quantity, 0);
    return (<div className="flex flex-col gap-6">
      <ReportHeader title="Inventory Report" description={t("ui.current.stock.low.stock.dead.stock.and.expir")}/>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Warehouse} label="Current Stock" value={formatNumber(currentStock)}/>
        <MetricCard icon={AlertTriangle} label="Low Stock" value={formatNumber(lowStock.length)}/>
        <MetricCard icon={Boxes} label="Dead Stock" value={formatNumber(deadStock.length)}/>
        <MetricCard icon={CalendarClock} label="Expiring Stock" value={formatNumber(expiringStock.length)}/>
      </section>
      <DataTable columns={["Product", "SKU", "Category", "Current Stock", "Min Stock", "Expiry Date", "Days Without Sale"]} rows={inventoryItems.map((item) => [
            item.productNameEn,
            item.sku,
            item.category,
            `${formatNumber(item.quantity)} ${item.baseUnit}`,
            formatNumber(item.minStock),
            item.expiryDate ?? "No expiry",
            formatNumber(item.daysWithoutSale),
        ])}/>
    </div>);
}
