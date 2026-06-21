import { cn } from "@/lib/utils";
import type { SupplierStatus } from "@/features/suppliers/types";

const statusStyles: Record<SupplierStatus, string> = {
  active: "border-success/40 bg-success/10 text-success",
  inactive: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

export function SupplierStatusBadge({ status }: { status: SupplierStatus }) {
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
