import { getDaysUntil } from "@/features/inventory/format";

export function StockAlert({ quantity, minStock }: { quantity: number; minStock: number }) {
  const isLow = quantity <= minStock;

  return (
    <span
      className={
        isLow
          ? "inline-flex h-7 items-center rounded-md border border-danger/40 bg-danger/10 px-2.5 text-xs font-semibold text-danger"
          : "inline-flex h-7 items-center rounded-md border border-success/40 bg-success/10 px-2.5 text-xs font-semibold text-success"
      }
    >
      {isLow ? "Low stock" : "Healthy"}
    </span>
  );
}

export function ExpiryBadge({ expiryDate }: { expiryDate?: string }) {
  const days = getDaysUntil(expiryDate);

  if (!expiryDate || days === null) {
    return <span className="text-sm text-muted-foreground">No expiry</span>;
  }

  const className =
    days <= 14
      ? "border-danger/40 bg-danger/10 text-danger"
      : days <= 30
        ? "border-warning/50 bg-warning/10 text-warning"
        : "border-success/40 bg-success/10 text-success";

  return (
    <span className={`inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold ${className}`}>
      {expiryDate} ({days}d)
    </span>
  );
}
