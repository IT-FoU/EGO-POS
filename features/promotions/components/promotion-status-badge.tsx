import { cn } from "@/lib/utils";
import type { PromotionStatus } from "@/features/promotions/types";

const statusStyles: Record<PromotionStatus, string> = {
  active: "border-success/40 bg-success/10 text-success",
  expired: "border-muted-foreground/30 bg-muted text-muted-foreground",
  inactive: "border-danger/40 bg-danger/10 text-danger",
  scheduled: "border-warning/40 bg-warning/10 text-warning",
};

export function PromotionStatusBadge({ status }: { status: PromotionStatus }) {
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
