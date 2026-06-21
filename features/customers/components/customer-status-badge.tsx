import { cn } from "@/lib/utils";
import type { CustomerStatus } from "@/features/customers/types";

const statusStyles: Record<CustomerStatus, string> = {
  active: "border-success/40 bg-success/10 text-success",
  inactive: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

export function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
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
