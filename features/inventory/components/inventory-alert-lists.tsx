import type { InventoryItem } from "@/features/inventory/types";
import { getDaysUntil, formatQuantity } from "@/features/inventory/format";
import { InventoryImage } from "@/features/inventory/components/inventory-image";
import { localizedProductName } from "@/features/pos/product-display-name";
import { fillInventoryCopy, tInventory } from "@/lib/i18n/inventory-copy";
import type { SupportedLocale } from "@/lib/constants";

export function InventoryAlertLists({ items, locale }: { items: InventoryItem[]; locale?: SupportedLocale }) {
  const t = (key: string) => tInventory(key, locale);
  const lowStock = items.filter((item) => item.quantity <= item.minStock);
  const deadStock = items.filter((item) => item.daysWithoutSale >= 30);
  const expiring = items.filter((item) => {
    const days = getDaysUntil(item.expiryDate);
    return days !== null && days <= 30;
  });

  return (
    <section className="grid gap-4 xl:grid-cols-3">
      <AlertPanel
        locale={locale}
        title={t("lowStockTitle")}
        subtitle={t("minStockAlert")}
        empty={t("noLowStockItems")}
        items={lowStock}
        renderMeta={(item) =>
          `${fillInventoryCopy(t("minQty"), {
            qty: formatQuantity(item.quantity, item.baseUnit),
            min: formatQuantity(item.minStock, item.baseUnit),
          })}${item.supplierName ? ` | ${t("supplierLabel")} ${item.supplierName}` : ""}${
            item.lastPurchaseDate ? ` | ${fillInventoryCopy(t("lastPurchase"), { date: item.lastPurchaseDate })}` : ""
          }`
        }
      />
      <AlertPanel
        locale={locale}
        title={t("deadStockTitle")}
        subtitle={t("noRecentSales")}
        empty={t("noDeadStockItems")}
        items={deadStock}
        renderMeta={(item) =>
          `${fillInventoryCopy(t("daysWithoutSale"), { days: item.daysWithoutSale })} | ${formatQuantity(item.quantity, item.baseUnit)} | ${fillInventoryCopy(t("valueLak"), {
            value: item.inventoryValueLak ? `${Math.round(item.inventoryValueLak).toLocaleString("en-US")} LAK` : "0 LAK",
          })}`
        }
      />
      <AlertPanel
        locale={locale}
        title={t("expiringProducts")}
        subtitle={t("expiryTracking")}
        empty={t("noExpiringProducts")}
        items={expiring}
        renderMeta={(item) =>
          fillInventoryCopy(t("expiryDays"), { date: item.expiryDate ?? "", days: getDaysUntil(item.expiryDate) ?? 0 })
        }
      />
    </section>
  );
}

function AlertPanel({
  empty,
  items,
  locale,
  renderMeta,
  subtitle,
  title,
}: {
  empty: string;
  items: InventoryItem[];
  locale?: SupportedLocale;
  renderMeta: (item: InventoryItem) => string;
  subtitle: string;
  title: string;
}) {
  return (
    <article className="rounded-lg border border-border bg-card p-5">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="mt-5 flex flex-col gap-3">
        {items.length === 0 ? (
          <div className="rounded-md border border-border bg-background p-4 text-sm text-muted-foreground">
            {empty}
          </div>
        ) : (
          items.map((item) => {
            const name = localizedProductName({ nameEn: item.productNameEn, nameLo: item.productNameLo }, locale);
            return (
              <div className="flex items-center gap-3 rounded-md border border-border bg-background p-3" key={item.id}>
                <InventoryImage imageKey={item.imageKey} label={name} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{item.sku}</div>
                  <div className="mt-1 text-xs text-warning">{renderMeta(item)}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </article>
  );
}
