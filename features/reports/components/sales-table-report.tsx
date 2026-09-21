"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import type { SupportedLocale } from "@/lib/constants";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import { fillReportsCopy, paymentMethodLabel, tReports } from "@/lib/i18n/reports-copy";
import { formatLak, formatNumber } from "@/features/reports/format";
import { businessDayLabel, formatBusinessDateTimeLabel, formatBusinessTimeLabel } from "@/lib/datetime/business-timezone";
import { ReportDetailHeader, ReportPageChrome, ReportSheet } from "@/features/reports/components/report-page-shell";
import { findReportCenterEntry } from "@/features/reports/report-center-catalog";
import { REPORT_CENTER_ICON_MAP } from "@/features/reports/report-center-icons";
import type { ReportFilterOptions } from "@/features/reports/report-filters";
import {
  SALES_TABLE_PAYMENT_METHODS,
  SALES_TABLE_STATUSES,
  saleStatusCopyKey,
} from "@/features/reports/sales-table-math";
import { salesTableExportHref, salesTableHref, type SalesTableDatePreset, type SalesTableQuery } from "@/features/reports/sales-table-query";
import type {
  DailySalesTableResult,
  MonthlySalesTableResult,
  PaymentMethodTableResult,
} from "@/features/reports/sales-table-repository";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const fieldClass = `h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 ${focusRing}`;
const numClass = "text-right tabular-nums";
const gridTable = "w-full border-separate border-spacing-0 text-sm text-zinc-900";
const thCell = "border border-zinc-300 bg-zinc-100 px-2.5 py-2 align-middle text-xs font-semibold uppercase tracking-wide text-zinc-700";
const tdCell = "border border-zinc-300 bg-white px-2.5 py-1.5 align-middle text-zinc-900 group-hover:bg-zinc-50";
const tdTotal = "border border-zinc-300 border-t-2 border-t-zinc-500 bg-zinc-100 px-2.5 py-2 align-middle font-semibold text-zinc-900";
const thSticky = `${thCell} sticky left-0 z-30`;
const tdSticky = `${tdCell} sticky left-0 z-10 group-hover:bg-zinc-50`;
const tdTotalSticky = `${tdTotal} sticky left-0 z-10`;

function t(key: string, locale: SupportedLocale) {
  return tReports(key, locale);
}

function businessDateInputValue(query: SalesTableQuery) {
  if (query.date) return query.date;
  if (!query.dateFrom) return "";
  const parsed = query.dateFrom instanceof Date ? query.dateFrom : new Date(query.dateFrom);
  if (Number.isNaN(parsed.getTime())) return "";
  return businessDayLabel(parsed);
}

function moneyCell(value: number) {
  return formatLak(value);
}

function SortLink({
  active,
  children,
  dir,
  href,
}: {
  active: boolean;
  children: ReactNode;
  dir: "asc" | "desc";
  href: string;
}) {
  return (
    <Link className={`inline-flex max-w-full items-center gap-1 whitespace-nowrap hover:text-zinc-900 ${focusRing} ${active ? "text-zinc-900" : ""}`} href={href}>
      {children}
      {active ? <span aria-hidden="true" className="shrink-0">{dir === "asc" ? "↑" : "↓"}</span> : null}
    </Link>
  );
}

