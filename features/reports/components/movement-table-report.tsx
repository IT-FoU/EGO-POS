"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import type { SupportedLocale } from "@/lib/constants";
import { fillReportsCopy, tReports } from "@/lib/i18n/reports-copy";
import { formatLak, formatNumber } from "@/features/reports/format";
import { ReportDetailHeader, ReportPageChrome, ReportSheet } from "@/features/reports/components/report-page-shell";
import { findReportCenterEntry } from "@/features/reports/report-center-catalog";
import { REPORT_CENTER_ICON_MAP } from "@/features/reports/report-center-icons";
import {
  movementTableExportHref,
  movementTableHref,
} from "@/features/reports/movement-table-query";
import type { MovementTableResult } from "@/features/reports/movement-table-repository";
import { MOVEMENT_REPORT_KINDS } from "@/features/reports/movement-table-math";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const fieldClass = `h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 ${focusRing}`;
const numClass = "text-right tabular-nums";
const gridTable = "w-full border-separate border-spacing-0 text-sm text-zinc-900";
const thCell = "border border-zinc-300 bg-zinc-100 px-2.5 py-2 align-middle text-xs font-semibold uppercase tracking-wide text-zinc-700";
const tdCell = "border border-zinc-300 bg-white px-2.5 py-1.5 align-middle text-zinc-900 group-hover:bg-zinc-50";
const tdTotal = "border border-zinc-300 border-t-2 border-t-zinc-500 bg-zinc-100 px-2.5 py-2 align-middle font-semibold text-zinc-900";

function t(key: string, locale: SupportedLocale) {
  return tReports(key, locale);
}

function kindLabel(kind: string, locale: SupportedLocale) {
  const map: Record<string, string> = {
    stock_in: t("movementStockIn", locale),
    purchase_grn: t("movementPurchaseGrn", locale),
    sale: t("movementSale", locale),
    refund: t("movementRefund", locale),
    void_restore: t("movementVoidRestore", locale),
    adjustment_in: t("movementAdjustmentIn", locale),
    adjustment_out: t("movementAdjustmentOut", locale),
    stock_count: t("movementStockCount", locale),
    exchange_out: t("movementExchangeOut", locale),
    damaged: t("movementDamaged", locale),
    expired: t("movementExpired", locale),
    other: t("movementOther", locale),
  };
  return map[kind] || kind;
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
          <p className="py-8 text-center text-sm text-zinc-600">{t("errorMovementTable", locale)}</p>
        </ReportSheet>
      ) : (
        children
      )}
    </div>
  );
}

