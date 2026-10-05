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
    const current = new URLSearchParams(window.location.search);
    const terminal = current.get("terminal");
    if (range === "custom") {
      const params = new URLSearchParams({ range });
      if (customStart) {
        params.set("start", customStart);
      }
      if (customEnd) {
        params.set("end", customEnd);
      }
      if (terminal) params.set("terminal", terminal);
      router.push(`/dashboard?${params.toString()}`);
      return;
    }

    const params = new URLSearchParams({ range });
    if (terminal) params.set("terminal", terminal);
    router.push(`/dashboard?${params.toString()}`);
  }

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4 transition duration-150 hover:border-primary hover:shadow-sm">
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            className={
              activeRange === option.key
                ? "h-10 cursor-pointer rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                : "h-10 cursor-pointer rounded-md border border-border bg-background px-3 text-sm font-semibold text-muted-foreground transition duration-150 hover:border-primary hover:bg-primary/5 hover:text-foreground active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
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
              className="field-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              type="date"
              value={customStart}
              onChange={(event) => setCustomStart(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {copy.endDate}
            <input
              className="field-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              type="date"
              value={customEnd}
              onChange={(event) => setCustomEnd(event.target.value)}
            />
          </label>
          <button
            className="inline-flex h-11 cursor-pointer items-center justify-center self-end rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition duration-150 hover:brightness-105 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
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
