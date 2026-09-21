"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, FileSpreadsheet, type LucideIcon } from "lucide-react";
import type { SupportedLocale } from "@/lib/constants";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import { tReports } from "@/lib/i18n/reports-copy";
import {
  reportCenterCategoryTitleKey,
  type ReportCenterEntry,
} from "@/features/reports/report-center-catalog";
import { REPORT_CENTER_ICON_MAP } from "@/features/reports/report-center-icons";
import { recordReportCenterRecent } from "@/features/reports/report-center-prefs";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const navLinkClass = `rounded-md font-medium text-primary underline-offset-4 hover:underline ${focusRing}`;

const PLANNED_CHIP_KEYS = ["filters", "reportTable", "print", "excel", "pdf"] as const;

export type ReportDetailNavProps = {
  categoryKey: string;
  locale?: SupportedLocale;
  reportId?: string;
  titleKey: string;
};

export function ReportDetailNav({
  categoryKey,
  locale: localeProp,
  reportId,
  titleKey,
}: ReportDetailNavProps) {
  const locale = useAppLocale(localeProp);

  useEffect(() => {
    if (reportId) recordReportCenterRecent(reportId);
  }, [reportId]);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <nav aria-label={tReports("breadcrumbNav", locale)}>
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <li>
            <Link className={navLinkClass} href="/reports">
              {tReports("reports", locale)}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>{tReports(categoryKey, locale)}</li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="font-medium text-foreground">{tReports(titleKey, locale)}</li>
        </ol>
      </nav>
      <Link
        aria-label={tReports("backToReports", locale)}
        className={`inline-flex h-10 w-fit items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground hover:border-primary ${focusRing}`}
        href="/reports"
      >
        <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
        {tReports("backToReports", locale)}
      </Link>
    </div>
  );
}

export function ReportPageChrome({
  entry,
  locale,
}: {
  entry: ReportCenterEntry;
  locale?: SupportedLocale;
}) {
  return (
    <ReportDetailNav
      categoryKey={reportCenterCategoryTitleKey(entry.categoryId)}
      locale={locale}
      reportId={entry.id}
      titleKey={entry.titleKey}
    />
  );
}

export function ReportPlannedChips({ locale: localeProp }: { locale?: SupportedLocale }) {
  const locale = useAppLocale(localeProp);
  return (
    <div className="flex flex-wrap gap-2" data-report-planned-chips="true">
      {PLANNED_CHIP_KEYS.map((key) => (
        <span
          className="inline-flex items-center gap-2 rounded-full border border-dashed border-border bg-card px-3 py-1.5 text-xs text-muted-foreground"
          key={key}
        >
          <span>{tReports(key, locale)}</span>
          <span className="rounded-full bg-background px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
            {tReports("planned", locale)}
          </span>
        </span>
      ))}
    </div>
  );
}

export function ReportSheet({ children }: { children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg border border-border bg-white p-6 text-zinc-900 shadow-sm sm:p-8">
      {children}
    </section>
  );
}

export function ReportDetailHeader({
  descriptionKey,
  icon: Icon,
  locale: localeProp,
  posHint,
  titleKey,
}: {
  descriptionKey: string;
  icon: LucideIcon;
  locale?: SupportedLocale;
  posHint?: boolean;
  titleKey: string;
}) {
  const locale = useAppLocale(localeProp);
  return (
    <header className="flex min-w-0 items-start gap-4">
      <div className="grid size-12 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
        <Icon aria-hidden={true} className="size-6" />
      </div>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold sm:text-3xl">{tReports(titleKey, locale)}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{tReports(descriptionKey, locale)}</p>
        {posHint ? <p className="mt-3 text-sm text-muted-foreground">{tReports("posMoreHint", locale)}</p> : null}
      </div>
    </header>
  );
}

export function ReportDetailShell({
  children,
  descriptionKey,
  entry,
  icon,
  locale,
  planned,
  posHint,
  titleKey,
}: {
  children: ReactNode;
  descriptionKey?: string;
  entry?: ReportCenterEntry;
  icon?: LucideIcon;
  locale?: SupportedLocale;
  planned?: boolean;
  posHint?: boolean;
  titleKey?: string;
}) {
  const resolvedTitleKey = entry?.titleKey ?? titleKey ?? "reports";
  const resolvedDescriptionKey = entry?.descriptionKey ?? descriptionKey;
  const resolvedIcon = icon ?? (entry ? REPORT_CENTER_ICON_MAP[entry.icon] : undefined);
  const categoryKey = entry ? reportCenterCategoryTitleKey(entry.categoryId) : "reports";

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {entry ? (
        <ReportPageChrome entry={entry} locale={locale} />
      ) : (
        <ReportDetailNav categoryKey={categoryKey} locale={locale} titleKey={resolvedTitleKey} />
      )}
      {resolvedIcon && resolvedDescriptionKey ? (
        <ReportDetailHeader
          descriptionKey={resolvedDescriptionKey}
          icon={resolvedIcon}
          locale={locale}
          posHint={posHint ?? entry?.posHint}
          titleKey={resolvedTitleKey}
        />
      ) : null}
      {planned ? <ReportPlannedChips locale={locale} /> : null}
      <ReportSheet>{children}</ReportSheet>
    </div>
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
    <ReportDetailShell entry={entry} locale={locale} planned>
      <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
        <div className="grid size-16 place-items-center rounded-full bg-zinc-100 text-zinc-500">
          <FileSpreadsheet aria-hidden="true" className="size-8" />
        </div>
        <p className="max-w-xl text-sm leading-6 text-zinc-600">{tReports("comingSoonTable", locale)}</p>
      </div>
    </ReportDetailShell>
  );
}
