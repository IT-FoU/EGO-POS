import { cn } from "@/lib/utils";
import type { SupplierPurchaseOrder } from "@/features/suppliers/types";

const statusStyles: Record<SupplierPurchaseOrder["status"], string> = {
  cancelled: "border-danger/40 bg-danger/10 text-danger",
  draft: "border-muted-foreground/30 bg-muted text-muted-foreground",
  ordered: "border-primary/40 bg-primary/10 text-primary",
  partial: "border-warning/40 bg-warning/10 text-warning",
  received: "border-success/40 bg-success/10 text-success",
};

export function PurchaseStatusBadge({
  status,
}: {
  status: SupplierPurchaseOrder["status"];
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold capitalize",
        statusStyles[status],
      )}
    >
      {status}
    </span>
  );
}
