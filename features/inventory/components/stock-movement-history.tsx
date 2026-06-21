"use client";

import { t } from "@/lib/i18n/ui";
import { useMemo, useState } from "react";
import type { StockMovement } from "@/features/inventory/types";
const movementLabels: Record<StockMovement["movementType"], string> = {
    quick_stock_in: "Quick Stock In",
    stock_in: "Stock in",
    adjustment: "Adjustment",
    count: "Count",
    transfer_in: "Transfer in",
    transfer_out: "Transfer out",
    expired: "Expired",
};
type MovementFilter = "all" | "quick_stock_in" | "adjustment" | "count" | "purchase_receive" | "transfer";
const filters: Array<{
    label: string;
    value: MovementFilter;
}> = [
    { label: "All", value: "all" },
    { label: "Quick Stock In", value: "quick_stock_in" },
    { label: "Adjustment", value: "adjustment" },
    { label: "Stock Count", value: "count" },
    { label: "Purchase Receive", value: "purchase_receive" },
    { label: "Transfer", value: "transfer" },
];
export function StockMovementHistory({ movements, }: {
    movements: StockMovement[];
}) {
    const [filter, setFilter] = useState<MovementFilter>("all");
    const filteredMovements = useMemo(() => {
        if (filter === "all")
            return movements;
        if (filter === "purchase_receive")
            return movements.filter((movement) => movement.movementType === "stock_in");
        if (filter === "transfer") {
            return movements.filter((movement) => movement.movementType === "transfer_in" || movement.movementType === "transfer_out");
        }
        return movements.filter((movement) => movement.movementType === filter);
    }, [filter, movements]);
    return (<section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="border-b border-border p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Stock movement history</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("ui.audit.trail.for.quick.stock.in.stock.changes")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {filters.map((item) => (<button className={`rounded-md border px-3 py-2 text-xs font-semibold transition ${filter === item.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:border-primary"}`} key={item.value} type="button" onClick={() => setFilter(item.value)}>
                {item.label}
              </button>))}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1320px] text-left text-sm">
          <thead className="border-b border-border bg-background text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">{t("ui.stock.in.no")}</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Unit</th>
              <th className="px-4 py-3 text-right">Entered Qty</th>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3 text-right">Before</th>
              <th className="px-4 py-3 text-right">Base Qty</th>
              <th className="px-4 py-3 text-right">After</th>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Note</th>
              <th className="px-4 py-3">By</th>
            </tr>
          </thead>
          <tbody>
            {filteredMovements.map((movement) => (<tr className="border-b border-border last:border-b-0" key={movement.id}>
                <td className="px-4 py-4 text-muted-foreground">{movement.createdAt}</td>
                <td className="px-4 py-4 font-mono text-xs">{movement.stockInNo ?? "-"}</td>
                <td className="px-4 py-4 font-semibold">{movementLabels[movement.movementType]}</td>
                <td className="px-4 py-4">{movement.productName}</td>
                <td className="px-4 py-4">{movement.unitName ?? "-"}</td>
                <td className="px-4 py-4 text-right">{movement.enteredQuantity ?? "-"}</td>
                <td className="px-4 py-4 font-mono text-xs">{movement.sku}</td>
                <td className="px-4 py-4 text-right">{movement.beforeQty}</td>
                <td className="px-4 py-4 text-right font-semibold">
                  {movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity}
                </td>
                <td className="px-4 py-4 text-right">{movement.afterQty}</td>
                <td className="px-4 py-4">{movement.supplierName ?? "-"}</td>
                <td className="px-4 py-4 capitalize">{movement.paymentStatus ?? "-"}</td>
                <td className="px-4 py-4">{movement.invoiceNo ?? "-"}</td>
                <td className="px-4 py-4 text-muted-foreground">{movement.note}</td>
                <td className="px-4 py-4">{movement.createdBy}</td>
              </tr>))}
          </tbody>
        </table>
      </div>
    </section>);
}
