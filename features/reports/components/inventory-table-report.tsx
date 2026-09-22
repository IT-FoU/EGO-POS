"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import type { SupportedLocale } from "@/lib/constants";
import { fillReportsCopy, tReports } from "@/lib/i18n/reports-copy";
import { formatLak, formatNumber } from "@/features/reports/format";
import { formatBusinessDateTimeLabel } from "@/lib/datetime/business-timezone";
import { ReportDetailHeader, ReportPageChrome, ReportSheet } from "@/features/reports/components/report-page-shell";
import { findReportCenterEntry } from "@/features/reports/report-center-catalog";
import { REPORT_CENTER_ICON_MAP } from "@/features/reports/report-center-icons";
import type { ReportFilterOptions } from "@/features/reports/report-filters";
import { hasReorderThreshold } from "@/features/reports/inventory-table-math";
import {
  inventoryTableExportHref,
  inventoryTableHref,
  type InventoryTableQuery,
} from "@/features/reports/inventory-table-query";
import type { InventoryOnHandResult } from "@/features/reports/inventory-table-repository";

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

function statusLabel(status: string, locale: SupportedLocale) {
  if (status === "out_of_stock") return t("statusOutOfStock", locale);
  if (status === "low_stock") return t("statusLowStock", locale);
  if (status === "no_reorder_level") return t("noReorderLevel", locale);
  return t("statusInStock", locale);
}

