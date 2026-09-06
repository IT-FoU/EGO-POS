"use client";

import { Fragment, useEffect, useState } from "react";
import type { InventoryItem } from "@/features/inventory/types";
import { formatQuantity } from "@/features/inventory/format";
import { InventoryImage } from "@/features/inventory/components/inventory-image";
import { ExpiryBadge, StockAlert } from "@/features/inventory/components/inventory-status";
import { localizedProductName } from "@/features/pos/product-display-name";
import { tInventory } from "@/lib/i18n/inventory-copy";
import type { SupportedLocale } from "@/lib/constants";
import { isSupportedLocale, LOCALE_CHANGE_EVENT, readClientLocale } from "@/lib/i18n/locale";

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

function itemProductName(item: InventoryItem, locale: SupportedLocale) {
    return localizedProductName({ nameEn: item.productNameEn, nameLo: item.productNameLo }, locale);
}

function itemCategoryName(item: InventoryItem, locale: SupportedLocale) {
    if (item.categoryNameEn || item.categoryNameLo) {
        return localizedProductName({ nameEn: item.categoryNameEn, nameLo: item.categoryNameLo }, locale);
    }
    return item.category;
}

export function StockOverviewTable({ items, locale: localeProp }: {
    items: InventoryItem[];
    locale?: SupportedLocale;
}) {
    const [locale, setLocale] = useState<SupportedLocale>(localeProp ?? readClientLocale());
    const t = (key: string) => tInventory(key, locale);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        if (localeProp) {
            setLocale(localeProp);
        }
    }, [localeProp]);

    useEffect(() => {
        function handleLocaleChange(event: Event) {
            const detail = (event as CustomEvent<{ locale?: SupportedLocale }>).detail;
            if (isSupportedLocale(detail?.locale)) {
                setLocale(detail.locale);
            }
        }
        window.addEventListener(LOCALE_CHANGE_EVENT, handleLocaleChange);
        return () => window.removeEventListener(LOCALE_CHANGE_EVENT, handleLocaleChange);
    }, []);

    return (<section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="border-b border-border p-5">
        <h2 className="text-lg font-semibold">{t("stockOverview")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("stockOverviewHint")}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] text-left text-sm">
          <thead className="border-b border-border bg-background text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">{t("image")}</th>
              <th className="px-4 py-3">{t("product")}</th>
              <th className="px-4 py-3">{t("barcode")}</th>
              <th className="px-4 py-3">{t("sku")}</th>
              <th className="px-4 py-3">{t("category")}</th>
              <th className="px-4 py-3">{t("supplier")}</th>
              <th className="px-4 py-3 text-right">{t("quantity")}</th>
              <th className="px-4 py-3 text-right">{t("min")}</th>
              <th className="px-4 py-3">{t("expiry")}</th>
              <th className="px-4 py-3">{t("alert")}</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-muted-foreground" colSpan={10}>{t("noInventory")}</td>
              </tr>
            ) : items.map((item) => {
            const expanded = expandedId === item.id;
            const productName = itemProductName(item, locale);
            const secondaryName = locale === "lo" ? item.productNameEn : item.productNameLo;
            return (<Fragment key={item.id}>
                  <tr className="cursor-pointer border-b border-border last:border-b-0 hover:bg-background/70" onClick={() => setExpandedId(expanded ? null : item.id)}>
                    <td className="px-4 py-4">
                      <InventoryImage imageKey={item.imageKey} label={productName}/>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-semibold">{productName}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {secondaryName}
                      </div>
                    </td>
                    <td className="px-4 py-4 font-mono text-xs">{item.barcode}</td>
                    <td className="px-4 py-4 font-mono text-xs">{item.sku}</td>
                    <td className="px-4 py-4">{itemCategoryName(item, locale)}</td>
                    <td className="px-4 py-4">
                      <div className="text-xs text-muted-foreground">{t("supplier")}</div>
                      <div className="font-semibold">{item.supplierName ?? "-"}</div>
                    </td>
                    <td className="px-4 py-4 text-right font-semibold">
                      {formatQuantity(item.quantity, item.baseUnit)}
                    </td>
                    <td className="px-4 py-4 text-right">
                      {formatQuantity(item.minStock, item.baseUnit)}
                    </td>
                    <td className="px-4 py-4">
                      <ExpiryBadge expiryDate={item.expiryDate} locale={locale}/>
                    </td>
                    <td className="px-4 py-4">
                      <StockAlert quantity={item.quantity} minStock={item.minStock} locale={locale}/>
                    </td>
                  </tr>
                  {expanded ? (<tr className="border-b border-border bg-background/60">
                      <td className="px-4 py-4" colSpan={10}>
                        <div className="rounded-md border border-border bg-card p-4">
                          <div className="font-semibold">{productName}</div>
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
