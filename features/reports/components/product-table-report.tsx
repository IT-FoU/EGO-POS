"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import type { SupportedLocale } from "@/lib/constants";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import { fillReportsCopy, tReports } from "@/lib/i18n/reports-copy";
import { formatLak, formatNumber } from "@/features/reports/format";
import { formatBusinessDateTimeLabel } from "@/lib/datetime/business-timezone";
import { ReportDetailHeader, ReportPageChrome, ReportSheet } from "@/features/reports/components/report-page-shell";
import { findReportCenterEntry } from "@/features/reports/report-center-catalog";
import { REPORT_CENTER_ICON_MAP } from "@/features/reports/report-center-icons";
import type { ReportFilterOptions } from "@/features/reports/report-filters";
import { SALES_TABLE_STATUSES, saleStatusCopyKey } from "@/features/reports/sales-table-math";
import { PRODUCT_RANK_METRICS, PRODUCT_TOP_N_OPTIONS } from "@/features/reports/product-table-math";
import {
  productTableExportHref,
  productTableHref,
  type ProductTableDatePreset,
  type ProductTableQuery,
} from "@/features/reports/product-table-query";
import type {
  CategorySalesTableResult,
  ProductPerformanceResult,
  ProductSalesTableResult,
} from "@/features/reports/product-table-repository";

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

function money(value: number) {
  return formatLak(value);
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
          <p className="py-8 text-center text-sm text-zinc-600">{t("errorProductTable", locale)}</p>
        </ReportSheet>
      ) : children}
    </div>
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
      {active ? <span aria-hidden="true">{dir === "asc" ? "↑" : "↓"}</span> : null}
    </Link>
  );
}

function SummaryStrip({ items }: { items: Array<{ key: string; label: string; value: string }> }) {
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

function Spreadsheet({ children, empty, locale }: { children: ReactNode; empty?: boolean; locale: SupportedLocale }) {
  if (empty) {
    return <div className="px-4 py-12 text-center text-sm text-zinc-500">{t("emptyProductTable", locale)}</div>;
  }
  return <div className="-mx-6 overflow-x-auto sm:-mx-8">{children}</div>;
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
        {prevHref ? <Link className={`rounded-md border border-zinc-300 px-3 py-1.5 ${focusRing}`} href={prevHref}>{t("previous", locale)}</Link> : null}
        {nextHref ? <Link className={`rounded-md border border-zinc-300 px-3 py-1.5 ${focusRing}`} href={nextHref}>{t("next", locale)}</Link> : null}
      </div>
    </div>
  );
}

function ExportExcelButton({ href, locale }: { href: string; locale: SupportedLocale }) {
  return (
    <a className={`inline-flex h-10 items-center rounded-md border border-zinc-800 px-4 text-sm font-semibold text-zinc-900 ${focusRing}`} href={href}>
      {t("exportExcel", locale)}
    </a>
  );
}

