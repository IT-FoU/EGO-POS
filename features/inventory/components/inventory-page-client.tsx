"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ClipboardCheck, PackagePlus, ReceiptText, SlidersHorizontal, Truck, } from "lucide-react";
import type { InventoryItem, StockMovement, Warehouse } from "@/features/inventory/types";
import type { InventoryListPage } from "@/features/inventory/list-query";
import { loadInventoryListAction } from "@/features/inventory/actions";
import { InventoryDashboardCards, InventoryInsightPanel, type InventoryDashboardPanel, type InventoryStockFilter, } from "@/features/inventory/components/inventory-dashboard-cards";
import { InventoryAlertLists } from "@/features/inventory/components/inventory-alert-lists";
import { StockMovementHistory } from "@/features/inventory/components/stock-movement-history";
import { StockOverviewTable } from "@/features/inventory/components/stock-overview-table";
import { WarehouseSelector } from "@/features/inventory/components/warehouse-selector";
import { localizedProductName } from "@/features/pos/product-display-name";
import { fillInventoryCopy, inventoryStockFilterLabel, tInventory } from "@/lib/i18n/inventory-copy";
import type { SupportedLocale } from "@/lib/constants";
import { useAppLocale } from "@/lib/i18n/use-app-locale";

function movementProductName(movement: StockMovement, locale: SupportedLocale) {
    if (movement.productNameEn || movement.productNameLo) {
        return localizedProductName({ nameEn: movement.productNameEn, nameLo: movement.productNameLo }, locale);
    }
    return movement.productName;
}

