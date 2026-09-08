"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import type { SupportedLocale } from "@/lib/constants";
import { formatLak, formatNumber } from "@/features/reports/format";
import { tReports } from "@/lib/i18n/reports-copy";
import { useAppLocale } from "@/lib/i18n/use-app-locale";

export function ReportHeader({
  description,
  descriptionKey,
  locale: localeProp,
  title,
  titleKey,
}: {
  description: string;
  descriptionKey?: string;
  locale?: SupportedLocale;
  title: string;
  titleKey?: string;
}) {
  const locale = useAppLocale(localeProp);
  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <p className="text-sm font-medium text-primary">{tReports("reportsAnalytics", locale)}</p>
      <h1 className="mt-2 text-3xl font-semibold">{titleKey ? tReports(titleKey, locale) : title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
        {descriptionKey ? tReports(descriptionKey, locale) : description}
      </p>
    </section>
  );
}

export function MetricCard({
  icon: Icon,
  label,
  labelKey,
  value,
}: {
  icon: LucideIcon;
  label: string;
  labelKey?: string;
  value: string;
}) {
  const locale = useAppLocale();
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm text-muted-foreground">{labelKey ? tReports(labelKey, locale) : label}</div>
          <div className="mt-2 text-2xl font-semibold">{value}</div>
        </div>
        <div className="grid size-11 place-items-center rounded-md bg-primary/10 text-primary">
          <Icon aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

export function ReportLinkCard({
  description,
  href,
  icon: Icon,
  title,
}: {
  description: string;
  href: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <Link
      className="rounded-lg border border-border bg-card p-5 transition hover:border-primary"
      href={href}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="grid size-11 place-items-center rounded-md bg-primary/10 text-primary">
          <Icon aria-hidden="true" />
        </div>
        <ArrowRight className="text-muted-foreground" aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </Link>
  );
}

export function BarChart({
  labelKey = "label",
  rows,
  title,
  titleKey,
  valueKey,
  valueType = "lak",
}: {
  labelKey?: string;
  rows: Array<Record<string, number | string>>;
  title: string;
  titleKey?: string;
  valueKey: string;
  valueType?: "lak" | "number";
}) {
  const locale = useAppLocale();
  const maxValue = Math.max(...rows.map((row) => Number(row[valueKey])), 1);

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">{titleKey ? tReports(titleKey, locale) : title}</h2>
      <div className="mt-5 flex flex-col gap-4">
        {rows.map((row) => {
          const value = Number(row[valueKey]);
          const width = Math.max((value / maxValue) * 100, 4);

          return (
            <div key={String(row[labelKey])}>
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">{String(row[labelKey])}</span>
                <span className="text-muted-foreground">
                  {valueType === "lak" ? `${formatLak(value)} LAK` : formatNumber(value)}
                </span>
              </div>
              <div className="h-3 rounded-full bg-background">
                <div
                  className="h-3 rounded-full bg-primary"
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function DataTable({
  columnKeys,
  columns,
  rows,
}: {
  columnKeys?: string[];
  columns: string[];
  rows: Array<Array<React.ReactNode>>;
}) {
  const locale = useAppLocale();
  const headers = columnKeys?.map((key) => tReports(key, locale)) ?? columns;
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-border bg-background text-xs uppercase text-muted-foreground">
            <tr>
              {headers.map((column) => (
                <th className="px-4 py-3 font-semibold" key={column}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr className="border-b border-border last:border-b-0" key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td className="px-4 py-4" key={cellIndex}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
