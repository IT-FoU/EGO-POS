"use client";

import { t } from "@/lib/i18n/ui";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, PackagePlus, ReceiptText, SlidersHorizontal, Truck, } from "lucide-react";
import type { InventoryItem, StockMovement, Warehouse } from "@/features/inventory/types";
import { InventoryDashboardCards, InventoryInsightPanel, type InventoryDashboardPanel, type InventoryStockFilter, } from "@/features/inventory/components/inventory-dashboard-cards";
import { InventoryAlertLists } from "@/features/inventory/components/inventory-alert-lists";
import { StockMovementHistory } from "@/features/inventory/components/stock-movement-history";
import { StockOverviewTable } from "@/features/inventory/components/stock-overview-table";
import { WarehouseSelector } from "@/features/inventory/components/warehouse-selector";
import { DemoStorageKeys } from "@/lib/demo/storage-keys";
import { readStringFromStorage } from "@/lib/demo/storage";
export function InventoryPageClient({ items, movements, warehouses, }: {
    items: InventoryItem[];
    movements: StockMovement[];
    warehouses: Warehouse[];
}) {
    const [selectedWarehouseId, setSelectedWarehouseId] = useState("all");
    const [locale, setLocale] = useState<"en" | "lo">("en");
    const [activePanel, setActivePanel] = useState<InventoryDashboardPanel>(null);
    const [stockFilter, setStockFilter] = useState<InventoryStockFilter>("all");
    useEffect(() => {
        const readLocale = () => {
            const storedLocale = readStringFromStorage(DemoStorageKeys.locale);
            setLocale(storedLocale === "lo" ? "lo" : "en");
        };
        readLocale();
        window.addEventListener("storage", readLocale);
        return () => window.removeEventListener("storage", readLocale);
    }, []);
    const filteredItems = useMemo(() => selectedWarehouseId === "all"
        ? items
        : items.filter((item) => item.warehouseId === selectedWarehouseId), [items, selectedWarehouseId]);
    const filteredMovements = useMemo(() => selectedWarehouseId === "all"
        ? movements
        : movements.filter((movement) => movement.warehouseId === selectedWarehouseId), [movements, selectedWarehouseId]);
    const todaysQuickStockIn = useMemo(() => {
        const today = new Date().toISOString().slice(0, 10);
        return filteredMovements.filter((movement) => movement.movementType === "quick_stock_in" && movement.createdAt.startsWith(today));
    }, [filteredMovements]);
    const itemByProductId = useMemo(() => new Map(filteredItems.map((item) => [item.productId, item])), [filteredItems]);
    const visibleItems = useMemo(() => {
        if (stockFilter === "out_of_stock") {
            return filteredItems.filter((item) => item.quantity <= 0);
        }
        if (stockFilter === "low_stock") {
            return filteredItems.filter((item) => item.quantity > 0 && item.quantity <= item.minStock);
        }
        if (stockFilter === "near_expiry") {
            return filteredItems.filter((item) => {
                if (!item.expiryDate)
                    return false;
                const days = Math.ceil((new Date(item.expiryDate).getTime() - Date.now()) / 86400000);
                return days <= 30;
            });
        }
        if (stockFilter === "dead_stock") {
            return filteredItems.filter((item) => item.daysWithoutSale >= 30);
        }
        if (stockFilter === "fast_moving") {
            return filteredItems.filter((item) => (item.unitsSold30Days ?? 0) > 0 || item.daysWithoutSale <= 7);
        }
        return filteredItems;
    }, [filteredItems, stockFilter]);
    return (<div className="flex flex-col gap-6">
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">
              {locale === "lo" ? "ຈັດການສາງ" : "Inventory Management"}
            </p>
            <h1 className="mt-2 text-3xl font-semibold">
              {locale === "lo" ? "ສາງສິນຄ້າ" : "Inventory"}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{t("ui.multi.warehouse.stock.overview.with.low.stoc")}</p>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <WarehouseSelector selectedWarehouseId={selectedWarehouseId} warehouses={warehouses} onChange={setSelectedWarehouseId}/>
            <div className="flex gap-2">
              <Link className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90" href="/inventory/quick-stock-in">
                <PackagePlus aria-hidden="true"/>
                Quick Stock In
              </Link>
              <Link className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-border px-5 text-sm font-semibold transition hover:border-primary" href="/inventory/count">
                <ClipboardCheck aria-hidden="true"/>
                Count
              </Link>
            </div>
          </div>
        </div>
      </section>

      <InventoryDashboardCards activePanel={activePanel} items={filteredItems} movements={filteredMovements} onFilterChange={setStockFilter} onPanelChange={setActivePanel}/>

      <InventoryInsightPanel activePanel={activePanel} items={filteredItems} onFilterChange={setStockFilter}/>

      <nav className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Link className="inline-flex min-h-16 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90" href="/inventory/quick-stock-in">
          <PackagePlus aria-hidden="true"/>
          Quick Stock In
        </Link>
        <Link className="inline-flex min-h-16 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold hover:border-primary" href="/inventory/count">
          <ClipboardCheck aria-hidden="true"/>
          Stock Count
        </Link>
        <Link className="inline-flex min-h-16 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold hover:border-primary" href="/inventory/adjustment">
          <SlidersHorizontal aria-hidden="true"/>
          Adjustment
        </Link>
        <Link className="inline-flex min-h-16 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold hover:border-primary" href="/purchasing/new">
          <ReceiptText aria-hidden="true"/>
          Purchase Order
        </Link>
        <Link className="inline-flex min-h-16 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold hover:border-primary" href="/purchasing/receiving">
          <Truck aria-hidden="true"/>
          Goods Receiving
        </Link>
      </nav>

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t("ui.today.apos.s.stock.in")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("ui.recent.quick.stock.in.movements.for.the.sele")}</p>
          </div>
          <div className="text-2xl font-semibold text-primary">{todaysQuickStockIn.length}</div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {todaysQuickStockIn.length === 0 ? (<div className="rounded-md border border-border bg-background p-4 text-sm text-muted-foreground">{t("ui.no.quick.stock.in.entries.today")}</div>) : (todaysQuickStockIn.slice(0, 6).map((movement) => {
            const item = movement.productId ? itemByProductId.get(movement.productId) : undefined;
            return (<button className="rounded-md border border-border bg-background p-4 text-left text-sm hover:border-primary" key={movement.id} type="button" onClick={() => setStockFilter("all")}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs text-muted-foreground">{movement.createdAt.slice(11)}</span>
                    <span className="font-mono text-xs text-primary">{movement.stockInNo}</span>
                  </div>
                  <div className="mt-2 font-semibold">{movement.productName}</div>
                  <div className="mt-1 text-muted-foreground">
                    {movement.enteredQuantity ?? movement.quantity} {movement.unitName ?? ""} / {movement.quantity} {item?.baseUnit ?? "base units"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{movement.supplierName ?? "No supplier"}</div>
                </button>);
        }))}
        </div>
      </section>

      {stockFilter !== "all" ? (<div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm font-semibold text-primary">
          Stock overview filter: {stockFilter.replaceAll("_", " ")}
          <button className="ml-3 underline" type="button" onClick={() => setStockFilter("all")}>
            View all
          </button>
        </div>) : null}

      <StockOverviewTable items={visibleItems}/>
      <InventoryAlertLists items={filteredItems}/>
      <StockMovementHistory movements={filteredMovements}/>
    </div>);
}