function FilterSelect({
  id,
  label,
  name,
  options,
  value,
}: {
  id: string;
  label: string;
  name: string;
  options: Array<{ label: string; value: string }>;
  value?: string;
}) {
  return (
    <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor={id}>
      {label}
      <select className={fieldClass} defaultValue={value ?? ""} id={id} name={name}>
        {options.map((option) => (
          <option key={option.value || "all"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SalesTableFilters({
  defaults,
  exportHref,
  extra,
  filterOptions,
  locale,
  pathname,
  query,
  showMonth,
  showPayment,
  showReceipt,
  showStatus,
}: {
  defaults: { datePreset: SalesTableDatePreset };
  exportHref?: string;
  extra?: ReactNode;
  filterOptions: ReportFilterOptions;
  locale: SupportedLocale;
  pathname: string;
  query: SalesTableQuery;
  showMonth?: boolean;
  showPayment?: boolean;
  showReceipt?: boolean;
  showStatus?: boolean;
}) {
  const dateValue = businessDateInputValue(query);
  const customDate = query.datePreset === "custom" && !showMonth ? dateValue : query.date ?? "";

  return (
    <form
      action={pathname}
      className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-3 sm:p-4"
      method="get"
    >
      <div className="flex flex-wrap gap-3">
        {showMonth ? (
          <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="sales-month">
            {t("month", locale)}
            <input
              className={fieldClass}
              defaultValue={query.month}
              id="sales-month"
              name="month"
              type="month"
            />
          </label>
        ) : (
          <>
            <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="sales-preset">
              {t("dateRange", locale)}
              <select className={fieldClass} defaultValue={query.date ? "custom" : query.datePreset} id="sales-preset" name="datePreset">
                <option value="today">{t("today", locale)}</option>
                <option value="yesterday">{t("yesterday", locale)}</option>
                {pathname.includes("payment-methods") ? <option value="this_month">{t("thisMonth", locale)}</option> : null}
                <option value="custom">{t("custom", locale)}</option>
              </select>
            </label>
            <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="sales-date">
              {t("date", locale)}
              <input className={fieldClass} defaultValue={customDate || dateValue || ""} id="sales-date" name="date" type="date" />
            </label>
          </>
        )}
        <FilterSelect
          id="sales-branch"
          label={t("branch", locale)}
          name="branchId"
          options={[
            { label: t("allBranches", locale), value: "" },
            ...filterOptions.branches.map((row) => ({ label: row.label, value: row.id })),
          ]}
          value={query.branchId}
        />
        <FilterSelect
          id="sales-cashier"
          label={t("cashier", locale)}
          name="cashierId"
          options={[
            { label: t("allCashiers", locale), value: "" },
            ...filterOptions.cashiers.map((row) => ({ label: row.label, value: row.id })),
          ]}
          value={query.cashierId}
        />
        {showPayment ? (
          <FilterSelect
            id="sales-payment"
            label={t("paymentMethod", locale)}
            name="paymentMethod"
            options={[
              { label: t("allPaymentMethods", locale), value: "" },
              ...SALES_TABLE_PAYMENT_METHODS.map((method) => ({
                label: paymentMethodLabel(method, locale),
                value: method,
              })),
            ]}
            value={query.paymentMethod}
          />
        ) : null}
        {showStatus ? (
          <FilterSelect
            id="sales-status"
            label={t("status", locale)}
            name="status"
            options={[
              { label: t("allStatuses", locale), value: "" },
              ...SALES_TABLE_STATUSES.map((status) => ({
                label: t(saleStatusCopyKey(status), locale),
                value: status,
              })),
            ]}
            value={query.status}
          />
        ) : null}
        {showReceipt ? (
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="sales-receipt">
            {t("receiptSearch", locale)}
            <input
              className={fieldClass}
              defaultValue={query.receiptQuery ?? ""}
              id="sales-receipt"
              name="q"
              placeholder={t("searchReceiptPlaceholder", locale)}
            />
          </label>
        ) : null}
        {extra}
      </div>
      <div className="flex flex-wrap gap-2">
        <button className={`inline-flex h-10 items-center rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white ${focusRing}`} type="submit">
          {t("apply", locale)}
        </button>
        <Link className={`inline-flex h-10 items-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 ${focusRing}`} href={pathname}>
          {t("clear", locale)}
        </Link>
        {exportHref ? <ExportExcelButton href={exportHref} locale={locale} /> : null}
      </div>
    </form>
  );
}

function ExportExcelButton({ href, locale }: { href: string; locale: SupportedLocale }) {
  const [state, setState] = useState<"idle" | "exporting" | "done" | "error">("idle");

  async function onExport() {
    setState("exporting");
    try {
      const response = await fetch(href);
      if (!response.ok) throw new Error("export");
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
      const quoted = /filename="([^"]+)"/i.exec(disposition);
      const filename = decodeURIComponent((encoded?.[1] || quoted?.[1] || "EGO-POS-Report.xlsx").trim());
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = filename;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setState("done");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        className={`inline-flex h-10 items-center rounded-md border border-zinc-800 px-4 text-sm font-semibold text-zinc-900 disabled:opacity-60 ${focusRing}`}
        disabled={state === "exporting"}
        onClick={onExport}
        type="button"
      >
        {state === "exporting" ? t("exporting", locale) : t("exportExcel", locale)}
      </button>
      {state === "done" ? <span className="text-sm text-zinc-600">{t("exportComplete", locale)}</span> : null}
      {state === "error" ? <span className="text-sm text-red-700">{t("exportFailed", locale)}</span> : null}
    </div>
  );
}

function SummaryStrip({
  items,
}: {
  items: Array<{ key: string; label: string; value: string }>;
}) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => (
        <div className="bg-white px-3 py-2" key={item.key}>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{item.label}</dt>
          <dd className="mt-1 text-sm font-semibold tabular-nums text-zinc-900">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Spreadsheet({
  children,
  empty,
  locale,
}: {
  children: ReactNode;
  empty?: boolean;
  locale: SupportedLocale;
}) {
  if (empty) {
    return (
      <div className="px-4 py-12 text-center text-sm text-zinc-500">{t("emptySalesTable", locale)}</div>
    );
  }
  return (
    <div className="-mx-6 overflow-x-auto sm:-mx-8">
      {children}
    </div>
  );
}

function Pager({
  locale,
  nextHref,
  page,
  pageCount,
  prevHref,
}: {
  locale: SupportedLocale;
  nextHref?: string;
  page: number;
  pageCount: number;
  prevHref?: string;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-600">
      <span>{fillReportsCopy(tReports("pageOf", locale), { page, pages: pageCount })}</span>
      <div className="flex gap-2">
        {prevHref ? (
          <Link className={`rounded-md border border-zinc-300 px-3 py-1.5 ${focusRing}`} href={prevHref}>
            {t("previous", locale)}
          </Link>
        ) : null}
        {nextHref ? (
          <Link className={`rounded-md border border-zinc-300 px-3 py-1.5 ${focusRing}`} href={nextHref}>
            {t("next", locale)}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function SaleDetailDrawer({
  locale,
  onClose,
  saleId,
}: {
  locale: SupportedLocale;
  onClose: () => void;
  saleId: string;
}) {
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [sale, setSale] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetch(`/api/reports/sales/${saleId}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !body?.ok) throw new Error("missing");
        if (!cancelled) {
          setSale(body.data);
          setState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [saleId]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <aside className="flex h-full w-full max-w-md flex-col bg-white text-zinc-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <h2 className="text-base font-semibold">{t("saleDetail", locale)}</h2>
          <button aria-label={t("close", locale)} className={`inline-flex size-10 items-center justify-center rounded-md ${focusRing}`} onClick={onClose} type="button">
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 text-sm">
          {state === "loading" ? <p>{t("loadingSalesTable", locale)}</p> : null}
          {state === "error" ? <p>{t("errorSalesTable", locale)}</p> : null}
          {state === "ready" && sale ? (
            <div className="flex flex-col gap-3">
              <p><span className="text-zinc-500">{t("colReceipt", locale)}:</span> {sale.receiptNo || sale.saleNo}</p>
              <p><span className="text-zinc-500">{t("cashier", locale)}:</span> {sale.cashierName}</p>
              <p><span className="text-zinc-500">{t("colStatus", locale)}:</span> {t(saleStatusCopyKey(String(sale.status ?? "")), locale)}</p>
              <p><span className="text-zinc-500">{t("colSaleTotal", locale)}:</span> {formatLak(Number(sale.totalAmount ?? 0))}</p>
              <ul className="mt-2 divide-y divide-zinc-200 border-y border-zinc-200">
                {(sale.items ?? []).map((item: Record<string, any>) => (
                  <li className="flex justify-between gap-3 py-2" key={item.id}>
                    <span>{item.nameEn || item.nameLo}</span>
                    <span className="tabular-nums">{item.quantity} × {formatLak(Number(item.priceLak ?? 0))}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function ReportFrame({
  children,
  entryId,
  error,
  locale,
}: {
  children?: ReactNode;
  entryId: string;
  error?: string;
  locale: SupportedLocale;
}) {
  const entry = findReportCenterEntry(entryId);
  if (!entry) return null;
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <ReportPageChrome entry={entry} locale={locale} />
      <ReportDetailHeader
        descriptionKey={entry.descriptionKey}
        icon={REPORT_CENTER_ICON_MAP[entry.icon]}
        locale={locale}
        titleKey={entry.titleKey}
      />
      {error ? (
        <ReportSheet>
          <p className="py-8 text-center text-sm text-zinc-600">{t("errorSalesTable", locale)}</p>
        </ReportSheet>
      ) : children}
    </div>
  );
}

export function DailySalesReportView({
  data,
  error,
  locale: localeProp,
}: {
  data?: DailySalesTableResult;
  error?: string;
  locale?: SupportedLocale;
}) {
  const locale = useAppLocale(localeProp);
  const router = useRouter();
  const pathname = "/reports/sales/daily";
  const defaults = { datePreset: "today" as const };
  const query = data?.query;
  const [saleId, setSaleId] = useState(data?.query.saleId ?? "");

  const sortHref = (sort: string) => {
    if (!query) return pathname;
    const dir = query.sort === sort && query.dir === "desc" ? "asc" : "desc";
    return salesTableHref(pathname, query, defaults, { sort, dir, page: 1 });
  };

  const summaryItems = useMemo(() => {
    if (!data) return [];
    const items = [
      { key: "bills", label: t("bills", locale), value: formatNumber(data.summary.bills) },
      { key: "items", label: t("itemsSold", locale), value: formatNumber(data.summary.itemsSold) },
      { key: "gross", label: t("grossSales", locale), value: moneyCell(data.summary.grossLak) },
      { key: "discount", label: t("discounts", locale), value: moneyCell(data.summary.discountLak) },
      { key: "refunds", label: t("refunds", locale), value: moneyCell(data.summary.refundLak) },
      { key: "voids", label: t("voids", locale), value: moneyCell(data.summary.voidLak) },
      { key: "net", label: t("netSales", locale), value: moneyCell(data.summary.netLak) },
    ];
    if (data.showCostProfit) {
      items.push(
        { key: "cost", label: t("cost", locale), value: moneyCell(data.summary.costLak) },
        { key: "profit", label: t("profit", locale), value: moneyCell(data.summary.profitLak) },
      );
    }
    return items;
  }, [data, locale]);

  return (
    <ReportFrame entryId="sales-daily" error={error} locale={locale}>
      {data && query ? (
        <>
          <SalesTableFilters
            defaults={defaults}
            exportHref={salesTableExportHref("daily", query, defaults)}
            filterOptions={data.filterOptions}
            locale={locale}
            pathname={pathname}
            query={query}
            showPayment
            showReceipt
            showStatus
          />
          <SummaryStrip items={summaryItems} />
          <ReportSheet>
            <Spreadsheet empty={data.rows.length === 0} locale={locale}>
              <table className={`${gridTable} min-w-[1100px]`}>
                <thead className="sticky top-0 z-20">
                  <tr>
                    <th className={thSticky}>{t("colNo", locale)}</th>
                    <th className={thCell}>
                      <SortLink active={query.sort === "time" || !query.sort} dir={query.dir} href={sortHref("time")}>{t("colTime", locale)}</SortLink>
                    </th>
                    <th className={thCell}><SortLink active={query.sort === "receipt"} dir={query.dir} href={sortHref("receipt")}>{t("colReceipt", locale)}</SortLink></th>
                    <th className={thCell}><SortLink active={query.sort === "cashier"} dir={query.dir} href={sortHref("cashier")}>{t("cashier", locale)}</SortLink></th>
                    <th className={`${thCell} ${numClass}`}><SortLink active={query.sort === "items"} dir={query.dir} href={sortHref("items")}>{t("colItems", locale)}</SortLink></th>
                    <th className={`${thCell} ${numClass}`}><SortLink active={query.sort === "gross"} dir={query.dir} href={sortHref("gross")}>{t("colGross", locale)}</SortLink></th>
                    <th className={`${thCell} ${numClass}`}><SortLink active={query.sort === "discount"} dir={query.dir} href={sortHref("discount")}>{t("colDiscount", locale)}</SortLink></th>
                    <th className={`${thCell} ${numClass}`}><SortLink active={query.sort === "refund"} dir={query.dir} href={sortHref("refund")}>{t("colRefund", locale)}</SortLink></th>
                    <th className={`${thCell} ${numClass}`}><SortLink active={query.sort === "void"} dir={query.dir} href={sortHref("void")}>{t("colVoid", locale)}</SortLink></th>
                    <th className={`${thCell} ${numClass}`}><SortLink active={query.sort === "net"} dir={query.dir} href={sortHref("net")}>{t("colNet", locale)}</SortLink></th>
                    <th className={thCell}><SortLink active={query.sort === "payment"} dir={query.dir} href={sortHref("payment")}>{t("colPayment", locale)}</SortLink></th>
                    {data.showCostProfit ? (
                      <>
                        <th className={`${thCell} ${numClass}`}><SortLink active={query.sort === "cost"} dir={query.dir} href={sortHref("cost")}>{t("colCost", locale)}</SortLink></th>
                        <th className={`${thCell} ${numClass}`}><SortLink active={query.sort === "profit"} dir={query.dir} href={sortHref("profit")}>{t("colProfit", locale)}</SortLink></th>
                      </>
                    ) : null}
                    <th className={`${thCell} text-center`}><SortLink active={query.sort === "status"} dir={query.dir} href={sortHref("status")}>{t("colStatus", locale)}</SortLink></th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, index) => (
                    <tr className="group hover:bg-zinc-50" key={row.id}>
                      <td className={tdSticky}>{(data.page - 1) * data.pageSize + index + 1}</td>
                      <td className={`${tdCell} whitespace-nowrap`}>{formatBusinessTimeLabel(row.createdAt)}</td>
                      <td className={tdCell}>
                        <Link
                          className={`font-medium text-primary underline-offset-2 hover:underline ${focusRing}`}
                          href={salesTableHref(pathname, query, defaults, { saleId: row.id })}
                          onClick={(event) => {
                            event.preventDefault();
                            setSaleId(row.id);
                            router.replace(salesTableHref(pathname, query, defaults, { saleId: row.id }), { scroll: false });
                          }}
                        >
                          {row.receipt}
                        </Link>
                      </td>
                      <td className={tdCell}>{row.cashierName}</td>
                      <td className={`${tdCell} ${numClass}`}>{formatNumber(row.items)}</td>
                      <td className={`${tdCell} ${numClass}`}>{moneyCell(row.grossLak)}</td>
                      <td className={`${tdCell} ${numClass}`}>{moneyCell(row.discountLak)}</td>
                      <td className={`${tdCell} ${numClass}`}>{moneyCell(row.refundLak)}</td>
                      <td className={`${tdCell} ${numClass}`}>{moneyCell(row.voidLak)}</td>
                      <td className={`${tdCell} ${numClass}`}>{moneyCell(row.netLak)}</td>
                      <td className={tdCell}>{row.paymentMethods.map((method) => paymentMethodLabel(method, locale)).join(" + ")}</td>
                      {data.showCostProfit ? (
                        <>
                          <td className={`${tdCell} ${numClass}`}>{moneyCell(row.costLak)}</td>
                          <td className={`${tdCell} ${numClass}`}>{moneyCell(row.profitLak)}</td>
                        </>
                      ) : null}
                      <td className={`${tdCell} text-center`}>{t(saleStatusCopyKey(row.status), locale)}</td>
                    </tr>
                  ))}
                  {data.rows.length > 0 ? (
                    <tr>
                      <td className={tdTotalSticky}>{t("total", locale)}</td>
                      <td className={tdTotal} />
                      <td className={tdTotal} />
                      <td className={tdTotal} />
                      <td className={`${tdTotal} ${numClass}`}>{formatNumber(data.totalRow.items)}</td>
                      <td className={`${tdTotal} ${numClass}`}>{moneyCell(data.totalRow.grossLak)}</td>
                      <td className={`${tdTotal} ${numClass}`}>{moneyCell(data.totalRow.discountLak)}</td>
                      <td className={`${tdTotal} ${numClass}`}>{moneyCell(data.totalRow.refundLak)}</td>
                      <td className={`${tdTotal} ${numClass}`}>{moneyCell(data.totalRow.voidLak)}</td>
                      <td className={`${tdTotal} ${numClass}`}>{moneyCell(data.totalRow.netLak)}</td>
                      <td className={tdTotal} />
                      {data.showCostProfit ? (
                        <>
                          <td className={`${tdTotal} ${numClass}`}>{moneyCell(data.totalRow.costLak)}</td>
                          <td className={`${tdTotal} ${numClass}`}>{moneyCell(data.totalRow.profitLak)}</td>
                        </>
                      ) : null}
                      <td className={tdTotal} />
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </Spreadsheet>
            <Pager
              locale={locale}
              nextHref={data.page < data.pageCount ? salesTableHref(pathname, query, defaults, { page: data.page + 1 }) : undefined}
              page={data.page}
              pageCount={data.pageCount}
              prevHref={data.page > 1 ? salesTableHref(pathname, query, defaults, { page: data.page - 1 }) : undefined}
            />
          </ReportSheet>
          {saleId ? (
            <SaleDetailDrawer
              locale={locale}
              onClose={() => {
                setSaleId("");
                router.replace(salesTableHref(pathname, { ...query, saleId: undefined }, defaults), { scroll: false });
              }}
              saleId={saleId}
            />
          ) : null}
        </>
      ) : null}
    </ReportFrame>
  );
}

export function MonthlySalesReportView({
  data,
  error,
  locale: localeProp,
}: {
  data?: MonthlySalesTableResult;
  error?: string;
  locale?: SupportedLocale;
}) {
  const locale = useAppLocale(localeProp);
  const pathname = "/reports/sales/monthly";
  const defaults = { datePreset: "this_month" as const };
  if (error || !data) {
    return <ReportFrame entryId="sales-monthly" error={error ?? "missing"} locale={locale} />;
  }
  const summaryItems = [
    { key: "bills", label: t("totalBills", locale), value: formatNumber(data.summary.bills) },
    { key: "items", label: t("totalItems", locale), value: formatNumber(data.summary.itemsSold) },
    { key: "gross", label: t("grossSales", locale), value: moneyCell(data.summary.grossLak) },
    { key: "discount", label: t("discounts", locale), value: moneyCell(data.summary.discountLak) },
    { key: "refunds", label: t("refunds", locale), value: moneyCell(data.summary.refundLak) },
    { key: "voids", label: t("voids", locale), value: moneyCell(data.summary.voidLak) },
    { key: "net", label: t("netSales", locale), value: moneyCell(data.summary.netLak) },
    ...(data.showCostProfit
      ? [
          { key: "cost", label: t("cost", locale), value: moneyCell(data.summary.costLak) },
          { key: "profit", label: t("profit", locale), value: moneyCell(data.summary.profitLak) },
        ]
      : []),
  ];

  return (
    <ReportFrame entryId="sales-monthly" locale={locale}>
      <SalesTableFilters
        defaults={defaults}
        exportHref={salesTableExportHref("monthly", data.query, defaults)}
        filterOptions={data.filterOptions}
        locale={locale}
        pathname={pathname}
        query={data.query}
        showMonth
      />
      <SummaryStrip items={summaryItems} />
      <ReportSheet>
        <Spreadsheet empty={data.rows.length === 0} locale={locale}>
          <table className={`${gridTable} min-w-[1100px]`}>
            <thead className="sticky top-0 z-20">
              <tr>
                <th className={thSticky}>{t("colDate", locale)}</th>
                <th className={`${thCell} ${numClass}`}>{t("bills", locale)}</th>
                <th className={`${thCell} ${numClass}`}>{t("colItems", locale)}</th>
                <th className={`${thCell} ${numClass}`}>{t("colGross", locale)}</th>
                <th className={`${thCell} ${numClass}`}>{t("colDiscount", locale)}</th>
                <th className={`${thCell} ${numClass}`}>{t("colRefund", locale)}</th>
                <th className={`${thCell} ${numClass}`}>{t("colVoid", locale)}</th>
                <th className={`${thCell} ${numClass}`}>{t("netSales", locale)}</th>
                <th className={`${thCell} ${numClass}`}>{t("paymentCash", locale)}</th>
                <th className={`${thCell} ${numClass}`}>{t("paymentQr", locale)}</th>
                <th className={`${thCell} ${numClass}`}>{t("paymentTransfer", locale)}</th>
                <th className={`${thCell} ${numClass}`}>{t("paymentCard", locale)}</th>
                {data.showCostProfit ? (
                  <>
                    <th className={`${thCell} ${numClass}`}>{t("colCost", locale)}</th>
                    <th className={`${thCell} ${numClass}`}>{t("colProfit", locale)}</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr className="group hover:bg-zinc-50" key={row.date}>
                  <td className={tdSticky}>
                    <Link className={`font-medium text-primary underline-offset-2 hover:underline ${focusRing}`} href={`/reports/sales/daily?date=${row.date}`}>
                      {row.date}
                    </Link>
                  </td>
                  <td className={`${tdCell} ${numClass}`}>{formatNumber(row.bills)}</td>
                  <td className={`${tdCell} ${numClass}`}>{formatNumber(row.itemsSold)}</td>
                  <td className={`${tdCell} ${numClass}`}>{moneyCell(row.grossLak)}</td>
                  <td className={`${tdCell} ${numClass}`}>{moneyCell(row.discountLak)}</td>
                  <td className={`${tdCell} ${numClass}`}>{moneyCell(row.refundLak)}</td>
                  <td className={`${tdCell} ${numClass}`}>{moneyCell(row.voidLak)}</td>
                  <td className={`${tdCell} ${numClass}`}>{moneyCell(row.netLak)}</td>
                  <td className={`${tdCell} ${numClass}`}>{moneyCell(row.cashLak)}</td>
                  <td className={`${tdCell} ${numClass}`}>{moneyCell(row.qrLak)}</td>
                  <td className={`${tdCell} ${numClass}`}>{moneyCell(row.transferLak)}</td>
                  <td className={`${tdCell} ${numClass}`}>{moneyCell(row.cardLak)}</td>
                  {data.showCostProfit ? (
                    <>
                      <td className={`${tdCell} ${numClass}`}>{moneyCell(row.costLak)}</td>
                      <td className={`${tdCell} ${numClass}`}>{moneyCell(row.profitLak)}</td>
                    </>
                  ) : null}
                </tr>
              ))}
              {data.rows.length > 0 ? (
                <tr>
                  <td className={tdTotalSticky}>{t("total", locale)}</td>
                  <td className={`${tdTotal} ${numClass}`}>{formatNumber(data.summary.bills)}</td>
                  <td className={`${tdTotal} ${numClass}`}>{formatNumber(data.summary.itemsSold)}</td>
                  <td className={`${tdTotal} ${numClass}`}>{moneyCell(data.summary.grossLak)}</td>
                  <td className={`${tdTotal} ${numClass}`}>{moneyCell(data.summary.discountLak)}</td>
                  <td className={`${tdTotal} ${numClass}`}>{moneyCell(data.summary.refundLak)}</td>
                  <td className={`${tdTotal} ${numClass}`}>{moneyCell(data.summary.voidLak)}</td>
                  <td className={`${tdTotal} ${numClass}`}>{moneyCell(data.summary.netLak)}</td>
                  <td className={`${tdTotal} ${numClass}`}>{moneyCell(data.summary.cashLak)}</td>
                  <td className={`${tdTotal} ${numClass}`}>{moneyCell(data.summary.qrLak)}</td>
                  <td className={`${tdTotal} ${numClass}`}>{moneyCell(data.summary.transferLak)}</td>
                  <td className={`${tdTotal} ${numClass}`}>{moneyCell(data.summary.cardLak)}</td>
                  {data.showCostProfit ? (
                    <>
                      <td className={`${tdTotal} ${numClass}`}>{moneyCell(data.summary.costLak)}</td>
                      <td className={`${tdTotal} ${numClass}`}>{moneyCell(data.summary.profitLak)}</td>
                    </>
                  ) : null}
                </tr>
              ) : null}
            </tbody>
          </table>
        </Spreadsheet>
      </ReportSheet>
    </ReportFrame>
  );
}

export function PaymentMethodSalesReportView({
  data,
  error,
  locale: localeProp,
}: {
  data?: PaymentMethodTableResult;
  error?: string;
  locale?: SupportedLocale;
}) {
  const locale = useAppLocale(localeProp);
  const router = useRouter();
  const pathname = "/reports/sales/payment-methods";
  const defaults = { datePreset: "today" as const };
  const [saleId, setSaleId] = useState(data?.query.saleId ?? "");
  if (error || !data) {
    return <ReportFrame entryId="sales-payment-methods" error={error ?? "missing"} locale={locale} />;
  }
  const query = data.query;
  const sortHref = (sort: string) => {
    const dir = query.sort === sort && query.dir === "desc" ? "asc" : "desc";
    return salesTableHref(pathname, query, defaults, { sort, dir, page: 1 });
  };
  const summaryItems = [
    { key: "cash", label: t("paymentCash", locale), value: moneyCell(data.summary.cashLak) },
    { key: "qr", label: t("paymentQr", locale), value: moneyCell(data.summary.qrLak) },
    { key: "transfer", label: t("paymentTransfer", locale), value: moneyCell(data.summary.transferLak) },
    { key: "visa", label: t("paymentVisa", locale), value: moneyCell(data.summary.visaLak) },
    { key: "mastercard", label: t("paymentMastercard", locale), value: moneyCell(data.summary.mastercardLak) },
    { key: "paid", label: t("totalPaid", locale), value: moneyCell(data.summary.totalPaidLak) },
    { key: "bills", label: t("bills", locale), value: formatNumber(data.summary.bills) },
  ];

  return (
    <ReportFrame entryId="sales-payment-methods" locale={locale}>
      <SalesTableFilters
        defaults={defaults}
        exportHref={salesTableExportHref("payment-methods", query, defaults)}
        filterOptions={data.filterOptions}
        locale={locale}
        pathname={pathname}
        query={query}
        showPayment
        showReceipt
        showStatus
      />
      <SummaryStrip items={summaryItems} />
      <ReportSheet>
        <Spreadsheet empty={data.rows.length === 0} locale={locale}>
          <table className={`${gridTable} min-w-[980px]`}>
            <thead className="sticky top-0 z-20">
              <tr>
                <th className={thSticky}>{t("colNo", locale)}</th>
                <th className={thCell}><SortLink active={!query.sort || query.sort === "time"} dir={query.dir} href={sortHref("time")}>{t("colDateTime", locale)}</SortLink></th>
                <th className={thCell}><SortLink active={query.sort === "receipt"} dir={query.dir} href={sortHref("receipt")}>{t("colReceipt", locale)}</SortLink></th>
                <th className={thCell}><SortLink active={query.sort === "cashier"} dir={query.dir} href={sortHref("cashier")}>{t("cashier", locale)}</SortLink></th>
                <th className={thCell}><SortLink active={query.sort === "paymentMethod"} dir={query.dir} href={sortHref("paymentMethod")}>{t("paymentMethod", locale)}</SortLink></th>
                <th className={`${thCell} ${numClass}`}><SortLink active={query.sort === "paymentAmount"} dir={query.dir} href={sortHref("paymentAmount")}>{t("colPaymentAmount", locale)}</SortLink></th>
                <th className={`${thCell} ${numClass}`}><SortLink active={query.sort === "saleTotal"} dir={query.dir} href={sortHref("saleTotal")}>{t("colSaleTotal", locale)}</SortLink></th>
                <th className={`${thCell} ${numClass}`}><SortLink active={query.sort === "refund"} dir={query.dir} href={sortHref("refund")}>{t("colRefundAmount", locale)}</SortLink></th>
                <th className={`${thCell} text-center`}><SortLink active={query.sort === "status"} dir={query.dir} href={sortHref("status")}>{t("colStatus", locale)}</SortLink></th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, index) => (
                <tr className="group hover:bg-zinc-50" key={row.id}>
                  <td className={tdSticky}>{(data.page - 1) * data.pageSize + index + 1}</td>
                  <td className={`${tdCell} whitespace-nowrap`}>{formatBusinessDateTimeLabel(row.createdAt)}</td>
                  <td className={tdCell}>
                    <Link
                      className={`font-medium text-primary underline-offset-2 hover:underline ${focusRing}`}
                      href={salesTableHref(pathname, query, defaults, { saleId: row.saleId })}
                      onClick={(event) => {
                        event.preventDefault();
                        setSaleId(row.saleId);
                        router.replace(salesTableHref(pathname, query, defaults, { saleId: row.saleId }), { scroll: false });
                      }}
                    >
                      {row.receipt}
                    </Link>
                  </td>
                  <td className={tdCell}>{row.cashierName}</td>
                  <td className={tdCell}>{paymentMethodLabel(row.paymentMethod, locale)}</td>
                  <td className={`${tdCell} ${numClass}`}>{moneyCell(row.paymentAmountLak)}</td>
                  <td className={`${tdCell} ${numClass}`}>{row.saleTotalLak ? moneyCell(row.saleTotalLak) : ""}</td>
                  <td className={`${tdCell} ${numClass}`}>{row.refundLak ? moneyCell(row.refundLak) : ""}</td>
                  <td className={`${tdCell} text-center`}>{t(saleStatusCopyKey(row.status), locale)}</td>
                </tr>
              ))}
              {data.rows.length > 0 ? (
                <tr>
                  <td className={tdTotalSticky}>{t("total", locale)}</td>
                  <td className={tdTotal} />
                  <td className={tdTotal} />
                  <td className={tdTotal} />
                  <td className={tdTotal} />
                  <td className={`${tdTotal} ${numClass}`}>{moneyCell(data.summary.totalPaidLak)}</td>
                  <td className={`${tdTotal} ${numClass}`}>{moneyCell(data.totalSaleLak)}</td>
                  <td className={`${tdTotal} ${numClass}`}>{moneyCell(data.totalRefundLak)}</td>
                  <td className={tdTotal} />
                </tr>
              ) : null}
            </tbody>
          </table>
        </Spreadsheet>
        <Pager
          locale={locale}
          nextHref={data.page < data.pageCount ? salesTableHref(pathname, query, defaults, { page: data.page + 1 }) : undefined}
          page={data.page}
          pageCount={data.pageCount}
          prevHref={data.page > 1 ? salesTableHref(pathname, query, defaults, { page: data.page - 1 }) : undefined}
        />
      </ReportSheet>
      {saleId ? (
        <SaleDetailDrawer
          locale={locale}
          onClose={() => {
            setSaleId("");
            router.replace(salesTableHref(pathname, { ...query, saleId: undefined }, defaults), { scroll: false });
          }}
          saleId={saleId}
        />
      ) : null}
    </ReportFrame>
  );
}
