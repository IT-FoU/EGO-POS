import type { LucideIcon } from "lucide-react";

export function ReportMetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  labelKey?: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="mt-2 text-2xl font-semibold">{value}</div>
        </div>
        <div className="grid size-11 place-items-center rounded-md bg-primary/10 text-primary">
          <Icon aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
