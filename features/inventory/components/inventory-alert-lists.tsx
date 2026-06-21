import type { InventoryItem } from "@/features/inventory/types";
import { getDaysUntil, formatQuantity } from "@/features/inventory/format";
import { InventoryImage } from "@/features/inventory/components/inventory-image";

export function InventoryAlertLists({ items }: { items: InventoryItem[] }) {
  const lowStock = items.filter((item) => item.quantity <= item.minStock);
  const deadStock = items.filter((item) => item.daysWithoutSale >= 30);
  const expiring = items.filter((item) => {
    const days = getDaysUntil(item.expiryDate);
    return days !== null && days <= 30;
  });

  return (
    <section className="grid gap-4 xl:grid-cols-3">
      <AlertPanel
        title="Low stock"
        subtitle="Minimum stock alert"
        empty="No low stock items"
        items={lowStock}
        renderMeta={(item) =>
          `${formatQuantity(item.quantity, item.baseUnit)} / min ${formatQuantity(item.minStock, item.baseUnit)}${
            item.supplierName ? ` | Supplier: ${item.supplierName}` : ""
          }${item.lastPurchaseDate ? ` | Last purchase: ${item.lastPurchaseDate}` : ""}`
        }
      />
      <AlertPanel
        title="Dead stock"
        subtitle="No recent sales movement"
        empty="No dead stock items"
        items={deadStock}
        renderMeta={(item) =>
          `${item.daysWithoutSale} days without sale | ${formatQuantity(item.quantity, item.baseUnit)} | Value ${
            item.inventoryValueLak ? `${Math.round(item.inventoryValueLak).toLocaleString("en-US")} LAK` : "0 LAK"
          }`
        }
      />
      <AlertPanel
        title="Expiring products"
        subtitle="Expiry tracking"
        empty="No expiring products"
        items={expiring}
        renderMeta={(item) => `${item.expiryDate} (${getDaysUntil(item.expiryDate)} days)`}
      />
    </section>
  );
}

function AlertPanel({
  empty,
  items,
  renderMeta,
  subtitle,
  title,
}: {
  empty: string;
  items: InventoryItem[];
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
          items.map((item) => (
            <div className="flex items-center gap-3 rounded-md border border-border bg-background p-3" key={item.id}>
              <InventoryImage imageKey={item.imageKey} label={item.productNameEn} />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{item.productNameEn}</div>
                <div className="mt-1 text-xs text-muted-foreground">{item.sku}</div>
                <div className="mt-1 text-xs text-warning">{renderMeta(item)}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </article>
  );
}
