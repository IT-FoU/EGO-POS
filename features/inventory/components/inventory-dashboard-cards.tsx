import { AlertTriangle, Boxes, CalendarClock, PackageCheck, PackageSearch, TrendingUp, WalletCards, } from "lucide-react";
import type { InventoryItem, StockMovement } from "@/features/inventory/types";
import type { InventoryListSummary } from "@/features/inventory/list-query";
import { getDaysUntil } from "@/features/inventory/format";
import { localizedProductName } from "@/features/pos/product-display-name";
import { fillInventoryCopy, tInventory } from "@/lib/i18n/inventory-copy";
import type { SupportedLocale } from "@/lib/constants";

export type InventoryDashboardPanel = "fast_moving" | "stock_alerts" | null;
export type InventoryStockFilter = "all" | "out_of_stock" | "low_stock" | "near_expiry" | "dead_stock" | "fast_moving";
function formatLak(value: number) {
    return `${Math.round(value).toLocaleString("en-US")} LAK`;
}
function itemValue(item: InventoryItem) {
    if (item.inventoryValueLak != null) {
        return item.inventoryValueLak;
    }
    const baseUnit = item.units?.find((unit) => unit.isBaseUnit) ?? item.units?.[0];
    return item.quantity * (baseUnit?.costPriceLak ?? 0);
}
export function getInventoryDashboardMetrics(items: InventoryItem[], movements: StockMovement[] = []) {
    const totalProducts = items.length;
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const inventoryValue = items.reduce((sum, item) => sum + itemValue(item), 0);
    const outOfStockItems = items.filter((item) => item.quantity <= 0);
    const lowStockItems = items.filter((item) => item.quantity > 0 && item.quantity <= item.minStock);
    const deadStockItems = items.filter((item) => item.daysWithoutSale >= 30);
    const nearExpiryItems = items.filter((item) => {
        const days = getDaysUntil(item.expiryDate);
        return days !== null && days <= 30;
    });
    const today = new Date().toISOString().slice(0, 10);
    const todaysStockIn = movements.filter((movement) => movement.movementType === "quick_stock_in" && movement.createdAt.startsWith(today)).length;
    const todaysAdjustments = movements.filter((movement) => movement.movementType === "adjustment" && movement.createdAt.startsWith(today)).length;
    const fastMovingItems = items
        .filter((item) => (item.unitsSold30Days ?? 0) > 0 || item.daysWithoutSale <= 7)
        .sort((a, b) => (b.unitsSold30Days ?? 0) - (a.unitsSold30Days ?? 0));
    const alertCenter = outOfStockItems.length + lowStockItems.length + nearExpiryItems.length + deadStockItems.length;
    return {
        alertCenter,
        deadStockItems,
        fastMovingItems,
        inventoryValue,
        lowStockItems,
        nearExpiryItems,
        outOfStockItems,
        todaysAdjustments,
        todaysStockIn,
        totalProducts,
        totalQuantity,
    };
}
export function InventoryDashboardCards({ activePanel, items, locale, movements = [], summary, onFilterChange, onPanelChange, }: {
    activePanel: InventoryDashboardPanel;
    items: InventoryItem[];
    locale?: SupportedLocale;
    movements?: StockMovement[];
    summary?: InventoryListSummary;
    onFilterChange: (filter: InventoryStockFilter) => void;
    onPanelChange: (panel: InventoryDashboardPanel) => void;
}) {
    const t = (key: string) => tInventory(key, locale);
    const metrics = getInventoryDashboardMetrics(items, movements);
    const totalProducts = summary?.totalProducts ?? metrics.totalProducts;
    const totalQuantity = summary?.totalQuantity ?? metrics.totalQuantity;
    const inventoryValue = summary?.inventoryValue ?? metrics.inventoryValue;
    const fastMoving = summary?.fastMoving ?? metrics.fastMovingItems.length;
    const alertCenter = summary?.alertCenter ?? metrics.alertCenter;
    const lowStock = summary?.lowStock ?? metrics.lowStockItems.length;
    const deadStock = summary?.deadStock ?? metrics.deadStockItems.length;
    const nearExpiry = summary?.nearExpiry ?? metrics.nearExpiryItems.length;
    const cards = [
        { id: "total-products", filter: "all" as const, label: t("totalProducts"), value: totalProducts, icon: Boxes },
        {
            id: "inventory-quantity",
            filter: "all" as const,
            label: t("inventoryQuantity"),
            value: totalQuantity.toLocaleString("en-US"),
            icon: PackageSearch,
        },
        { id: "inventory-value", filter: "all" as const, label: t("inventoryValue"), value: formatLak(inventoryValue), icon: WalletCards },
        { id: "todays-stock-in", filter: "all" as const, label: t("todaysStockIn"), value: metrics.todaysStockIn, icon: PackageCheck },
        { id: "todays-adjustments", filter: "all" as const, label: t("todaysAdjustments"), value: metrics.todaysAdjustments, icon: AlertTriangle },
        {
            id: "fast-moving",
            filter: "fast_moving" as const,
            label: t("fastMovingProducts"),
            panel: "fast_moving" as const,
            value: fastMoving,
            icon: TrendingUp,
        },
        {
            id: "stock-alert-center",
            filter: "low_stock" as const,
            label: t("stockAlertCenter"),
            panel: "stock_alerts" as const,
            value: alertCenter,
            icon: AlertTriangle,
        },
        { id: "low-stock", filter: "low_stock" as const, label: t("lowStock"), value: lowStock, icon: AlertTriangle },
        { id: "dead-stock", filter: "dead_stock" as const, label: t("deadStock"), value: deadStock, icon: PackageSearch },
        { id: "expiring-soon", filter: "near_expiry" as const, label: t("expiringSoon"), value: nearExpiry, icon: CalendarClock },
    ];
    return (<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => {
            const Icon = card.icon;
            const cardPanel = "panel" in card ? card.panel : null;
            const expanded = cardPanel != null && activePanel === cardPanel;
            return (<button className={`rounded-lg border bg-card p-5 text-left transition hover:border-primary ${expanded ? "border-primary shadow-sm" : "border-border"}`} key={card.id} type="button" onClick={() => {
                    onFilterChange(card.filter);
                    if (cardPanel != null) {
                        onPanelChange(expanded ? null : cardPanel);
                    }
                }}>
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm text-muted-foreground">{card.label}</div>
              <div className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary">
                <Icon aria-hidden="true"/>
              </div>
            </div>
            <div className="mt-4 text-3xl font-semibold">{card.value}</div>
            {"panel" in card ? (<div className="mt-3 text-xs font-semibold text-primary">
                {expanded ? t("hideDetails") : t("viewDetails")}
              </div>) : null}
          </button>);
        })}
    </section>);
}
export function InventoryInsightPanel({ activePanel, items, locale, onFilterChange, }: {
    activePanel: InventoryDashboardPanel;
    items: InventoryItem[];
    locale?: SupportedLocale;
    onFilterChange: (filter: InventoryStockFilter) => void;
}) {
    const t = (key: string) => tInventory(key, locale);
    const metrics = getInventoryDashboardMetrics(items);
    if (activePanel === "fast_moving") {
        return (<section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">{t("fastMovingProducts")}</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {metrics.fastMovingItems.length === 0 ? (<div className="rounded-md border border-border bg-background p-4 text-sm text-muted-foreground">{t("noFastMoving")}</div>) : (metrics.fastMovingItems.slice(0, 9).map((item) => (<button className="rounded-md border border-border bg-background p-4 text-left text-sm hover:border-primary" key={item.id} type="button" onClick={() => onFilterChange("fast_moving")}>
                <div className="font-semibold">{localizedProductName({ nameEn: item.productNameEn, nameLo: item.productNameLo }, locale)}</div>
                <div className="mt-1 text-primary">{fillInventoryCopy(t("unitsSold"), { count: (item.unitsSold30Days ?? 0).toLocaleString("en-US") })}</div>
              </button>)))}
        </div>
      </section>);
    }
    if (activePanel === "stock_alerts") {
        const groups = [
            { filter: "out_of_stock" as const, items: metrics.outOfStockItems, title: t("outOfStock") },
            { filter: "low_stock" as const, items: metrics.lowStockItems, title: t("lowStock") },
            { filter: "near_expiry" as const, items: metrics.nearExpiryItems, title: t("nearExpiry") },
            { filter: "dead_stock" as const, items: metrics.deadStockItems, title: t("deadStock") },
        ];
        return (<section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">{t("stockAlertCenter")}</h2>
        <div className="mt-4 grid gap-4 xl:grid-cols-4">
          {groups.map((group) => (<div className="rounded-md border border-border bg-background p-4" key={group.filter}>
              <button className="flex w-full items-center justify-between gap-3 text-left" type="button" onClick={() => onFilterChange(group.filter)}>
                <span className="font-semibold">{group.title}</span>
                <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                  {group.items.length}
                </span>
              </button>
              <div className="mt-3 flex flex-col gap-2">
                {group.items.length === 0 ? (<div className="text-xs text-muted-foreground">{t("noProducts")}</div>) : (group.items.slice(0, 5).map((item) => (<button className="rounded border border-border px-3 py-2 text-left text-xs hover:border-primary" key={item.id} type="button" onClick={() => onFilterChange(group.filter)}>
                      {localizedProductName({ nameEn: item.productNameEn, nameLo: item.productNameLo }, locale)}
                    </button>)))}
              </div>
            </div>))}
        </div>
      </section>);
    }
    return null;
}
