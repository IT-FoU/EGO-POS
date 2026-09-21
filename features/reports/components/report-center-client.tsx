"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowUpDown,
  Banknote,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  History,
  Package,
  Receipt,
  Scale,
  Search,
  Star,
  Tags,
  TrendingUp,
  Undo2,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import type { SupportedLocale } from "@/lib/constants";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import { tReports } from "@/lib/i18n/reports-copy";
import {
  REPORT_CENTER_CATEGORIES,
  REPORT_CENTER_ENTRIES,
  findReportCenterEntry,
  type ReportCenterEntry,
  type ReportCenterIcon,
} from "@/features/reports/report-center-catalog";
import {
  readReportCenterFavorites,
  readReportCenterRecent,
  toggleReportCenterFavorite,
} from "@/features/reports/report-center-prefs";

const ICON_MAP: Record<ReportCenterIcon, LucideIcon> = {
  "alert-triangle": AlertTriangle,
  "arrow-left-right": ArrowLeftRight,
  "arrow-up-down": ArrowUpDown,
  banknote: Banknote,
  "calendar-days": CalendarDays,
  "calendar-range": CalendarRange,
  "clipboard-list": ClipboardList,
  history: History,
  package: Package,
  receipt: Receipt,
  scale: Scale,
  tags: Tags,
  "trending-up": TrendingUp,
  "undo-2": Undo2,
  wallet: Wallet,
  warehouse: Warehouse,
};

function matchesQuery(entry: ReportCenterEntry, query: string, locale: SupportedLocale) {
  if (!query) return true;
  const haystack = [
    tReports(entry.titleKey, locale),
    tReports(entry.descriptionKey, locale),
    tReports(entry.categoryId === "sales" ? "salesReports" : entry.categoryId === "shifts" ? "shiftReports" : entry.categoryId === "products" ? "productReports" : "inventoryReports", locale),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function ReportChip({
  entry,
  locale,
}: {
  entry: ReportCenterEntry;
  locale: SupportedLocale;
}) {
  const Icon = ICON_MAP[entry.icon];
  return (
    <Link
      className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-sm hover:border-primary"
      href={entry.href}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
      <span className="truncate">{tReports(entry.titleKey, locale)}</span>
    </Link>
  );
}

function ReportCard({
  entry,
  favorite,
  locale,
  onToggleFavorite,
}: {
  entry: ReportCenterEntry;
  favorite: boolean;
  locale: SupportedLocale;
  onToggleFavorite: (id: string) => void;
}) {
  const Icon = ICON_MAP[entry.icon];
  const categoryTitle =
    entry.categoryId === "sales"
      ? tReports("salesReports", locale)
      : entry.categoryId === "shifts"
        ? tReports("shiftReports", locale)
        : entry.categoryId === "products"
          ? tReports("productReports", locale)
          : tReports("inventoryReports", locale);
  const available = Boolean(entry.reuse);
  return (
    <div className="relative rounded-lg border border-border bg-card transition hover:border-primary">
      <Link className="flex min-w-0 items-start gap-4 p-4 pr-12" href={entry.href}>
        <div className="grid size-11 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
          <Icon aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">{tReports(entry.titleKey, locale)}</h3>
            <span className="rounded-full bg-background px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {available ? tReports("reportReady", locale) : tReports("reportComing", locale)}
            </span>
          </div>
          <p className="mt-1 text-xs font-medium text-muted-foreground">{categoryTitle}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{tReports(entry.descriptionKey, locale)}</p>
        </div>
      </Link>
      <button
        aria-label={favorite ? tReports("unfavorite", locale) : tReports("favorites", locale)}
        aria-pressed={favorite}
        className="absolute right-3 top-3 grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-primary"
        type="button"
        onClick={() => onToggleFavorite(entry.id)}
      >
        <Star aria-hidden="true" className={favorite ? "size-4 fill-primary text-primary" : "size-4"} />
      </button>
    </div>
  );
}

export function ReportCenterClient({ locale: localeProp }: { locale?: SupportedLocale }) {
  const locale = useAppLocale(localeProp);
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const normalizedQuery = query.trim().toLowerCase();

  useEffect(() => {
    setFavorites(readReportCenterFavorites());
    setRecent(readReportCenterRecent());
  }, [pathname]);

  const favoriteEntries = useMemo(
    () => favorites.map((id) => findReportCenterEntry(id)).filter((entry): entry is ReportCenterEntry => Boolean(entry)),
    [favorites],
  );
  const recentEntries = useMemo(
    () => recent.map((id) => findReportCenterEntry(id)).filter((entry): entry is ReportCenterEntry => Boolean(entry)),
    [recent],
  );

  function handleToggleFavorite(id: string) {
    setFavorites(toggleReportCenterFavorite(id));
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-primary">{tReports("reportCenter", locale)}</p>
            <h1 className="mt-2 text-3xl font-semibold">{tReports("reports", locale)}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{tReports("centerSubtitle", locale)}</p>
          </div>
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-semibold hover:border-primary"
            href="/reports/analytics"
          >
            {tReports("analyticsHubLink", locale)}
          </Link>
        </div>
        <label className="relative mt-5 block">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="field-input h-11 pl-10"
            placeholder={tReports("searchReports", locale)}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </section>

      {favoriteEntries.length > 0 ? (
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">{tReports("favoriteReports", locale)}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {favoriteEntries.map((entry) => (
              <ReportChip entry={entry} key={entry.id} locale={locale} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">{tReports("recentReports", locale)}</h2>
        {recentEntries.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {recentEntries.map((entry) => (
              <ReportChip entry={entry} key={entry.id} locale={locale} />
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{tReports("noRecent", locale)}</p>
        )}
      </section>

      {REPORT_CENTER_CATEGORIES.map((category) => {
        const entries = REPORT_CENTER_ENTRIES.filter(
          (entry) => entry.categoryId === category.id && matchesQuery(entry, normalizedQuery, locale),
        );
        if (entries.length === 0) return null;
        return (
          <section className="flex min-w-0 flex-col gap-3" key={category.id}>
            <div>
              <h2 className="text-lg font-semibold">{tReports(category.titleKey, locale)}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{tReports(category.descriptionKey, locale)}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {entries.map((entry) => (
                <ReportCard
                  entry={entry}
                  favorite={favorites.includes(entry.id)}
                  key={entry.id}
                  locale={locale}
                  onToggleFavorite={handleToggleFavorite}
                />
              ))}
            </div>
          </section>
        );
      })}

      {normalizedQuery &&
      REPORT_CENTER_ENTRIES.every((entry) => !matchesQuery(entry, normalizedQuery, locale)) ? (
        <p className="text-sm text-muted-foreground">{tReports("noReportsFound", locale)}</p>
      ) : null}
    </div>
  );
}
