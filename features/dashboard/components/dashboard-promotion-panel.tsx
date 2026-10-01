"use client";

import Link from "next/link";
import { ArrowRight, BadgePercent, Megaphone } from "lucide-react";
import type { DashboardPromotionSlice } from "@/features/dashboard/dashboard-service";
import { getDashboardCopy } from "@/lib/i18n/dashboard-copy";
import { useAppLocale } from "@/lib/i18n/use-app-locale";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value));
}

const dashboardDisplayClass =
  "transition duration-150 hover:border-primary hover:shadow-sm";
const dashboardLinkClass =
  "cursor-pointer transition duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

export function DashboardPromotionPanel({ snapshot }: { snapshot: DashboardPromotionSlice }) {
  const copy = getDashboardCopy(useAppLocale());
  const { summary } = snapshot;
  const rangeLabel = {
    custom: copy.customDate,
    month: copy.thisMonth,
    today: copy.today,
    week: copy.thisWeek,
    year: copy.thisYear,
  }[snapshot.period.key];
  const maxDiscount = Math.max(...summary.topPromotions.map((promotion) => promotion.discountLak), 1);
  const metrics = [
    [copy.activePromotions, summary.activeCount, copy.companyWideNow],
    [copy.startingSoon, summary.startingSoonCount, copy.companyWideNow],
    [copy.endingSoon, summary.endingSoonCount, copy.companyWideNow],
    [copy.promotionUsage, summary.usageCount, copy.selectedBranchPeriod],
  ] as const;

  return (
    <section className={`${dashboardDisplayClass} min-w-0 rounded-lg border border-border bg-card p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Megaphone aria-hidden="true" className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">{copy.promotions}</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{copy.selectedBranchPeriod}: {rangeLabel}</p>
        </div>
        <Link
          className={`${dashboardLinkClass} inline-flex min-h-10 items-center gap-1 rounded-md px-3 text-sm font-medium text-primary outline-none hover:bg-primary/10 hover:text-foreground`}
          href="/promotions"
        >
          {copy.viewPromotions}
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </div>

      {snapshot.dataStatus.hasError ? (
        <div className={`${dashboardDisplayClass} mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive`}>
          {copy.dashboardUnavailable}
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {metrics.map(([label, value, helper]) => (
              <div className={`${dashboardDisplayClass} rounded-md border border-border bg-muted/20 p-3`} key={label}>
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{formatNumber(value)}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{helper}</p>
              </div>
            ))}
            <div className={`${dashboardDisplayClass} rounded-md border border-primary/20 bg-primary/5 p-3`}>
              <p className="text-xs font-medium text-muted-foreground">{copy.promotionDiscount}</p>
              <p className="mt-1 break-words text-xl font-semibold tabular-nums">
                {formatNumber(summary.promotionDiscountLak)} LAK
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">{copy.selectedBranchPeriod}</p>
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center gap-2">
              <BadgePercent aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">{copy.topPromotionsByDiscount}</h3>
            </div>
            {summary.topPromotions.length === 0 ? (
              <div className={`${dashboardDisplayClass} mt-3 rounded-md border border-dashed border-border p-5 text-center text-sm text-muted-foreground`}>
                {copy.noPromotionActivity}
              </div>
            ) : (
              <ol className="mt-3 grid gap-3">
                {summary.topPromotions.map((promotion, index) => (
                  <li className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-transparent p-2 transition duration-150 hover:border-primary hover:bg-primary/5 hover:shadow-sm" key={promotion.promotionId}>
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex min-w-0 justify-between gap-3 text-sm">
                        <span className="truncate font-medium">{promotion.name}</span>
                        <span className="shrink-0 tabular-nums">{formatNumber(promotion.discountLak)} LAK</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.max(0, (promotion.discountLak / maxDiscount) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatNumber(promotion.usageCount)} {copy.uses}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}
    </section>
  );
}
