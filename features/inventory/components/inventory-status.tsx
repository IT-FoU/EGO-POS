import { getDaysUntil } from "@/features/inventory/format";
import { fillInventoryCopy, tInventory } from "@/lib/i18n/inventory-copy";
import type { SupportedLocale } from "@/lib/constants";

export function StockAlert({
  quantity,
  minStock,
  locale,
}: {
  quantity: number;
  minStock: number;
  locale?: SupportedLocale;
}) {
  const isLow = quantity <= minStock;
  const t = (key: string) => tInventory(key, locale);

  return (
    <span
      className={
        isLow
          ? "inline-flex h-7 items-center rounded-md border border-danger/40 bg-danger/10 px-2.5 text-xs font-semibold text-danger"
          : "inline-flex h-7 items-center rounded-md border border-success/40 bg-success/10 px-2.5 text-xs font-semibold text-success"
      }
    >
      {isLow ? t("lowStockBadge") : t("healthy")}
    </span>
  );
}

export function ExpiryBadge({ expiryDate, locale }: { expiryDate?: string; locale?: SupportedLocale }) {
  const days = getDaysUntil(expiryDate);
  const t = (key: string) => tInventory(key, locale);

  if (!expiryDate || days === null) {
    return <span className="text-sm text-muted-foreground">{t("noExpiry")}</span>;
  }

  const className =
    days <= 14
      ? "border-danger/40 bg-danger/10 text-danger"
      : days <= 30
        ? "border-warning/50 bg-warning/10 text-warning"
        : "border-success/40 bg-success/10 text-success";

  return (
    <span className={`inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold ${className}`}>
      {fillInventoryCopy(t("expiryDays"), { date: expiryDate, days })}
    </span>
  );
}
