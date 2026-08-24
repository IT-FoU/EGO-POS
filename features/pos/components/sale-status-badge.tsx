"use client";

import { Ban, RotateCcw } from "lucide-react";

import { resolveSaleStatusVisual } from "@/features/pos/sale-status-presentation";
import { cn } from "@/lib/utils";

export function SaleStatusBadge({ status }: { status: string }) {
  const visual = resolveSaleStatusVisual(status);
  const Icon = visual.tone === "voided" ? Ban : visual.tone === "refunded" ? RotateCcw : null;

  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-full shrink-0 items-center gap-1 rounded-md border px-2 text-[11px] font-semibold",
        visual.badgeClassName,
      )}
    >
      {Icon ? <Icon aria-hidden="true" className="size-3 shrink-0" /> : null}
      <span className="truncate">{visual.label}</span>
    </span>
  );
}

export function SaleStatusIndicator({ status }: { status: string }) {
  const visual = resolveSaleStatusVisual(status);
  return <span aria-hidden="true" className={cn("w-1 shrink-0 self-stretch", visual.indicatorClassName)} />;
}