function ReportFrame({
  children,
  entryId,
  error,
  errorKey = "errorInventoryTable",
  locale,
}: {
  children?: ReactNode;
  entryId: string;
  error?: string;
  errorKey?: string;
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
          <p className="py-8 text-center text-sm text-zinc-600">{t(errorKey, locale)}</p>
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
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 sm:grid-cols-3 lg:grid-cols-4">
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
    return <div className="px-4 py-12 text-center text-sm text-zinc-500">{t("emptyInventoryTable", locale)}</div>;
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

function InventoryFilters({
  exportHref,
  filterOptions,
  locale,
  lowStock,
  pathname,
  query,
}: {
  exportHref: string;
  filterOptions: ReportFilterOptions;
  locale: SupportedLocale;
  lowStock?: boolean;
  pathname: string;
  query: InventoryTableQuery;
}) {
  const statusOptions = lowStock
    ? [
        { label: t("allStatuses", locale), value: "" },
        { label: t("statusLowStock", locale), value: "low_stock" },
        { label: t("statusOutOfStock", locale), value: "out_of_stock" },
        { label: t("noReorderLevel", locale), value: "no_reorder_level" },
        { label: t("alreadyOrdered", locale), value: "already_ordered" },
      ]
    : [
        { label: t("allStatuses", locale), value: "" },
        { label: t("statusInStock", locale), value: "in_stock" },
        { label: t("statusLowStock", locale), value: "low_stock" },
        { label: t("statusOutOfStock", locale), value: "out_of_stock" },
        { label: t("statusReserved", locale), value: "reserved" },
        { label: t("noReorderLevel", locale), value: "no_reorder_level" },
      ];

  return (
    <form action={pathname} className="flex flex-col gap-3" method="get">
      <div className="flex flex-wrap gap-3">
        <FilterSelect
          id="branchId"
          label={t("branch", locale)}
          name="branchId"
          options={[{ label: t("allBranches", locale), value: "" }, ...filterOptions.branches.map((row) => ({ label: row.label, value: row.id }))]}
          value={query.branchId ?? ""}
        />
        <FilterSelect
          id="warehouseId"
          label={t("warehouse", locale)}
          name="warehouseId"
          options={[{ label: t("allWarehouses", locale), value: "" }, ...filterOptions.warehouses.map((row) => ({ label: row.label, value: row.id }))]}
          value={query.warehouseId ?? ""}
        />
        <FilterSelect
          id="categoryId"
          label={t("categoryFilter", locale)}
          name="categoryId"
          options={[{ label: t("allCategories", locale), value: "" }, ...filterOptions.categories.map((row) => ({ label: row.label, value: row.id }))]}
          value={query.categoryId ?? ""}
        />
        <FilterSelect
          id="supplierId"
          label={t("supplier", locale)}
          name="supplierId"
          options={[{ label: t("allSuppliers", locale), value: "" }, ...filterOptions.suppliers.map((row) => ({ label: row.label, value: row.id }))]}
          value={query.supplierId ?? ""}
        />
        <FilterSelect
          id="status"
          label={t("stockStatus", locale)}
          name="status"
          options={statusOptions}
          value={query.status === "all" ? "" : query.status}
        />
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="q">
          {t("productSearch", locale)}
          <input className={fieldClass} defaultValue={query.productQuery ?? ""} id="q" name="q" placeholder={t("searchProductPlaceholder", locale)} />
        </label>
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="sku">
          {t("skuBarcodeSearch", locale)}
          <input className={fieldClass} defaultValue={query.skuQuery ?? ""} id="sku" name="sku" placeholder={t("searchSkuBarcodePlaceholder", locale)} />
        </label>
      </div>
      <p className="text-xs text-zinc-500">{t("inventoryUnitNote", locale)}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button className={`inline-flex h-10 items-center rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white ${focusRing}`} type="submit">
          {t("apply", locale)}
        </button>
        <Link className={`inline-flex h-10 items-center rounded-md border border-zinc-300 px-4 text-sm ${focusRing}`} href={pathname}>
          {t("clear", locale)}
        </Link>
        <ExportExcelButton href={exportHref} locale={locale} />
      </div>
    </form>
  );
}

function InventoryTable({
  data,
  locale,
  lowStock,
  pathname,
}: {
  data: InventoryOnHandResult;
  locale: SupportedLocale;
  lowStock?: boolean;
  pathname: string;
}) {
  const query = data.query;
  const sortHref = (sort: string) =>
    inventoryTableHref(pathname, query, {
      dir: query.sort === sort && query.dir === "desc" ? "asc" : "desc",
      page: 1,
      sort,
    });

  return (
    <Spreadsheet empty={data.rows.length === 0} locale={locale}>
      <table className={gridTable}>
        <thead>
          <tr>
            <th className={`${thSticky} text-left`}>{t("colNo", locale)}</th>
            <th className={`${thCell} text-left`}>
              <SortLink active={query.sort === "product"} dir={query.dir} href={sortHref("product")}>{t("colProduct", locale)}</SortLink>
            </th>
            <th className={`${thCell} text-left`}>
              <SortLink active={query.sort === "sku"} dir={query.dir} href={sortHref("sku")}>{t("colSku", locale)}</SortLink>
            </th>
            <th className={`${thCell} text-left`}>
              <SortLink active={query.sort === "category"} dir={query.dir} href={sortHref("category")}>{t("colCategory", locale)}</SortLink>
            </th>
            {lowStock ? <th className={`${thCell} text-left`}>{t("supplier", locale)}</th> : null}
            {!lowStock ? <th className={`${thCell} text-left`}>{t("colBaseUnit", locale)}</th> : null}
            <th className={`${thCell} ${numClass}`}>
              <SortLink active={query.sort === "onHand"} dir={query.dir} href={sortHref("onHand")}>{t("colOnHand", locale)}</SortLink>
            </th>
            <th className={`${thCell} ${numClass}`}>
              <SortLink active={query.sort === "reserved"} dir={query.dir} href={sortHref("reserved")}>{t("colReserved", locale)}</SortLink>
            </th>
            <th className={`${thCell} ${numClass}`}>
              <SortLink active={query.sort === "available"} dir={query.dir} href={sortHref("available")}>{t("colAvailable", locale)}</SortLink>
            </th>
            <th className={`${thCell} ${numClass}`}>
              <SortLink active={query.sort === "minStock"} dir={query.dir} href={sortHref("minStock")}>{t("colReorderLevel", locale)}</SortLink>
            </th>
            {lowStock ? <th className={`${thCell} text-left`}>{t("reorderNeeded", locale)}</th> : null}
            <th className={`${thCell} text-left`}>
              <SortLink active={query.sort === "status"} dir={query.dir} href={sortHref("status")}>{t("status", locale)}</SortLink>
            </th>
            {data.showCost ? (
              <>
                <th className={`${thCell} ${numClass}`}>{t("unitCost", locale)}</th>
                {!lowStock ? <th className={`${thCell} ${numClass}`}>{t("stockValue", locale)}</th> : null}
              </>
            ) : null}
            {!lowStock ? <th className={`${thCell} text-left`}>{t("supplier", locale)}</th> : null}
            <th className={`${thCell} text-left`}>{lowStock ? t("colLastReceived", locale) : t("colLastMovement", locale)}</th>
            {lowStock ? <th className={`${thCell} text-left`}>{t("colLastSold", locale)}</th> : null}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, index) => {
            const href = inventoryTableHref(pathname, query, { productId: row.productId, page: 1 });
            const editHref = `/products/${row.productId}/edit`;
            return (
              <tr className="group" key={`${row.productId}:${row.warehouseId}:${index}`}>
                <td className={`${tdSticky} ${numClass}`}>{(data.page - 1) * data.pageSize + index + 1}</td>
                <td className={tdCell}>
                  <div className="flex flex-col gap-1">
                    <Link className={`font-medium text-zinc-900 underline-offset-2 hover:underline ${focusRing}`} href={href}>
                      {row.productName}
                    </Link>
                    <Link className={`text-[11px] text-zinc-500 underline-offset-2 hover:underline ${focusRing}`} href={editHref}>
                      {t("openProductStock", locale)}
                    </Link>
                  </div>
                  {row.reserved > 0 ? (
                    <span className="mt-1 inline-block rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                      {t("reservedBadge", locale)}
                    </span>
                  ) : null}
                </td>
                <td className={tdCell}>{row.sku}</td>
                <td className={tdCell}>{row.categoryName}</td>
                {lowStock ? <td className={tdCell}>{row.supplierName || "—"}</td> : null}
                {!lowStock ? <td className={tdCell}>{row.baseUnit}</td> : null}
                <td className={`${tdCell} ${numClass}`}>{formatNumber(row.onHand)}</td>
                <td className={`${tdCell} ${numClass}`}>{formatNumber(row.reserved)}</td>
                <td className={`${tdCell} ${numClass}`}>{formatNumber(row.available)}</td>
                <td className={`${tdCell} ${numClass}`}>
                  {hasReorderThreshold(row.minStock) ? formatNumber(row.minStock) : t("noReorderLevel", locale)}
                </td>
                {lowStock ? <td className={tdCell}>{row.reorderNeeded ? t("yes", locale) : t("no", locale)}</td> : null}
                <td className={tdCell}>
                  {statusLabel(row.status, locale)}
                  {row.alreadyOrdered ? ` / ${t("alreadyOrdered", locale)}` : ""}
                </td>
                {data.showCost ? (
                  <>
                    <td className={`${tdCell} ${numClass}`}>
                      {row.hasCost ? money(row.unitCostLak) : t("noCost", locale)}
                    </td>
                    {!lowStock ? (
                      <td className={`${tdCell} ${numClass}`}>
                        {row.hasCost ? money(row.stockValueLak) : "—"}
                      </td>
                    ) : null}
                  </>
                ) : null}
                {!lowStock ? <td className={tdCell}>{row.supplierName || "—"}</td> : null}
                <td className={tdCell}>
                  {lowStock
                    ? row.lastReceivedAt
                      ? formatBusinessDateTimeLabel(new Date(row.lastReceivedAt))
                      : "—"
                    : row.lastMovementAt
                      ? formatBusinessDateTimeLabel(new Date(row.lastMovementAt))
                      : "—"}
                </td>
                {lowStock ? (
                  <td className={tdCell}>
                    {row.lastSoldAt ? formatBusinessDateTimeLabel(new Date(row.lastSoldAt)) : t("lastSoldNever", locale)}
                  </td>
                ) : null}
              </tr>
            );
          })}
          <tr>
            <td className={tdTotalSticky}>{t("total", locale)}</td>
            <td className={tdTotal}>{formatNumber(data.totalRow.productCount)}</td>
            <td className={tdTotal} />
            <td className={tdTotal} />
            {lowStock ? <td className={tdTotal} /> : <td className={tdTotal} />}
            <td className={`${tdTotal} ${numClass}`}>{formatNumber(data.totalRow.onHand)}</td>
            <td className={`${tdTotal} ${numClass}`}>{formatNumber(data.totalRow.reserved)}</td>
            <td className={`${tdTotal} ${numClass}`}>{formatNumber(data.totalRow.available)}</td>
            <td className={tdTotal} />
            {lowStock ? <td className={tdTotal} /> : null}
            <td className={tdTotal} />
            {data.showCost ? (
              <>
                <td className={tdTotal} />
                {!lowStock ? <td className={`${tdTotal} ${numClass}`}>{money(data.totalRow.stockValueLak)}</td> : null}
              </>
            ) : null}
            {!lowStock ? <td className={tdTotal} /> : null}
            <td className={tdTotal} />
            {lowStock ? <td className={tdTotal} /> : null}
          </tr>
        </tbody>
      </table>
    </Spreadsheet>
  );
}