export function StockMovementReportView({
  data,
  error,
  locale,
}: {
  data?: MovementTableResult;
  error?: string;
  locale: SupportedLocale;
}) {
  const pathname = "/reports/inventory/movements";
  const query = data?.query;

  const summaryItems = useMemo(() => {
    if (!data) return [];
    const items = [
      { key: "moves", label: t("totalMovements", locale), value: formatNumber(data.summary.totalMovements) },
      { key: "in", label: t("qtyIn", locale), value: formatNumber(data.summary.totalQtyIn) },
      { key: "out", label: t("qtyOut", locale), value: formatNumber(data.summary.totalQtyOut) },
      { key: "net", label: t("netMovement", locale), value: formatNumber(data.summary.netMovement) },
      { key: "products", label: t("productsAffected", locale), value: formatNumber(data.summary.productsAffected) },
    ];
    if (data.showCost) {
      items.push(
        { key: "vin", label: t("valueIn", locale), value: formatLak(data.summary.valueInLak) },
        { key: "vout", label: t("valueOut", locale), value: formatLak(data.summary.valueOutLak) },
      );
    }
    return items;
  }, [data, locale]);

  const sortHref = (sort: string) => {
    if (!query) return pathname;
    const dir = query.sort === sort && query.dir === "desc" ? "asc" : "desc";
    return movementTableHref(pathname, query, { sort, dir, page: 1 });
  };

  return (
    <ReportFrame entryId="inventory-movements" error={error} locale={locale}>
      {data && query ? (
        <>
          <ReportSheet>
            <form className="flex flex-col gap-3" method="get">
              <div className="flex flex-wrap gap-3">
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="m-preset">
                  {t("dateRange", locale)}
                  <select className={fieldClass} defaultValue={query.datePreset} id="m-preset" name="datePreset">
                    <option value="today">{t("today", locale)}</option>
                    <option value="yesterday">{t("yesterday", locale)}</option>
                    <option value="this_week">{t("thisWeek", locale)}</option>
                    <option value="this_month">{t("thisMonth", locale)}</option>
                    <option value="custom">{t("custom", locale)}</option>
                  </select>
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="m-from">
                  {t("from", locale)}
                  <input className={fieldClass} defaultValue={String(query.dateFrom ?? "").slice(0, 10)} id="m-from" name="dateFrom" type="date" />
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="m-to">
                  {t("to", locale)}
                  <input className={fieldClass} defaultValue={String(query.dateTo ?? "").slice(0, 10)} id="m-to" name="dateTo" type="date" />
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="m-branch">
                  {t("branch", locale)}
                  <select className={fieldClass} defaultValue={query.branchId ?? ""} id="m-branch" name="branchId">
                    <option value="">{t("allBranches", locale)}</option>
                    {data.filterOptions.branches.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="m-wh">
                  {t("warehouse", locale)}
                  <select className={fieldClass} defaultValue={query.warehouseId ?? ""} id="m-wh" name="warehouseId">
                    <option value="">{t("allWarehouses", locale)}</option>
                    {data.filterOptions.warehouses.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="m-cat">
                  {t("categoryFilter", locale)}
                  <select className={fieldClass} defaultValue={query.categoryId ?? ""} id="m-cat" name="categoryId">
                    <option value="">{t("allCategories", locale)}</option>
                    {data.filterOptions.categories.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="m-kind">
                  {t("movementType", locale)}
                  <select className={fieldClass} defaultValue={query.movementKind} id="m-kind" name="movementKind">
                    {MOVEMENT_REPORT_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {kind === "all" ? t("allStatuses", locale) : kindLabel(kind, locale)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="m-ref">
                  {t("reference", locale)}
                  <select className={fieldClass} defaultValue={query.referenceType ?? ""} id="m-ref" name="referenceType">
                    <option value="">{t("allStatuses", locale)}</option>
                    {data.filterOptions.referenceTypes.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="m-actor">
                  {t("user", locale)}
                  <select className={fieldClass} defaultValue={query.actorId ?? ""} id="m-actor" name="actorId">
                    <option value="">{t("allStatuses", locale)}</option>
                    {data.filterOptions.actors.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-[12rem] flex-[2] flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="m-q">
                  {t("productSearch", locale)}
                  <input className={fieldClass} defaultValue={query.productQuery ?? ""} id="m-q" name="q" placeholder={t("searchProductPlaceholder", locale)} />
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="m-sku">
                  {t("skuBarcodeSearch", locale)}
                  <input className={fieldClass} defaultValue={query.skuQuery ?? ""} id="m-sku" name="sku" placeholder={t("searchSkuBarcodePlaceholder", locale)} />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button className={`h-10 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white ${focusRing}`} type="submit">
                  {t("apply", locale)}
                </button>
                <Link className={`inline-flex h-10 items-center rounded-md border border-zinc-300 bg-white px-4 text-sm text-zinc-800 ${focusRing}`} href={pathname}>
                  {t("clear", locale)}
                </Link>
                <Link
                  className={`inline-flex h-10 items-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 ${focusRing}`}
                  href={movementTableExportHref("/api/reports/inventory/movements/export", query)}
                >
                  {t("exportExcel", locale)}
                </Link>
              </div>
              <p className="text-xs text-zinc-500">{t("movementReservationNote", locale)}</p>
            </form>
          </ReportSheet>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {summaryItems.map((item) => (
              <div className="rounded-md border border-zinc-200 bg-white px-3 py-2" key={item.key}>
                <div className="text-xs text-zinc-500">{item.label}</div>
                <div className="text-lg font-semibold tabular-nums text-zinc-900">{item.value}</div>
              </div>
            ))}
          </div>

          <ReportSheet>
            <div className="overflow-x-auto">
              <table className={gridTable}>
                <thead>
                  <tr>
                    <th className={thCell}>{t("colNo", locale)}</th>
                    <th className={thCell}>
                      <Link href={sortHref("createdAt")}>{t("colDateTime", locale)}</Link>
                    </th>
                    <th className={thCell}>{t("colProduct", locale)}</th>
                    <th className={thCell}>{t("colSku", locale)}</th>
                    <th className={thCell}>{t("warehouse", locale)}</th>
                    <th className={thCell}>{t("movementType", locale)}</th>
                    <th className={`${thCell} ${numClass}`}>{t("qtyIn", locale)}</th>
                    <th className={`${thCell} ${numClass}`}>{t("qtyOut", locale)}</th>
                    <th className={`${thCell} ${numClass}`}>{t("netMovement", locale)}</th>
                    <th className={`${thCell} ${numClass}`}>{t("balanceAfter", locale)}</th>
                    {data.showCost ? (
                      <>
                        <th className={`${thCell} ${numClass}`}>{t("unitCost", locale)}</th>
                        <th className={`${thCell} ${numClass}`}>{t("movementValue", locale)}</th>
                      </>
                    ) : null}
                    <th className={thCell}>{t("reference", locale)}</th>
                    <th className={thCell}>{t("user", locale)}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 ? (
                    <tr>
                      <td className={tdCell} colSpan={data.showCost ? 14 : 12}>
                        <p className="py-6 text-center text-sm text-zinc-600">{t("emptyMovementTable", locale)}</p>
                      </td>
                    </tr>
                  ) : (
                    data.rows.map((row, index) => (
                      <tr className="group" key={row.id}>
                        <td className={`${tdCell} ${numClass}`}>{(data.page - 1) * data.pageSize + index + 1}</td>
                        <td className={tdCell}>{row.createdAt.slice(0, 16).replace("T", " ")}</td>
                        <td className={tdCell}>
                          <Link className={`font-medium underline-offset-2 hover:underline ${focusRing}`} href={`/products/${row.productId}/edit`}>
                            {row.productName}
                          </Link>
                        </td>
                        <td className={tdCell}>{row.sku}</td>
                        <td className={tdCell}>{row.warehouseName}</td>
                        <td className={tdCell}>{kindLabel(row.kind, locale)}</td>
                        <td className={`${tdCell} ${numClass}`}>{formatNumber(row.qtyIn)}</td>
                        <td className={`${tdCell} ${numClass}`}>{formatNumber(row.qtyOut)}</td>
                        <td className={`${tdCell} ${numClass}`}>{formatNumber(row.netQty)}</td>
                        <td className={`${tdCell} ${numClass}`}>{formatNumber(row.balanceAfter)}</td>
                        {data.showCost ? (
                          <>
                            <td className={`${tdCell} ${numClass}`}>{row.hasCost ? formatLak(row.unitCostLak) : t("noCost", locale)}</td>
                            <td className={`${tdCell} ${numClass}`}>{row.hasCost ? formatLak(row.movementValueLak) : "—"}</td>
                          </>
                        ) : null}
                        <td className={tdCell}>
                          {row.drillHref ? (
                            <Link className={`underline-offset-2 hover:underline ${focusRing}`} href={row.drillHref}>
                              {row.referenceLabel}
                            </Link>
                          ) : (
                            row.referenceLabel
                          )}
                        </td>
                        <td className={tdCell}>{row.actorName}</td>
                      </tr>
                    ))
                  )}
                  {data.rows.length > 0 ? (
                    <tr>
                      <td className={tdTotal} colSpan={6}>
                        {t("total", locale)} ({formatNumber(data.totalRow.rowCount)})
                      </td>
                      <td className={`${tdTotal} ${numClass}`}>{formatNumber(data.totalRow.qtyIn)}</td>
                      <td className={`${tdTotal} ${numClass}`}>{formatNumber(data.totalRow.qtyOut)}</td>
                      <td className={`${tdTotal} ${numClass}`}>{formatNumber(data.totalRow.netQty)}</td>
                      <td className={tdTotal} />
                      {data.showCost ? (
                        <>
                          <td className={tdTotal} />
                          <td className={`${tdTotal} ${numClass}`}>{formatLak(data.totalRow.movementValueLak)}</td>
                        </>
                      ) : null}
                      <td className={tdTotal} colSpan={2} />
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {data.pageCount > 1 ? (
              <div className="mt-3 flex items-center justify-between text-sm text-zinc-600">
                <span>{fillReportsCopy(t("pageOf", locale), { page: data.page, pages: data.pageCount })}</span>
                <div className="flex gap-2">
                  {data.page > 1 ? (
                    <Link className={`rounded-md border border-zinc-300 px-3 py-1 ${focusRing}`} href={movementTableHref(pathname, query, { page: data.page - 1 })}>
                      {t("previous", locale)}
                    </Link>
                  ) : null}
                  {data.page < data.pageCount ? (
                    <Link className={`rounded-md border border-zinc-300 px-3 py-1 ${focusRing}`} href={movementTableHref(pathname, query, { page: data.page + 1 })}>
                      {t("next", locale)}
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}
          </ReportSheet>
        </>
      ) : null}
    </ReportFrame>
  );
}
