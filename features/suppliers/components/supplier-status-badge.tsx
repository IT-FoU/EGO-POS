import { cn } from "@/lib/utils";
import type { SupplierStatus } from "@/features/suppliers/types";
import { supplierStatusLabel } from "@/lib/i18n/suppliers-copy";

const statusStyles: Record<SupplierStatus, string> = {
  active: "border-success/40 bg-success/10 text-success",
  inactive: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

export function SupplierStatusBadge({
  locale,
  status,
}: {
  locale?: string | null;
  status: SupplierStatus;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold",
        statusStyles[status],
      )}
    >
      {supplierStatusLabel(status, locale)}
    </span>
  );
}
