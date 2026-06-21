"use client";

import { t } from "@/lib/i18n/ui";
import { Fragment, useState } from "react";
import type { InventoryItem } from "@/features/inventory/types";
import { formatQuantity } from "@/features/inventory/format";
import { InventoryImage } from "@/features/inventory/components/inventory-image";
import { ExpiryBadge, StockAlert } from "@/features/inventory/components/inventory-status";
function buildBreakdown(item: InventoryItem) {
    const units = [...(item.units ?? [])].filter((unit) => unit.conversionQty > 0 && unit.status === "active");
    const baseUnit = units.find((unit) => unit.isBaseUnit) ?? {
        conversionQty: 1,
        id: "base",
        unitName: item.baseUnit,
    };
    const sortedUnits = units
        .filter((unit) => !unit.isBaseUnit)
        .sort((a, b) => b.conversionQty - a.conversionQty);
    let remaining = item.quantity;
    const lines = sortedUnits.map((unit) => {
        const count = Math.floor(remaining / unit.conversionQty);
        remaining -= count * unit.conversionQty;
        return { count, id: unit.id, unitName: unit.unitName };
    });
    lines.push({
        count: Number(remaining.toFixed(3)),
        id: baseUnit.id,
        unitName: baseUnit.unitName,
    });
    return lines;
}
export function StockOverviewTable({ items }: {
    items: InventoryItem[];
}) {
    const [expandedId, setExpandedId] = useState<string | null>(null);
    return (<section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="border-b border-border p-5">
        <h2 className="text-lg font-semibold">Stock overview</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("ui.quantity.is.shown.by.product.base.unit.and.s")}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] text-left text-sm">
          <thead className="border-b border-border bg-background text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Image</th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Barcode</th>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3 text-right">Quantity</th>
              <th className="px-4 py-3 text-right">Min</th>
              <th className="px-4 py-3">Expiry</th>
              <th className="px-4 py-3">Alert</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
            const expanded = expandedId === item.id;
            return (<Fragment key={item.id}>
                  <tr className="cursor-pointer border-b border-border last:border-b-0 hover:bg-background/70" onClick={() => setExpandedId(expanded ? null : item.id)}>
                    <td className="px-4 py-4">
                      <InventoryImage imageKey={item.imageKey} label={item.productNameEn}/>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-semibold">{item.productNameLo}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {item.productNameEn}
                      </div>
                    </td>
                    <td className="px-4 py-4 font-mono text-xs">{item.barcode}</td>
                    <td className="px-4 py-4 font-mono text-xs">{item.sku}</td>
                    <td className="px-4 py-4">{item.category}</td>
                    <td className="px-4 py-4">
                      <div className="text-xs text-muted-foreground">{t("ui.supplier")}</div>
                      <div className="font-semibold">{item.supplierName ?? "-"}</div>
                    </td>
                    <td className="px-4 py-4 text-right font-semibold">
                      {formatQuantity(item.quantity, item.baseUnit)}
                    </td>
                    <td className="px-4 py-4 text-right">
                      {formatQuantity(item.minStock, item.baseUnit)}
                    </td>
                    <td className="px-4 py-4">
                      <ExpiryBadge expiryDate={item.expiryDate}/>
                    </td>
                    <td className="px-4 py-4">
                      <StockAlert quantity={item.quantity} minStock={item.minStock}/>
                    </td>
                  </tr>
                  {expanded ? (<tr className="border-b border-border bg-background/60">
                      <td className="px-4 py-4" colSpan={10}>
                        <div className="rounded-md border border-border bg-card p-4">
                          <div className="font-semibold">{item.productNameEn || item.productNameLo}</div>
                          <div className="mt-2 text-sm text-muted-foreground">
                            {formatQuantity(item.quantity, item.baseUnit)}
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                            <span className="font-semibold">=</span>
                            {buildBreakdown(item).map((line) => (<span className="rounded-md bg-primary/10 px-3 py-2 font-semibold text-primary" key={line.id}>
                                {line.count.toLocaleString("en-US")} {line.unitName}
                              </span>))}
                          </div>
                        </div>
                      </td>
                    </tr>) : null}
                </Fragment>);
        })}
          </tbody>
        </table>
      </div>
    </section>);
}
