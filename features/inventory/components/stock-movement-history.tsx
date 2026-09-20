"use client";

import { useMemo, useState } from "react";
import type { StockMovement } from "@/features/inventory/types";
import { localizedProductName } from "@/features/pos/product-display-name";
import { inventoryMovementLabel, inventoryPaymentLabel, tInventory } from "@/lib/i18n/inventory-copy";
import type { SupportedLocale } from "@/lib/constants";
import { useAppLocale } from "@/lib/i18n/use-app-locale";

type MovementFilter = "all" | "quick_stock_in" | "adjustment" | "count" | "purchase_receive" | "sale" | "return" | "transfer";

function movementProductName(movement: StockMovement, locale: SupportedLocale) {
    if (movement.productNameEn || movement.productNameLo) {
        return localizedProductName({ nameEn: movement.productNameEn, nameLo: movement.productNameLo }, locale);
    }
    return movement.productName;
}

export function StockMovementHistory({ movements, locale: localeProp }: {
    movements: StockMovement[];
    locale?: SupportedLocale;
}) {
    const locale = useAppLocale(localeProp);
    const t = (key: string) => tInventory(key, locale);
    const [filter, setFilter] = useState<MovementFilter>("all");

    const filters: Array<{ label: string; value: MovementFilter }> = [
        { label: t("all"), value: "all" },
        { label: t("quickStockIn"), value: "quick_stock_in" },
        { label: t("adjustment"), value: "adjustment" },
        { label: t("stockCount"), value: "count" },
        { label: t("filterPurchaseReceive"), value: "purchase_receive" },
        { label: inventoryMovementLabel("sale", locale), value: "sale" },
        { label: inventoryMovementLabel("return", locale), value: "return" },
        { label: t("transfer"), value: "transfer" },
    ];

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
            <h2 className="text-lg font-semibold">{t("stockMovementHistory")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("movementHistoryHint")}</p>
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
              <th className="px-4 py-3">{t("time")}</th>
              <th className="px-4 py-3">{t("stockInNo")}</th>
              <th className="px-4 py-3">{t("type")}</th>
              <th className="px-4 py-3">{t("product")}</th>
              <th className="px-4 py-3">{t("unit")}</th>
              <th className="px-4 py-3 text-right">{t("enteredQty")}</th>
              <th className="px-4 py-3">{t("sku")}</th>
              <th className="px-4 py-3 text-right">{t("before")}</th>
              <th className="px-4 py-3 text-right">{t("baseQty")}</th>
              <th className="px-4 py-3 text-right">{t("after")}</th>
              <th className="px-4 py-3">{t("supplier")}</th>
              <th className="px-4 py-3">{t("payment")}</th>
              <th className="px-4 py-3">{t("invoice")}</th>
              <th className="px-4 py-3">{t("note")}</th>
              <th className="px-4 py-3">{t("by")}</th>
            </tr>
          </thead>
          <tbody>
            {filteredMovements.length === 0 ? (
              <tr className="border-b border-border last:border-b-0">
                <td className="px-4 py-4 text-muted-foreground" colSpan={15}>{t("noMovements")}</td>
              </tr>
            ) : filteredMovements.map((movement) => (<tr className="border-b border-border last:border-b-0" key={movement.id}>
                <td className="px-4 py-4 text-muted-foreground">{movement.createdAt}</td>
                <td className="px-4 py-4 font-mono text-xs">{movement.stockInNo ?? "-"}</td>
                <td className="px-4 py-4 font-semibold">{inventoryMovementLabel(movement.movementType, locale)}</td>
                <td className="px-4 py-4">{movementProductName(movement, locale)}</td>
                <td className="px-4 py-4">{movement.unitName ?? "-"}</td>
                <td className="px-4 py-4 text-right">{movement.enteredQuantity ?? "-"}</td>
                <td className="px-4 py-4 font-mono text-xs">{movement.sku}</td>
                <td className="px-4 py-4 text-right">{movement.beforeQty}</td>
                <td className="px-4 py-4 text-right font-semibold">
                  {movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity}
                </td>
                <td className="px-4 py-4 text-right">{movement.afterQty}</td>
                <td className="px-4 py-4">{movement.supplierName ?? "-"}</td>
                <td className="px-4 py-4 capitalize">{inventoryPaymentLabel(movement.paymentStatus, locale)}</td>
                <td className="px-4 py-4">{movement.invoiceNo ?? "-"}</td>
                <td className="px-4 py-4 text-muted-foreground">{movement.note}</td>
                <td className="px-4 py-4">{movement.createdBy}</td>
              </tr>))}
          </tbody>
        </table>
      </div>
    </section>);
}
