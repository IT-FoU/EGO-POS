"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DashboardRangeKey } from "@/features/dashboard/dashboard-service";

const options: Array<{ key: DashboardRangeKey; label: string }> = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "year", label: "This Year" },
  { key: "custom", label: "Custom Date" },
];

export function DashboardDateRangeControls({
  activeRange,
  endDate,
  startDate,
}: {
  activeRange: DashboardRangeKey;
  endDate?: string;
  startDate?: string;
}) {
  const router = useRouter();
  const [customStart, setCustomStart] = useState(startDate ?? "");
  const [customEnd, setCustomEnd] = useState(endDate ?? "");

  function applyRange(range: DashboardRangeKey) {
    if (range === "custom") {
      const params = new URLSearchParams({ range });
      if (customStart) {
        params.set("start", customStart);
      }
      if (customEnd) {
        params.set("end", customEnd);
      }
      router.push(`/dashboard?${params.toString()}`);
      return;
    }

    router.push(`/dashboard?range=${range}`);
  }

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            className={
              activeRange === option.key
                ? "h-9 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground"
                : "h-9 rounded-md border border-border px-3 text-sm font-semibold text-muted-foreground transition hover:border-primary hover:text-foreground"
            }
            key={option.key}
            type="button"
            onClick={() => applyRange(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {activeRange === "custom" ? (
        <div className="grid gap-3 sm:grid-cols-[180px_180px_auto]">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Start date
            <input
              className="field-input"
              type="date"
              value={customStart}
              onChange={(event) => setCustomStart(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            End date
            <input
              className="field-input"
              type="date"
              value={customEnd}
              onChange={(event) => setCustomEnd(event.target.value)}
            />
          </label>
          <button
            className="inline-flex h-11 items-center justify-center self-end rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
            type="button"
            onClick={() => applyRange("custom")}
          >
            Apply
          </button>
        </div>
      ) : null}
    </div>
  );
}