export function InventoryPageClient({ items: initialItems, movements: initialMovements, warehouses, listPage: initialListPage, locale: localeProp, }: {
    items: InventoryItem[];
    movements: StockMovement[];
    warehouses: Warehouse[];
    listPage?: InventoryListPage;
    locale?: SupportedLocale;
}) {
    const [selectedWarehouseId, setSelectedWarehouseId] = useState("all");
    const locale = useAppLocale(localeProp);
    const t = (key: string) => tInventory(key, locale);
    const [activePanel, setActivePanel] = useState<InventoryDashboardPanel>(null);
    const [stockFilter, setStockFilter] = useState<InventoryStockFilter>("all");
    const [page, setPage] = useState(initialListPage?.page ?? 1);
    const [pageSize, setPageSize] = useState(initialListPage?.pageSize ?? 100);
    const [items, setItems] = useState(initialItems);
    const [movements, setMovements] = useState(initialMovements);
    const [listPage, setListPage] = useState(initialListPage);
    const [, startTransition] = useTransition();
    const skipFetch = useRef(true);

    useEffect(() => {
        setItems(initialItems);
        setMovements(initialMovements);
        setListPage(initialListPage);
    }, [initialItems, initialListPage, initialMovements]);
    useEffect(() => {
        if (!initialListPage) return;
        if (skipFetch.current) {
            skipFetch.current = false;
            return;
        }
        startTransition(async () => {
            const result = await loadInventoryListAction({
                page,
                pageSize,
                stockFilter,
                warehouseId: selectedWarehouseId,
            });
            if (!result.ok || !result.data) return;
            const next = result.data as InventoryListPage;
            setListPage(next);
            setItems(next.items);
            setMovements(next.movements);
        });
    }, [initialListPage, page, pageSize, selectedWarehouseId, stockFilter]);
    const filteredItems = listPage ? items : (selectedWarehouseId === "all"
        ? items
        : items.filter((item) => item.warehouseId === selectedWarehouseId));
    const filteredMovements = useMemo(() => selectedWarehouseId === "all"
        ? movements
        : movements.filter((movement) => movement.warehouseId === selectedWarehouseId), [movements, selectedWarehouseId]);
    const todaysQuickStockIn = useMemo(() => {
        const today = new Date().toISOString().slice(0, 10);
        return filteredMovements.filter((movement) => movement.movementType === "quick_stock_in" && movement.createdAt.startsWith(today));
    }, [filteredMovements]);
    const itemByProductId = useMemo(() => new Map(filteredItems.map((item) => [item.productId, item])), [filteredItems]);
    const visibleItems = useMemo(() => {
        if (listPage) return filteredItems;
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
    }, [filteredItems, listPage, stockFilter]);
    return (<div className="flex flex-col gap-6">
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">
              {t("inventoryManagement")}
            </p>
            <h1 className="mt-2 text-3xl font-semibold">
              {t("inventory")}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{t("inventorySubtitle")}</p>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <WarehouseSelector locale={locale} selectedWarehouseId={selectedWarehouseId} warehouses={warehouses} onChange={(next) => { setSelectedWarehouseId(next); setPage(1); }}/>
          </div>
        </div>
      </section>

      <InventoryDashboardCards activePanel={activePanel} items={listPage?.previewItems ?? filteredItems} locale={locale} movements={filteredMovements} summary={listPage?.summary} onFilterChange={(next) => { setStockFilter(next); setPage(1); }} onPanelChange={setActivePanel}/>

      <InventoryInsightPanel activePanel={activePanel} items={listPage?.previewItems ?? filteredItems} locale={locale} onFilterChange={setStockFilter}/>

      <nav className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Link className="inline-flex min-h-16 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90" href="/inventory/quick-stock-in">
          <PackagePlus aria-hidden="true"/>
          {t("quickStockIn")}
        </Link>
        <Link className="inline-flex min-h-16 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold hover:border-primary" href="/inventory/count">
          <ClipboardCheck aria-hidden="true"/>
          {t("stockCount")}
        </Link>
        <Link className="inline-flex min-h-16 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold hover:border-primary" href="/inventory/adjustment">
          <SlidersHorizontal aria-hidden="true"/>
          {t("adjustment")}
        </Link>
        <Link className="inline-flex min-h-16 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold hover:border-primary" href="/purchasing/new">
          <ReceiptText aria-hidden="true"/>
          {t("purchaseOrder")}
        </Link>
        <Link className="inline-flex min-h-16 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold hover:border-primary" href="/purchasing/receiving">
          <Truck aria-hidden="true"/>
          {t("goodsReceiving")}
        </Link>
      </nav>

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t("todaysStockInTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("todaysStockInHint")}</p>
          </div>
          <div className="text-2xl font-semibold text-primary">{todaysQuickStockIn.length}</div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {todaysQuickStockIn.length === 0 ? (<div className="rounded-md border border-border bg-background p-4 text-sm text-muted-foreground">{t("noQuickStockInToday")}</div>) : (todaysQuickStockIn.slice(0, 6).map((movement) => {
            const item = movement.productId ? itemByProductId.get(movement.productId) : undefined;
            return (<button className="rounded-md border border-border bg-background p-4 text-left text-sm hover:border-primary" key={movement.id} type="button" onClick={() => setStockFilter("all")}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs text-muted-foreground">{movement.createdAt.slice(11)}</span>
                    <span className="font-mono text-xs text-primary">{movement.stockInNo}</span>
                  </div>
                  <div className="mt-2 font-semibold">{movementProductName(movement, locale)}</div>
                  <div className="mt-1 text-muted-foreground">
                    {movement.enteredQuantity ?? movement.quantity} {movement.unitName ?? ""} / {movement.quantity} {item?.baseUnit ?? t("baseUnits")}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{movement.supplierName ?? t("noSupplier")}</div>
                </button>);
        }))}
        </div>
      </section>

      {stockFilter !== "all" ? (<div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm font-semibold text-primary">
          {fillInventoryCopy(t("stockOverviewFilter"), { filter: inventoryStockFilterLabel(stockFilter, locale) })}
          <button className="ml-3 underline" type="button" onClick={() => setStockFilter("all")}>
            {t("viewAll")}
          </button>
        </div>) : null}

      <StockOverviewTable items={visibleItems} locale={locale}/>
      {listPage ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-background px-4 py-3 text-sm md:flex-row md:items-center md:justify-between">
          <span className="text-muted-foreground">
            {fillInventoryCopy(t("showingRange"), {
                from: listPage.totalCount === 0 ? 0 : (listPage.page - 1) * listPage.pageSize + 1,
                to: Math.min(listPage.page * listPage.pageSize, listPage.totalCount),
                total: listPage.totalCount,
            })}
          </span>
          <div className="flex items-center justify-end gap-3">
            <button className="h-9 rounded-md border border-border px-3 font-semibold disabled:opacity-40" type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>{t("previous")}</button>
            <span className="font-semibold">{fillInventoryCopy(t("pageOf"), { page: listPage.page, total: listPage.totalPages })}</span>
            <button className="h-9 rounded-md border border-border px-3 font-semibold disabled:opacity-40" type="button" disabled={page >= listPage.totalPages} onClick={() => setPage((current) => current + 1)}>{t("next")}</button>
          </div>
        </div>
      ) : null}
      <InventoryAlertLists items={listPage?.previewItems ?? filteredItems} locale={locale}/>
      <StockMovementHistory movements={filteredMovements} locale={locale}/>
    </div>);
}
