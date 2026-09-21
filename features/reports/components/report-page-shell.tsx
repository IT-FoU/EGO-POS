"use client";

import { useEffect } from "react";
import Link from "next/link";
import type { SupportedLocale } from "@/lib/constants";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import { tReports } from "@/lib/i18n/reports-copy";
import {
  REPORT_CENTER_CATEGORIES,
  type ReportCenterEntry,
} from "@/features/reports/report-center-catalog";
import { recordReportCenterRecent } from "@/features/reports/report-center-prefs";

function categoryTitleKey(entry: ReportCenterEntry) {
  return REPORT_CENTER_CATEGORIES.find((category) => category.id === entry.categoryId)?.titleKey ?? "reports";
}

export function ReportPageChrome({
  entry,
  locale: localeProp,
}: {
  entry: ReportCenterEntry;
  locale?: SupportedLocale;
}) {
  const locale = useAppLocale(localeProp);

  useEffect(() => {
    recordReportCenterRecent(entry.id);
  }, [entry.id]);

  return (
    <nav aria-label={tReports("reports", locale)} className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <Link className="font-medium text-primary hover:underline" href="/reports">
        {tReports("backToReports", locale)}
      </Link>
      <span aria-hidden="true">/</span>
      <span>{tReports(categoryTitleKey(entry), locale)}</span>
      <span aria-hidden="true">/</span>
      <span className="text-foreground">{tReports(entry.titleKey, locale)}</span>
    </nav>
  );
}

export function ReportComingSoon({
  entry,
  locale: localeProp,
}: {
  entry: ReportCenterEntry;
  locale?: SupportedLocale;
}) {
  const locale = useAppLocale(localeProp);
  return (
    <div className="flex flex-col gap-4">
      <ReportPageChrome entry={entry} locale={locale} />
      <section className="rounded-lg border border-border bg-card p-6">
        <p className="text-sm font-medium text-primary">{tReports(categoryTitleKey(entry), locale)}</p>
        <h1 className="mt-2 text-3xl font-semibold">{tReports(entry.titleKey, locale)}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{tReports(entry.descriptionKey, locale)}</p>
        {entry.posHint ? (
          <p className="mt-3 text-sm text-muted-foreground">{tReports("posMoreHint", locale)}</p>
        ) : null}
      </section>
      <section className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
        <p className="text-sm leading-6 text-muted-foreground">{tReports("comingSoonTable", locale)}</p>
      </section>
    </div>
  );
}
