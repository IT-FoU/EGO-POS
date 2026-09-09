"use client";

import type { ProductStatus } from "@/features/products/types";
import { productStatusLabel } from "@/lib/i18n/products-copy";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import { cn } from "@/lib/utils";

const statusStyles: Record<ProductStatus | "active" | "inactive", string> = {
  active: "border-success/40 bg-success/10 text-success",
  inactive: "border-muted bg-muted text-muted-foreground",
  draft: "border-warning/50 bg-warning/10 text-warning",
  deleted: "border-danger/40 bg-danger/10 text-danger",
};

export function StatusBadge({
  locale: localeProp,
  status,
}: {
  locale?: string | null;
  status: ProductStatus | "active" | "inactive";
}) {
  const locale = useAppLocale(localeProp);
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold capitalize",
        statusStyles[status],
      )}
    >
      {productStatusLabel(status, locale)}
    </span>
  );
}
