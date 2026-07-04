import { cn } from "@/lib/utils";
import type { MembershipLevelName } from "@/features/customers/types";

const levelStyles: Record<MembershipLevelName, string> = {
  Gold: "border-warning/30 bg-warning-soft text-warning",
  Platinum: "border-primary-border bg-primary-soft text-primary",
  Silver: "border-border bg-muted text-muted-foreground",
  Standard: "border-border bg-surface text-foreground",
};

export function MembershipBadge({ level }: { level: MembershipLevelName }) {
  return (
    <span
      className={cn(
        "ego-badge",
        levelStyles[level],
      )}
    >
      {level}
    </span>
  );
}