function ProductFilters({
  defaults,
  extra,
  exportHref,
  filterOptions,
  locale,
  pathname,
  query,
  showPerformance,
  showProductSearch,
  showStatus,
}: {
  defaults: { datePreset: ProductTableDatePreset };
  extra?: ReactNode;
  exportHref: string;
  filterOptions: ReportFilterOptions;
  locale: SupportedLocale;
  pathname: string;
  query: ProductTableQuery;
  showPerformance?: boolean;
  showProductSearch?: boolean;
  showStatus?: boolean;
}) {
  const custom = query.datePreset === "custom";
  return (
    <form action={pathname} className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-3 sm:p-4" method="get">
      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="r3-preset">
          {t("dateRange", locale)}
          <select className={fieldClass} defaultValue={query.date ? "custom" : query.datePreset} id="r3-preset" name="datePreset">
            <option value="today">{t("today", locale)}</option>
            <option value="yesterday">{t("yesterday", locale)}</option>
            <option value="this_week">{t("thisWeek", locale)}</option>
            <option value="this_month">{t("thisMonth", locale)}</option>
            <option value="custom">{t("custom", locale)}</option>
          </select>
        </label>
        <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="r3-from">
          {t("from", locale)}
          <input className={fieldClass} defaultValue={query.date || (custom ? String(query.dateFrom ?? "").slice(0, 10) : "")} id="r3-from" name="dateFrom" type="date" />
        </label>
        <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="r3-to">
          {t("to", locale)}
          <input className={fieldClass} defaultValue={custom ? String(query.dateTo ?? "").slice(0, 10) : ""} id="r3-to" name="dateTo" type="date" />
        </label>
        <FilterSelect
          id="r3-branch"
          label={t("branch", locale)}
          name="branchId"
          options={[{ label: t("allBranches", locale), value: "" }, ...filterOptions.branches.map((row) => ({ label: row.label, value: row.id }))]}
          value={query.branchId}
        />
        <FilterSelect
          id="r3-category"
          label={t("category", locale)}
          name="categoryId"
          options={[{ label: t("allCategories", locale), value: "" }, ...filterOptions.categories.map((row) => ({ label: row.label, value: row.id }))]}
          value={query.categoryId}
        />
        <FilterSelect
          id="r3-cashier"
          label={t("cashier", locale)}
          name="cashierId"
          options={[{ label: t("allCashiers", locale), value: "" }, ...filterOptions.cashiers.map((row) => ({ label: row.label, value: row.id }))]}
          value={query.cashierId}
        />
        {showStatus ? (
          <FilterSelect
            id="r3-status"
            label={t("status", locale)}
            name="status"
            options={[
              { label: t("allStatuses", locale), value: "" },
              ...SALES_TABLE_STATUSES.map((status) => ({ label: t(saleStatusCopyKey(status), locale), value: status })),
            ]}
            value={query.status}
          />
        ) : null}
        {showProductSearch ? (
          <>
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="r3-product">
              {t("productSearch", locale)}
              <input className={fieldClass} defaultValue={query.productQuery ?? ""} id="r3-product" name="product" placeholder={t("searchProductPlaceholder", locale)} />
            </label>
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="r3-sku">
              {t("skuBarcodeSearch", locale)}
              <input className={fieldClass} defaultValue={query.skuQuery ?? ""} id="r3-sku" name="sku" placeholder={t("searchSkuBarcodePlaceholder", locale)} />
            </label>
          </>
        ) : null}
        {showPerformance ? (
          <>
            <FilterSelect
              id="r3-view"
              label={t("performanceView", locale)}
              name="view"
              options={[
                { label: t("bestSellers", locale), value: "best" },
                { label: t("slowSellers", locale), value: "slow" },
              ]}
              value={query.view}
            />
            <FilterSelect
              id="r3-metric"
              label={t("rankMetric", locale)}
              name="metric"
              options={PRODUCT_RANK_METRICS.map((metric) => ({ label: t(`rank_${metric}`, locale), value: metric }))}
              value={query.rankMetric}
            />
            <FilterSelect
              id="r3-topn"
              label={t("topN", locale)}
              name="topN"
              options={PRODUCT_TOP_N_OPTIONS.map((value) => ({ label: String(value), value: String(value) }))}
              value={String(query.topN)}
            />
          </>
        ) : null}
        {extra}
      </div>
      {showPerformance ? (
        <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
          <input defaultChecked={query.includeZeroSales} name="includeZero" type="checkbox" value="1" />
          {t("includeZeroSales", locale)}
        </label>
      ) : null}
      <p className="text-xs text-zinc-500">{t("unitNote", locale)}</p>
      <div className="flex flex-wrap gap-2">
        <button className={`inline-flex h-10 items-center rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white ${focusRing}`} type="submit">
          {t("apply", locale)}
        </button>
        <Link className={`inline-flex h-10 items-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 ${focusRing}`} href={pathname}>
          {t("clear", locale)}
        </Link>
        <ExportExcelButton href={exportHref} locale={locale} />
      </div>
    </form>
  );
}