function DrillDown({ data, locale, pathname }: { data: InventoryOnHandResult; locale: SupportedLocale; pathname: string }) {
  if (!data.selectedProduct) return null;
  const backHref = inventoryTableHref(pathname, { ...data.query, productId: undefined, page: 1 });
  const editHref = `/products/${data.selectedProduct.productId}/edit`;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-zinc-800">
          {t("selectedInventoryProduct", locale)}: {data.selectedProduct.productName}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link className={`rounded-md border border-zinc-300 px-3 py-1.5 text-sm ${focusRing}`} href={backHref}>
            {t("backToStockOnHand", locale)}
          </Link>
          <Link className={`rounded-md border border-zinc-800 px-3 py-1.5 text-sm font-semibold ${focusRing}`} href={editHref}>
            {t("openProductStock", locale)}
          </Link>
        </div>
      </div>
      <div className="-mx-6 overflow-x-auto sm:-mx-8">
        <table className={gridTable}>
          <thead>
            <tr>
              <th className={`${thCell} text-left`}>{t("colLastMovement", locale)}</th>
              <th className={`${thCell} text-left`}>{t("status", locale)}</th>
              <th className={`${thCell} text-left`}>{t("colUnit", locale)}</th>
              <th className={`${thCell} ${numClass}`}>{t("qty", locale)}</th>
              <th className={`${thCell} ${numClass}`}>Before</th>
              <th className={`${thCell} ${numClass}`}>After</th>
            </tr>
          </thead>
          <tbody>
            {data.detailMovements.length === 0 ? (
              <tr>
                <td className={`${tdCell} text-zinc-500`} colSpan={6}>{t("emptyInventoryTable", locale)}</td>
              </tr>
            ) : (
              data.detailMovements.map((row) => (
                <tr key={`${row.createdAt}:${row.movementType}:${row.quantity}`}>
                  <td className={tdCell}>{formatBusinessDateTimeLabel(new Date(row.createdAt))}</td>
                  <td className={tdCell}>{row.movementType}</td>
                  <td className={tdCell}>{row.unitLabel}</td>
                  <td className={`${tdCell} ${numClass}`}>{formatNumber(row.quantity)}</td>
                  <td className={`${tdCell} ${numClass}`}>{formatNumber(row.beforeQty)}</td>
                  <td className={`${tdCell} ${numClass}`}>{formatNumber(row.afterQty)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function StockOnHandReportView({
  data,
  error,
  locale,
}: {
  data?: InventoryOnHandResult;
  error?: string;
  locale: SupportedLocale;
}) {
  const pathname = "/reports/inventory/on-hand";
  const summaryItems = useMemo(() => {
    if (!data) return [];
    const items = [
      { key: "products", label: t("totalProducts", locale), value: formatNumber(data.summary.totalProducts) },
      { key: "in", label: t("statusInStock", locale), value: formatNumber(data.summary.inStock) },
      { key: "low", label: t("statusLowStock", locale), value: formatNumber(data.summary.lowStock) },
      { key: "out", label: t("statusOutOfStock", locale), value: formatNumber(data.summary.outOfStock) },
      { key: "onHand", label: t("colOnHand", locale), value: formatNumber(data.summary.totalOnHand) },
      { key: "reserved", label: t("colReserved", locale), value: formatNumber(data.summary.totalReserved) },
      { key: "available", label: t("colAvailable", locale), value: formatNumber(data.summary.totalAvailable) },
    ];
    if (data.showCost) items.push({ key: "value", label: t("stockValue", locale), value: money(data.summary.totalStockValueLak) });
    return items;
  }, [data, locale]);

  return (
    <ReportFrame entryId="inventory-on-hand" error={error} locale={locale}>
      {data ? (
        <ReportSheet>
          <div className="flex flex-col gap-4 px-6 py-5 sm:px-8">
            <InventoryFilters
              exportHref={inventoryTableExportHref("/api/reports/inventory/on-hand/export", data.query)}
              filterOptions={data.filterOptions}
              locale={locale}
              pathname={pathname}
              query={data.query}
            />
            <SummaryStrip items={summaryItems} />
            {data.selectedProduct ? <DrillDown data={data} locale={locale} pathname={pathname} /> : null}
            <InventoryTable data={data} locale={locale} pathname={pathname} />
            <Pager
              locale={locale}
              nextHref={data.page < data.pageCount ? inventoryTableHref(pathname, data.query, { page: data.page + 1 }) : undefined}
              page={data.page}
              pageCount={data.pageCount}
              prevHref={data.page > 1 ? inventoryTableHref(pathname, data.query, { page: data.page - 1 }) : undefined}
            />
          </div>
        </ReportSheet>
      ) : null}
    </ReportFrame>
  );
}

export function LowStockReportView({
  data,
  error,
  locale,
}: {
  data?: InventoryOnHandResult;
  error?: string;
  locale: SupportedLocale;
}) {
  const pathname = "/reports/inventory/low-stock";
  const summaryItems = useMemo(() => {
    if (!data) return [];
    return [
      { key: "low", label: t("statusLowStock", locale), value: formatNumber(data.summary.lowStock) },
      { key: "out", label: t("statusOutOfStock", locale), value: formatNumber(data.summary.outOfStock) },
      { key: "suggested", label: t("suggestedReorder", locale), value: formatNumber(data.summary.suggestedReorder) },
      { key: "available", label: t("colAvailable", locale), value: formatNumber(data.summary.totalAvailable) },
      { key: "ordered", label: t("alreadyOrdered", locale), value: formatNumber(data.summary.alreadyOrdered) },
    ];
  }, [data, locale]);

  return (
    <ReportFrame entryId="inventory-low-stock" error={error} locale={locale}>
      {data ? (
        <ReportSheet>
          <div className="flex flex-col gap-4 px-6 py-5 sm:px-8">
            <InventoryFilters
              exportHref={inventoryTableExportHref("/api/reports/inventory/low-stock/export", data.query)}
              filterOptions={data.filterOptions}
              locale={locale}
              lowStock
              pathname={pathname}
              query={data.query}
            />
            <SummaryStrip items={summaryItems} />
            {data.selectedProduct ? <DrillDown data={data} locale={locale} pathname={pathname} /> : null}
            <InventoryTable data={data} locale={locale} lowStock pathname={pathname} />
            <Pager
              locale={locale}
              nextHref={data.page < data.pageCount ? inventoryTableHref(pathname, data.query, { page: data.page + 1 }) : undefined}
              page={data.page}
              pageCount={data.pageCount}
              prevHref={data.page > 1 ? inventoryTableHref(pathname, data.query, { page: data.page - 1 }) : undefined}
            />
          </div>
        </ReportSheet>
      ) : null}
    </ReportFrame>
  );
}

export function StockValuationReportView({
  data,
  error,
  locale,
}: {
  data?: InventoryOnHandResult & { valuationMethod?: string };
  error?: string;
  locale: SupportedLocale;
}) {
  const pathname = "/reports/inventory/valuation";
  const summaryItems = useMemo(() => {
    if (!data) return [];
    const items = [
      { key: "method", label: t("valuationMethod", locale), value: t("currentCostValuation", locale) },
      { key: "products", label: t("totalProducts", locale), value: formatNumber(data.summary.totalProducts) },
      { key: "onHand", label: t("colOnHand", locale), value: formatNumber(data.summary.totalOnHand) },
      { key: "reserved", label: t("colReserved", locale), value: formatNumber(data.summary.totalReserved) },
      { key: "available", label: t("colAvailable", locale), value: formatNumber(data.summary.totalAvailable) },
    ];
    if (data.showCost) {
      items.push(
        { key: "value", label: t("stockValue", locale), value: money(data.summary.totalStockValueLak) },
        { key: "nocost", label: t("productsWithoutCost", locale), value: formatNumber(data.summary.productsWithoutCost) },
      );
    }
    return items;
  }, [data, locale]);

  return (
    <ReportFrame entryId="inventory-valuation" error={error} errorKey="errorValuationTable" locale={locale}>
      {data ? (
        <ReportSheet>
          <div className="flex flex-col gap-4 px-6 py-5 sm:px-8">
            <p className="text-sm font-medium text-zinc-800">
              {t("currentInventoryValuation", locale)} — {t("currentCostValuation", locale)}
            </p>
            <InventoryFilters
              exportHref={inventoryTableExportHref("/api/reports/inventory/valuation/export", data.query)}
              filterOptions={data.filterOptions}
              locale={locale}
              pathname={pathname}
              query={data.query}
            />
            <SummaryStrip items={summaryItems} />
            {data.selectedProduct ? <DrillDown data={data} locale={locale} pathname={pathname} /> : null}
            {data.rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-600">{t("emptyValuationTable", locale)}</p>
            ) : (
              <InventoryTable data={data} locale={locale} pathname={pathname} />
            )}
            <Pager
              locale={locale}
              nextHref={data.page < data.pageCount ? inventoryTableHref(pathname, data.query, { page: data.page + 1 }) : undefined}
              page={data.page}
              pageCount={data.pageCount}
              prevHref={data.page > 1 ? inventoryTableHref(pathname, data.query, { page: data.page - 1 }) : undefined}
            />
          </div>
        </ReportSheet>
      ) : null}
    </ReportFrame>
  );
}
