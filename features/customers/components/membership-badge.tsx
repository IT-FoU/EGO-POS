import { cn } from "@/lib/utils";
import type { MembershipLevelName } from "@/features/customers/types";

const levelStyles: Record<MembershipLevelName, string> = {
  Gold: "border-warning/40 bg-warning/10 text-warning",
  Platinum: "border-primary/40 bg-primary/10 text-primary",
  Silver: "border-muted-foreground/30 bg-muted text-muted-foreground",
  Standard: "border-border bg-background text-foreground",
};

export function MembershipBadge({ level }: { level: MembershipLevelName }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold",
        levelStyles[level],
      )}
    >
      {level}
    </span>
  );
}