export function ProductSalesReportView({
  data,
  error,
  locale: localeProp,
}: {
  data?: ProductSalesTableResult;
  error?: string;
  locale?: SupportedLocale;
}) {
  const locale = useAppLocale(localeProp);
  const pathname = "/reports/products/sales";
  const defaults = { datePreset: "today" as const };
  const query = data?.query;
  const sortHref = (sort: string) => {
    if (!query) return pathname;
    const dir = query.sort === sort && query.dir === "desc" ? "asc" : "desc";
    return productTableHref(pathname, query, defaults, { sort, dir, page: 1 });
  };
  const summaryItems = useMemo(() => {
    if (!data) return [];
    const items = [
      { key: "products", label: t("productsSold", locale), value: formatNumber(data.summary.productsSold) },
      { key: "units", label: t("unitsSold", locale), value: formatNumber(data.summary.baseQty) },
      { key: "bills", label: t("bills", locale), value: formatNumber(data.summary.bills) },
      { key: "gross", label: t("grossSales", locale), value: money(data.summary.grossLak) },
      { key: "refunds", label: t("refunds", locale), value: money(data.summary.refundLak) },
      { key: "voids", label: t("voids", locale), value: money(data.summary.voidLak) },
      { key: "net", label: t("netSales", locale), value: money(data.summary.netLak) },
    ];
    if (data.showCostProfit) {
      items.push(
        { key: "cost", label: t("cost", locale), value: money(data.summary.costLak) },
        { key: "profit", label: t("profit", locale), value: money(data.summary.profitLak) },
      );
    }
    return items;
  }, [data, locale]);

  return (
    <ReportFrame entryId="products-sales" error={error} locale={locale}>
      {data && query ? (
        <>
          <ProductFilters
            defaults={defaults}
            exportHref={productTableExportHref("sales", query, defaults)}
            filterOptions={data.filterOptions}
            locale={locale}
            pathname={pathname}
            query={query}
            showProductSearch
            showStatus
          />
          <SummaryStrip items={summaryItems} />
          {data.selectedProduct ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800">
              <span>{t("selectedProduct", locale)}: <strong>{data.selectedProduct.name}</strong></span>
              <Link className={`font-semibold text-zinc-900 underline ${focusRing}`} href={productTableHref(pathname, query, defaults, { productId: undefined })}>
                {t("backToProductSales", locale)}
              </Link>
            </div>
          ) : null}
          <ReportSheet>
            <Spreadsheet empty={data.rows.length === 0 && data.detailRows.length === 0} locale={locale}>
              <table className={`${gridTable} min-w-[1200px]`}>
                <thead className="sticky top-0 z-20">
                  <tr>
                    <th className={thSticky}>{t("colNo", locale)}</th>
                    <th className={thCell}><SortLink active={query.sort === "product"} dir={query.dir} href={sortHref("product")}>{t("colProduct", locale)}</SortLink></th>
                    <th className={thCell}><SortLink active={query.sort === "sku"} dir={query.dir} href={sortHref("sku")}>{t("colSku", locale)}</SortLink></th>
                    <th className={thCell}><SortLink active={query.sort === "category"} dir={query.dir} href={sortHref("category")}>{t("colCategory", locale)}</SortLink></th>
                    <th className={thCell}>{t("colUnit", locale)}</th>
                    <th className={`${thCell} ${numClass}`}><SortLink active={query.sort === "qty"} dir={query.dir} href={sortHref("qty")}>{t("colQtySold", locale)}</SortLink></th>
                    <th className={`${thCell} ${numClass}`}><SortLink active={query.sort === "baseQty"} dir={query.dir} href={sortHref("baseQty")}>{t("colBaseQty", locale)}</SortLink></th>
                    <th className={`${thCell} ${numClass}`}><SortLink active={query.sort === "refundQty"} dir={query.dir} href={sortHref("refundQty")}>{t("colRefundQty", locale)}</SortLink></th>
                    <th className={`${thCell} ${numClass}`}><SortLink active={query.sort === "voidQty"} dir={query.dir} href={sortHref("voidQty")}>{t("colVoidQty", locale)}</SortLink></th>
                    <th className={`${thCell} ${numClass}`}><SortLink active={query.sort === "netQty"} dir={query.dir} href={sortHref("netQty")}>{t("colNetQty", locale)}</SortLink></th>
                    <th className={`${thCell} ${numClass}`}><SortLink active={query.sort === "bills"} dir={query.dir} href={sortHref("bills")}>{t("colBills", locale)}</SortLink></th>
                    <th className={`${thCell} ${numClass}`}><SortLink active={query.sort === "gross"} dir={query.dir} href={sortHref("gross")}>{t("colGross", locale)}</SortLink></th>
                    <th className={`${thCell} ${numClass}`}><SortLink active={query.sort === "refund"} dir={query.dir} href={sortHref("refund")}>{t("colRefund", locale)}</SortLink></th>
                    <th className={`${thCell} ${numClass}`}><SortLink active={query.sort === "void"} dir={query.dir} href={sortHref("void")}>{t("colVoid", locale)}</SortLink></th>
                    <th className={`${thCell} ${numClass}`}><SortLink active={query.sort === "net"} dir={query.dir} href={sortHref("net")}>{t("colNetSales", locale)}</SortLink></th>
                    {data.showCostProfit ? (
                      <>
                        <th className={`${thCell} ${numClass}`}><SortLink active={query.sort === "cost"} dir={query.dir} href={sortHref("cost")}>{t("colCost", locale)}</SortLink></th>
                        <th className={`${thCell} ${numClass}`}><SortLink active={query.sort === "profit"} dir={query.dir} href={sortHref("profit")}>{t("colProfit", locale)}</SortLink></th>
                      </>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, index) => (
                    <tr className="group" key={row.productId}>
                      <td className={tdSticky}>{((data.page - 1) * data.pageSize) + index + 1}</td>
                      <td className={tdCell}>
                        <Link className={`font-medium underline ${focusRing}`} href={productTableHref(pathname, query, defaults, { productId: row.productId, page: 1 })}>
                          {row.name}
                        </Link>
                      </td>
                      <td className={tdCell}>{row.sku}</td>
                      <td className={tdCell}>{row.categoryName || t("uncategorized", locale)}</td>
                      <td className={tdCell}>{row.unitLabel === "Mixed" ? t("mixedUnits", locale) : row.unitLabel}</td>
                      <td className={`${tdCell} ${numClass}`}>{formatNumber(row.qtySold)}</td>
                      <td className={`${tdCell} ${numClass}`}>{formatNumber(row.baseQty)}</td>
                      <td className={`${tdCell} ${numClass}`}>{formatNumber(row.refundQty)}</td>
                      <td className={`${tdCell} ${numClass}`}>{formatNumber(row.voidQty)}</td>
                      <td className={`${tdCell} ${numClass}`}>{formatNumber(row.netQty)}</td>
                      <td className={`${tdCell} ${numClass}`}>{formatNumber(row.bills)}</td>
                      <td className={`${tdCell} ${numClass}`}>{money(row.grossLak)}</td>
                      <td className={`${tdCell} ${numClass}`}>{money(row.refundLak)}</td>
                      <td className={`${tdCell} ${numClass}`}>{money(row.voidLak)}</td>
                      <td className={`${tdCell} ${numClass}`}>{money(row.netLak)}</td>
                      {data.showCostProfit ? (
                        <>
                          <td className={`${tdCell} ${numClass}`}>{money(row.costLak)}</td>
                          <td className={`${tdCell} ${numClass}`}>{money(row.profitLak)}</td>
                        </>
                      ) : null}
                    </tr>
                  ))}
                  <tr>
                    <td className={tdTotalSticky}>{t("total", locale)}</td>
                    <td className={tdTotal} colSpan={4} />
                    <td className={`${tdTotal} ${numClass}`}>{formatNumber(data.totalRow.qtySold)}</td>
                    <td className={`${tdTotal} ${numClass}`}>{formatNumber(data.totalRow.baseQty)}</td>
                    <td className={`${tdTotal} ${numClass}`}>{formatNumber(data.totalRow.refundQty)}</td>
                    <td className={`${tdTotal} ${numClass}`}>{formatNumber(data.totalRow.voidQty)}</td>
                    <td className={`${tdTotal} ${numClass}`}>{formatNumber(data.totalRow.netQty)}</td>
                    <td className={`${tdTotal} ${numClass}`}>{formatNumber(data.totalRow.bills)}</td>
                    <td className={`${tdTotal} ${numClass}`}>{money(data.totalRow.grossLak)}</td>
                    <td className={`${tdTotal} ${numClass}`}>{money(data.totalRow.refundLak)}</td>
                    <td className={`${tdTotal} ${numClass}`}>{money(data.totalRow.voidLak)}</td>
                    <td className={`${tdTotal} ${numClass}`}>{money(data.totalRow.netLak)}</td>
                    {data.showCostProfit ? (
                      <>
                        <td className={`${tdTotal} ${numClass}`}>{money(data.totalRow.costLak)}</td>
                        <td className={`${tdTotal} ${numClass}`}>{money(data.totalRow.profitLak)}</td>
                      </>
                    ) : null}
                  </tr>
                </tbody>
              </table>
            </Spreadsheet>
            <Pager
              locale={locale}
              nextHref={data.page < data.pageCount ? productTableHref(pathname, query, defaults, { page: data.page + 1 }) : undefined}
              page={data.page}
              pageCount={data.pageCount}
              prevHref={data.page > 1 ? productTableHref(pathname, query, defaults, { page: data.page - 1 }) : undefined}
            />
          </ReportSheet>
          {data.selectedProduct && data.detailRows.length > 0 ? (
            <ReportSheet>
              <Spreadsheet locale={locale}>
                <table className={`${gridTable} min-w-[980px]`}>
                  <thead>
                    <tr>
                      <th className={thCell}>{t("colDateTime", locale)}</th>
                      <th className={thCell}>{t("colReceipt", locale)}</th>
                      <th className={thCell}>{t("cashier", locale)}</th>
                      <th className={thCell}>{t("colUnit", locale)}</th>
                      <th className={`${thCell} ${numClass}`}>{t("colQtySold", locale)}</th>
                      <th className={`${thCell} ${numClass}`}>{t("colGross", locale)}</th>
                      <th className={`${thCell} ${numClass}`}>{t("colRefund", locale)}</th>
                      <th className={`${thCell} ${numClass}`}>{t("colVoid", locale)}</th>
                      <th className={`${thCell} ${numClass}`}>{t("colNet", locale)}</th>
                      {data.showCostProfit ? (
                        <>
                          <th className={`${thCell} ${numClass}`}>{t("colCost", locale)}</th>
                          <th className={`${thCell} ${numClass}`}>{t("colProfit", locale)}</th>
                        </>
                      ) : null}
                      <th className={thCell}>{t("colStatus", locale)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.detailRows.map((row) => (
                      <tr className="group" key={`${row.saleId}-${row.receipt}-${row.createdAt}`}>
                        <td className={tdCell}>{formatBusinessDateTimeLabel(row.createdAt)}</td>
                        <td className={tdCell}>{row.receipt}</td>
                        <td className={tdCell}>{row.cashierName}</td>
                        <td className={tdCell}>{row.unitLabel}</td>
                        <td className={`${tdCell} ${numClass}`}>{formatNumber(row.qty)}</td>
                        <td className={`${tdCell} ${numClass}`}>{money(row.grossLak)}</td>
                        <td className={`${tdCell} ${numClass}`}>{money(row.refundLak)}</td>
                        <td className={`${tdCell} ${numClass}`}>{money(row.voidLak)}</td>
                        <td className={`${tdCell} ${numClass}`}>{money(row.netLak)}</td>
                        {data.showCostProfit ? (
                          <>
                            <td className={`${tdCell} ${numClass}`}>{money(row.costLak)}</td>
                            <td className={`${tdCell} ${numClass}`}>{money(row.profitLak)}</td>
                          </>
                        ) : null}
                        <td className={tdCell}>{t(saleStatusCopyKey(row.status), locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Spreadsheet>
            </ReportSheet>
          ) : null}
        </>
      ) : null}
    </ReportFrame>
  );
}

export function CategorySalesReportView({
  data,
  error,
  locale: localeProp,
}: {
  data?: CategorySalesTableResult;
  error?: string;
  locale?: SupportedLocale;
}) {
  const locale = useAppLocale(localeProp);
  const pathname = "/reports/products/categories";
  const defaults = { datePreset: "this_month" as const };
  const query = data?.query;
  const sortHref = (sort: string) => {
    if (!query) return pathname;
    const dir = query.sort === sort && query.dir === "desc" ? "asc" : "desc";
    return productTableHref(pathname, query, defaults, { sort, dir, page: 1 });
  };
  const salesHref = (categoryId: string) => query
    ? productTableHref("/reports/products/sales", query, { datePreset: "today" }, { categoryId, page: 1, productId: undefined })
    : "/reports/products/sales";

  return (
    <ReportFrame entryId="products-categories" error={error} locale={locale}>
      {data && query ? (
        <>
          <ProductFilters
            defaults={defaults}
            exportHref={productTableExportHref("categories", query, defaults)}
            filterOptions={data.filterOptions}
            locale={locale}
            pathname={pathname}
            query={query}
          />
          <SummaryStrip
            items={[
              { key: "categories", label: t("categoriesSold", locale), value: formatNumber(data.summary.categoriesSold) },
              { key: "products", label: t("productsSold", locale), value: formatNumber(data.summary.productsSold) },
              { key: "units", label: t("unitsSold", locale), value: formatNumber(data.summary.baseQty) },
              { key: "bills", label: t("bills", locale), value: formatNumber(data.summary.bills) },
              { key: "gross", label: t("grossSales", locale), value: money(data.summary.grossLak) },
              { key: "refunds", label: t("refunds", locale), value: money(data.summary.refundLak) },
              { key: "voids", label: t("voids", locale), value: money(data.summary.voidLak) },
              { key: "net", label: t("netSales", locale), value: money(data.summary.netLak) },
              ...(data.showCostProfit
                ? [
                    { key: "cost", label: t("cost", locale), value: money(data.summary.costLak) },
                    { key: "profit", label: t("profit", locale), value: money(data.summary.profitLak) },
                  ]
                : []),
            ]}
          />
          <ReportSheet>
            <Spreadsheet empty={data.rows.length === 0} locale={locale}>
              <table className={`${gridTable} min-w-[980px]`}>
                <thead>
                  <tr>
                    <th className={thSticky}>{t("colNo", locale)}</th>
                    <th className={thCell}><SortLink active={query.sort === "category"} dir={query.dir} href={sortHref("category")}>{t("colCategory", locale)}</SortLink></th>
                    <th className={`${thCell} ${numClass}`}><SortLink active={query.sort === "products"} dir={query.dir} href={sortHref("products")}>{t("colProducts", locale)}</SortLink></th>
                    <th className={`${thCell} ${numClass}`}><SortLink active={query.sort === "units"} dir={query.dir} href={sortHref("units")}>{t("unitsSold", locale)}</SortLink></th>
                    <th className={`${thCell} ${numClass}`}><SortLink active={query.sort === "bills"} dir={query.dir} href={sortHref("bills")}>{t("colBills", locale)}</SortLink></th>
                    <th className={`${thCell} ${numClass}`}><SortLink active={query.sort === "gross"} dir={query.dir} href={sortHref("gross")}>{t("colGross", locale)}</SortLink></th>
                    <th className={`${thCell} ${numClass}`}><SortLink active={query.sort === "refund"} dir={query.dir} href={sortHref("refund")}>{t("colRefund", locale)}</SortLink></th>
                    <th className={`${thCell} ${numClass}`}><SortLink active={query.sort === "void"} dir={query.dir} href={sortHref("void")}>{t("colVoid", locale)}</SortLink></th>
                    <th className={`${thCell} ${numClass}`}><SortLink active={query.sort === "net"} dir={query.dir} href={sortHref("net")}>{t("colNetSales", locale)}</SortLink></th>
                    {data.showCostProfit ? (
                      <>
                        <th className={`${thCell} ${numClass}`}>{t("colCost", locale)}</th>
                        <th className={`${thCell} ${numClass}`}>{t("colProfit", locale)}</th>
                      </>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, index) => (
                    <tr className="group" key={row.categoryId}>
                      <td className={tdSticky}>{((data.page - 1) * data.pageSize) + index + 1}</td>
                      <td className={tdCell}>
                        <Link className={`font-medium underline ${focusRing}`} href={salesHref(row.categoryId === "uncategorized" ? "" : row.categoryId)}>
                          {row.categoryName || t("uncategorized", locale)}
                        </Link>
                      </td>
                      <td className={`${tdCell} ${numClass}`}>{formatNumber(row.products)}</td>
                      <td className={`${tdCell} ${numClass}`}>{formatNumber(row.unitsSold)}</td>
                      <td className={`${tdCell} ${numClass}`}>{formatNumber(row.bills)}</td>
                      <td className={`${tdCell} ${numClass}`}>{money(row.grossLak)}</td>
                      <td className={`${tdCell} ${numClass}`}>{money(row.refundLak)}</td>
                      <td className={`${tdCell} ${numClass}`}>{money(row.voidLak)}</td>
                      <td className={`${tdCell} ${numClass}`}>{money(row.netLak)}</td>
                      {data.showCostProfit ? (
                        <>
                          <td className={`${tdCell} ${numClass}`}>{money(row.costLak)}</td>
                          <td className={`${tdCell} ${numClass}`}>{money(row.profitLak)}</td>
                        </>
                      ) : null}
                    </tr>
                  ))}
                  <tr>
                    <td className={tdTotalSticky}>{t("total", locale)}</td>
                    <td className={tdTotal} />
                    <td className={`${tdTotal} ${numClass}`}>{formatNumber(data.totalRow.products)}</td>
                    <td className={`${tdTotal} ${numClass}`}>{formatNumber(data.totalRow.unitsSold)}</td>
                    <td className={`${tdTotal} ${numClass}`}>{formatNumber(data.totalRow.bills)}</td>
                    <td className={`${tdTotal} ${numClass}`}>{money(data.totalRow.grossLak)}</td>
                    <td className={`${tdTotal} ${numClass}`}>{money(data.totalRow.refundLak)}</td>
                    <td className={`${tdTotal} ${numClass}`}>{money(data.totalRow.voidLak)}</td>
                    <td className={`${tdTotal} ${numClass}`}>{money(data.totalRow.netLak)}</td>
                    {data.showCostProfit ? (
                      <>
                        <td className={`${tdTotal} ${numClass}`}>{money(data.totalRow.costLak)}</td>
                        <td className={`${tdTotal} ${numClass}`}>{money(data.totalRow.profitLak)}</td>
                      </>
                    ) : null}
                  </tr>
                </tbody>
              </table>
            </Spreadsheet>
            <Pager
              locale={locale}
              nextHref={data.page < data.pageCount ? productTableHref(pathname, query, defaults, { page: data.page + 1 }) : undefined}
              page={data.page}
              pageCount={data.pageCount}
              prevHref={data.page > 1 ? productTableHref(pathname, query, defaults, { page: data.page - 1 }) : undefined}
            />
          </ReportSheet>
        </>
      ) : null}
    </ReportFrame>
  );
}

export function ProductPerformanceReportView({
  data,
  error,
  locale: localeProp,
}: {
  data?: ProductPerformanceResult;
  error?: string;
  locale?: SupportedLocale;
}) {
  const locale = useAppLocale(localeProp);
  const pathname = "/reports/products/performance";
  const defaults = { datePreset: "this_month" as const };
  const query = data?.query;
  return (
    <ReportFrame entryId="products-performance" error={error} locale={locale}>
      {data && query ? (
        <>
          <ProductFilters
            defaults={defaults}
            exportHref={productTableExportHref("performance", query, defaults)}
            filterOptions={data.filterOptions}
            locale={locale}
            pathname={pathname}
            query={query}
            showPerformance
            showProductSearch
          />
          <SummaryStrip
            items={[
              { key: "products", label: t("productsSold", locale), value: formatNumber(data.summary.productsSold) },
              { key: "units", label: t("unitsSold", locale), value: formatNumber(data.summary.baseQty) },
              { key: "bills", label: t("bills", locale), value: formatNumber(data.summary.bills) },
              { key: "net", label: t("netSales", locale), value: money(data.summary.netLak) },
              ...(data.showCostProfit ? [{ key: "profit", label: t("profit", locale), value: money(data.summary.profitLak) }] : []),
            ]}
          />
          <ReportSheet>
            <Spreadsheet empty={data.rows.length === 0} locale={locale}>
              <table className={`${gridTable} min-w-[980px]`}>
                <thead>
                  <tr>
                    <th className={thSticky}>{t("colRank", locale)}</th>
                    <th className={thCell}>{t("colProduct", locale)}</th>
                    <th className={thCell}>{t("colSku", locale)}</th>
                    <th className={thCell}>{t("colCategory", locale)}</th>
                    <th className={`${thCell} ${numClass}`}>{t("unitsSold", locale)}</th>
                    <th className={`${thCell} ${numClass}`}>{t("colBills", locale)}</th>
                    <th className={`${thCell} ${numClass}`}>{t("colNetSales", locale)}</th>
                    {data.showCostProfit ? (
                      <>
                        <th className={`${thCell} ${numClass}`}>{t("colCost", locale)}</th>
                        <th className={`${thCell} ${numClass}`}>{t("colProfit", locale)}</th>
                      </>
                    ) : null}
                    <th className={thCell}>{t("colLastSold", locale)}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr className="group" key={`${row.productId}-${row.zeroSale ? "zero" : row.rank}`}>
                      <td className={tdSticky}>{row.zeroSale ? t("zeroSales", locale) : row.rank}</td>
                      <td className={tdCell}>
                        <Link className={`font-medium underline ${focusRing}`} href={productTableHref("/reports/products/sales", query, { datePreset: "today" }, { productId: row.productId, page: 1 })}>
                          {row.name}
                        </Link>
                      </td>
                      <td className={tdCell}>{row.sku}</td>
                      <td className={tdCell}>{row.categoryName || t("uncategorized", locale)}</td>
                      <td className={`${tdCell} ${numClass}`}>{formatNumber(row.baseQty)}</td>
                      <td className={`${tdCell} ${numClass}`}>{formatNumber(row.bills)}</td>
                      <td className={`${tdCell} ${numClass}`}>{money(row.netLak)}</td>
                      {data.showCostProfit ? (
                        <>
                          <td className={`${tdCell} ${numClass}`}>{money(row.costLak)}</td>
                          <td className={`${tdCell} ${numClass}`}>{money(row.profitLak)}</td>
                        </>
                      ) : null}
                      <td className={tdCell}>{row.lastSoldAt ? formatBusinessDateTimeLabel(row.lastSoldAt) : t("lastSoldNever", locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Spreadsheet>
            <Pager
              locale={locale}
              nextHref={data.page < data.pageCount ? productTableHref(pathname, query, defaults, { page: data.page + 1 }) : undefined}
              page={data.page}
              pageCount={data.pageCount}
              prevHref={data.page > 1 ? productTableHref(pathname, query, defaults, { page: data.page - 1 }) : undefined}
            />
          </ReportSheet>
        </>
      ) : null}
    </ReportFrame>
  );
}
