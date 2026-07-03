"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DashboardRangeKey } from "@/features/dashboard/dashboard-service";
import type { DashboardCopy } from "@/lib/i18n/dashboard-copy";

export function DashboardDateRangeControls({
  activeRange,
  copy,
  endDate,
  startDate,
}: {
  activeRange: DashboardRangeKey;
  copy: DashboardCopy;
  endDate?: string;
  startDate?: string;
}) {
  const router = useRouter();
  const [customStart, setCustomStart] = useState(startDate ?? "");
  const [customEnd, setCustomEnd] = useState(endDate ?? "");
  const options: Array<{ key: DashboardRangeKey; label: string }> = [
    { key: "today", label: copy.today },
    { key: "week", label: copy.thisWeek },
    { key: "month", label: copy.thisMonth },
    { key: "year", label: copy.thisYear },
    { key: "custom", label: copy.customDate },
  ];

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
                ? "h-10 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground"
                : "h-10 rounded-md border border-border bg-background px-3 text-sm font-semibold text-muted-foreground transition hover:border-primary hover:text-foreground"
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
            {copy.startDate}
            <input
              className="field-input"
              type="date"
              value={customStart}
              onChange={(event) => setCustomStart(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {copy.endDate}
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
            {copy.apply}
          </button>
        </div>
      ) : null}
    </div>
  );
}
