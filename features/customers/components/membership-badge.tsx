import { cn } from "@/lib/utils";
import { membershipDisplayLabel } from "@/features/customers/membership-display";
import type { KnownMembershipLevelName } from "@/features/customers/types";

const levelStyles: Record<KnownMembershipLevelName, string> = {
  Gold: "border-warning/30 bg-warning-soft text-warning",
  Platinum: "border-primary-border bg-primary-soft text-primary",
  Silver: "border-border bg-muted text-muted-foreground",
  Standard: "border-border bg-surface text-foreground",
};

const noMembershipStyle = "border-border bg-muted text-muted-foreground";
const customLevelStyle = "border-border bg-surface text-foreground";

export function MembershipBadge({ level }: { level: string | null }) {
  const known = level && level in levelStyles ? (level as KnownMembershipLevelName) : null;
  return (
    <span
      className={cn(
        "ego-badge",
        known ? levelStyles[known] : level ? customLevelStyle : noMembershipStyle,
      )}
    >
      {membershipDisplayLabel(level)}
    </span>
  );
}
