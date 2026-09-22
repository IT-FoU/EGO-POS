"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { SupportedLocale } from "@/lib/constants";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import { fillReportsCopy, tReports } from "@/lib/i18n/reports-copy";
import { formatLak, formatNumber } from "@/features/reports/format";
import { ReportDetailHeader, ReportPageChrome, ReportSheet } from "@/features/reports/components/report-page-shell";
import { findReportCenterEntry } from "@/features/reports/report-center-catalog";
import { REPORT_CENTER_ICON_MAP } from "@/features/reports/report-center-icons";
import { CASH_DENOMINATIONS_LAK } from "@/features/cash-sessions/denominations";
import { SHIFT_STATUSES, VARIANCE_STATUSES } from "@/features/reports/shift-table-math";
import { shiftTableExportHref, shiftTableHref } from "@/features/reports/shift-table-query";
import type { ShiftTableResult } from "@/features/reports/shift-table-repository";

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

function statusLabel(status: string, locale: SupportedLocale) {
  return status === "open" ? t("shiftStatusOpen", locale) : t("shiftStatusClosed", locale);
}

function varianceLabel(kind: string, locale: SupportedLocale) {
  if (kind === "balanced") return t("varianceBalanced", locale);
  if (kind === "over") return t("varianceOver", locale);
  if (kind === "short") return t("varianceShort", locale);
  if (kind === "open") return t("shiftStatusOpen", locale);
  return "—";
}

function ReportFrame({
  children,
  entryId,
  error,
  errorKey,
  locale,
}: {
  children?: ReactNode;
  entryId: string;
  error?: string;
  errorKey: string;
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
      ) : (
        children
      )}
    </div>
  );
}

function ShiftDetailDrawer({
  locale,
  onClose,
  ownOnly,
  shiftId,
}: {
  locale: SupportedLocale;
  onClose: () => void;
  ownOnly: boolean;
  shiftId: string;
}) {
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [detail, setDetail] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetch(`/api/reports/shifts/${shiftId}${ownOnly ? "?own=1" : ""}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !body?.ok) throw new Error("missing");
        if (!cancelled) {
          setDetail(body.data);
          setState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [ownOnly, shiftId]);

  const closing = detail?.countBreakdown?.closing as Record<string, number> | undefined;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <aside className="flex h-full w-full max-w-lg flex-col bg-white text-zinc-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <h2 className="text-base font-semibold">{t("shiftDetail", locale)}</h2>
          <button aria-label={t("close", locale)} className={`inline-flex size-10 items-center justify-center rounded-md ${focusRing}`} onClick={onClose} type="button">
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 text-sm">
          {state === "loading" ? <p>{t("loadingShiftTable", locale)}</p> : null}
          {state === "error" ? <p>{t("errorShiftTable", locale)}</p> : null}
          {state === "ready" && detail ? (
            <div className="flex flex-col gap-4">
              <div className="grid gap-1">
                <p><span className="text-zinc-500">{t("shiftSession", locale)}:</span> {detail.id}</p>
                <p><span className="text-zinc-500">{t("cashier", locale)}:</span> {detail.cashierName}</p>
                <p><span className="text-zinc-500">{t("branch", locale)}:</span> {detail.branchName}</p>
                <p><span className="text-zinc-500">{t("terminal", locale)}:</span> {detail.terminalName || "—"}</p>
                <p><span className="text-zinc-500">{t("openedAt", locale)}:</span> {String(detail.openedAt).slice(0, 16).replace("T", " ")}</p>
                <p><span className="text-zinc-500">{t("closedAt", locale)}:</span> {detail.closedAt ? String(detail.closedAt).slice(0, 16).replace("T", " ") : "—"}</p>
                <p><span className="text-zinc-500">{t("colStatus", locale)}:</span> {statusLabel(detail.status, locale)}</p>
                <p><span className="text-zinc-500">{t("openingCash", locale)}:</span> {formatLak(Number(detail.openingCashLak ?? 0))}</p>
                <p><span className="text-zinc-500">{t("grossCashSales", locale)}:</span> {formatLak(Number(detail.grossCashSalesLak ?? 0))}</p>
                <p><span className="text-zinc-500">{t("cashRefunds", locale)}:</span> {formatLak(Number(detail.cashRefundsLak ?? 0))}</p>
                <p><span className="text-zinc-500">{t("cashVoids", locale)}:</span> {formatLak(Number(detail.cashVoidsLak ?? 0))}</p>
                <p><span className="text-zinc-500">{t("cashIn", locale)}:</span> {formatLak(Number(detail.cashInLak ?? 0))}</p>
                <p><span className="text-zinc-500">{t("cashOut", locale)}:</span> {formatLak(Number(detail.cashOutLak ?? 0))}</p>
                <p><span className="text-zinc-500">{t("expectedDrawer", locale)}:</span> {formatLak(Number(detail.expectedDrawerLak ?? 0))}</p>
                <p><span className="text-zinc-500">{t("countedCash", locale)}:</span> {detail.countedCashLak == null ? "—" : formatLak(Number(detail.countedCashLak))}</p>
                <p><span className="text-zinc-500">{t("variance", locale)}:</span> {detail.varianceLak == null ? "—" : `${formatLak(Number(detail.varianceLak))} (${varianceLabel(String(detail.varianceKind), locale)})`}</p>
              </div>
              <div>
                <h3 className="mb-2 font-semibold">{t("denominationBreakdown", locale)}</h3>
                {closing && Object.keys(closing).length ? (
                  <ul className="divide-y divide-zinc-200 border-y border-zinc-200">
                    {CASH_DENOMINATIONS_LAK.map((denom) => {
                      const qty = Number(closing[String(denom)] ?? 0);
                      if (!qty) return null;
                      return (
                        <li className="flex justify-between gap-3 py-2" key={denom}>
                          <span>{formatNumber(denom)} × {qty}</span>
                          <span className="tabular-nums">{formatLak(denom * qty)}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-zinc-500">{t("noDenominationBreakdown", locale)}</p>
                )}
              </div>
              {(detail.movements ?? []).length ? (
                <div>
                  <h3 className="mb-2 font-semibold">{t("cashMovementHistory", locale)}</h3>
                  <ul className="divide-y divide-zinc-200 border-y border-zinc-200">
                    {(detail.movements ?? []).map((movement: Record<string, any>, index: number) => (
                      <li className="flex justify-between gap-3 py-2" key={`${movement.createdAt}-${index}`}>
                        <span>
                          {movement.type === "cash_in" ? t("cashIn", locale) : t("cashOut", locale)}
                          {movement.reason ? ` · ${movement.reason}` : ""}
                        </span>
                        <span className="tabular-nums">{formatLak(Number(movement.amountLak ?? 0))}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function ShiftReportView({
  data,
  entryId,
  error,
  errorKey,
  exportPath,
  locale: localeProp,
  ownOnly,
  pathname,
  showCashierFilter,
}: {
  data?: ShiftTableResult;
  entryId: string;
  error?: string;
  errorKey: string;
  exportPath: string;
  locale: SupportedLocale;
  ownOnly: boolean;
  pathname: string;
  showCashierFilter: boolean;
}) {
  const locale = useAppLocale(localeProp);
  const query = data?.query;
  const [shiftId, setShiftId] = useState(data?.query.shiftId ?? "");

  const summaryItems = useMemo(() => {
    if (!data) return [];
    const items = [
      { key: "shifts", label: ownOnly ? t("myShifts", locale) : t("totalShifts", locale), value: formatNumber(data.summary.totalShifts) },
    ];
    if (!ownOnly) {
      items.push(
        { key: "open", label: t("openShifts", locale), value: formatNumber(data.summary.openShifts) },
        { key: "closed", label: t("closedShifts", locale), value: formatNumber(data.summary.closedShifts) },
      );
    }
    items.push(
      { key: "gross", label: t("grossCashSales", locale), value: formatLak(data.summary.grossCashSalesLak) },
      { key: "refunds", label: t("cashRefunds", locale), value: formatLak(data.summary.cashRefundsLak) },
      { key: "voids", label: t("cashVoids", locale), value: formatLak(data.summary.cashVoidsLak) },
      { key: "in", label: t("cashIn", locale), value: formatLak(data.summary.cashInLak) },
      { key: "out", label: t("cashOut", locale), value: formatLak(data.summary.cashOutLak) },
      { key: "expected", label: t("expectedDrawer", locale), value: formatLak(data.summary.expectedDrawerLak) },
      { key: "counted", label: t("countedCash", locale), value: formatLak(data.summary.countedCashLak) },
      { key: "variance", label: t("totalVariance", locale), value: formatLak(data.summary.totalVarianceLak) },
    );
    return items;
  }, [data, locale, ownOnly]);

  return (
    <ReportFrame entryId={entryId} error={error} errorKey={errorKey} locale={locale}>
      {data && query ? (
        <>
          <ReportSheet>
            <form className="flex flex-col gap-3" method="get">
              <div className="flex flex-wrap gap-3">
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="sh-preset">
                  {t("dateRange", locale)}
                  <select className={fieldClass} defaultValue={query.datePreset} id="sh-preset" name="datePreset">
                    <option value="today">{t("today", locale)}</option>
                    <option value="yesterday">{t("yesterday", locale)}</option>
                    <option value="this_week">{t("thisWeek", locale)}</option>
                    <option value="this_month">{t("thisMonth", locale)}</option>
                    <option value="custom">{t("custom", locale)}</option>
                  </select>
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="sh-from">
                  {t("from", locale)}
                  <input className={fieldClass} defaultValue={String(query.dateFrom ?? "").slice(0, 10)} id="sh-from" name="dateFrom" type="date" />
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="sh-to">
                  {t("to", locale)}
                  <input className={fieldClass} defaultValue={String(query.dateTo ?? "").slice(0, 10)} id="sh-to" name="dateTo" type="date" />
                </label>
                {showCashierFilter ? (
                  <>
                    <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="sh-branch">
                      {t("branch", locale)}
                      <select className={fieldClass} defaultValue={query.branchId ?? ""} id="sh-branch" name="branchId">
                        <option value="">{t("allBranches", locale)}</option>
                        {data.filterOptions.branches.map((row) => (
                          <option key={row.id} value={row.id}>{row.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="sh-cashier">
                      {t("cashier", locale)}
                      <select className={fieldClass} defaultValue={query.cashierId ?? ""} id="sh-cashier" name="cashierId">
                        <option value="">{t("allCashiers", locale)}</option>
                        {data.filterOptions.cashiers.map((row) => (
                          <option key={row.id} value={row.id}>{row.label}</option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : null}
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="sh-status">
                  {t("status", locale)}
                  <select className={fieldClass} defaultValue={query.status} id="sh-status" name="status">
                    {SHIFT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status === "all" ? t("allStatuses", locale) : statusLabel(status, locale)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="sh-variance">
                  {t("varianceStatus", locale)}
                  <select className={fieldClass} defaultValue={query.varianceStatus} id="sh-variance" name="varianceStatus">
                    {VARIANCE_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status === "all"
                          ? t("allVarianceStatuses", locale)
                          : status === "balanced"
                            ? t("varianceBalanced", locale)
                            : status === "over"
                              ? t("varianceOver", locale)
                              : status === "short"
                                ? t("varianceShort", locale)
                                : t("shiftStatusOpen", locale)}
                      </option>
                    ))}
                  </select>
                </label>
                {showCashierFilter ? (
                  <label className="flex min-w-[12rem] flex-[2] flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="sh-q">
                    {t("sessionSearch", locale)}
                    <input className={fieldClass} defaultValue={query.sessionQuery ?? ""} id="sh-q" name="q" />
                  </label>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button className={`h-10 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white ${focusRing}`} type="submit">{t("apply", locale)}</button>
                <Link className={`inline-flex h-10 items-center rounded-md border border-zinc-300 bg-white px-4 text-sm ${focusRing}`} href={pathname}>{t("clear", locale)}</Link>
                <Link className={`inline-flex h-10 items-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium ${focusRing}`} href={shiftTableExportHref(exportPath, query)}>
                  {t("exportExcel", locale)}
                </Link>
              </div>
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
              <table className={`${gridTable} min-w-[1280px]`}>
                <thead>
                  <tr>
                    <th className={thCell}>{t("colNo", locale)}</th>
                    <th className={thCell}>{t("shiftSession", locale)}</th>
                    <th className={thCell}>{t("colDate", locale)}</th>
                    {showCashierFilter ? <th className={thCell}>{t("cashier", locale)}</th> : null}
                    <th className={thCell}>{t("branch", locale)}</th>
                    <th className={thCell}>{t("terminal", locale)}</th>
                    <th className={thCell}>{t("openedAt", locale)}</th>
                    <th className={thCell}>{t("closedAt", locale)}</th>
                    <th className={thCell}>{t("colStatus", locale)}</th>
                    <th className={`${thCell} ${numClass}`}>{t("openingCash", locale)}</th>
                    <th className={`${thCell} ${numClass}`}>{t("grossCashSales", locale)}</th>
                    <th className={`${thCell} ${numClass}`}>{t("cashRefunds", locale)}</th>
                    <th className={`${thCell} ${numClass}`}>{t("cashVoids", locale)}</th>
                    <th className={`${thCell} ${numClass}`}>{t("cashIn", locale)}</th>
                    <th className={`${thCell} ${numClass}`}>{t("cashOut", locale)}</th>
                    <th className={`${thCell} ${numClass}`}>{t("expectedDrawer", locale)}</th>
                    <th className={`${thCell} ${numClass}`}>{t("countedCash", locale)}</th>
                    <th className={`${thCell} ${numClass}`}>{t("variance", locale)}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 ? (
                    <tr>
                      <td className={tdCell} colSpan={showCashierFilter ? 18 : 17}>
                        <p className="py-6 text-center text-sm text-zinc-600">{t("emptyShiftTable", locale)}</p>
                      </td>
                    </tr>
                  ) : (
                    data.rows.map((row, index) => (
                      <tr className="group cursor-pointer" key={row.id} onClick={() => setShiftId(row.id)}>
                        <td className={`${tdCell} ${numClass}`}>{(data.page - 1) * data.pageSize + index + 1}</td>
                        <td className={tdCell}>
                          <button className={`font-medium underline-offset-2 hover:underline ${focusRing}`} onClick={() => setShiftId(row.id)} type="button">
                            {row.id.slice(0, 10)}…
                          </button>
                        </td>
                        <td className={tdCell}>{row.openedAt.slice(0, 10)}</td>
                        {showCashierFilter ? <td className={tdCell}>{row.cashierName}</td> : null}
                        <td className={tdCell}>{row.branchName}</td>
                        <td className={tdCell}>{row.terminalName || "—"}</td>
                        <td className={tdCell}>{row.openedAt.slice(0, 16).replace("T", " ")}</td>
                        <td className={tdCell}>{row.closedAt ? row.closedAt.slice(0, 16).replace("T", " ") : "—"}</td>
                        <td className={tdCell}>{statusLabel(row.status, locale)}</td>
                        <td className={`${tdCell} ${numClass}`}>{formatLak(row.openingCashLak)}</td>
                        <td className={`${tdCell} ${numClass}`}>{formatLak(row.grossCashSalesLak)}</td>
                        <td className={`${tdCell} ${numClass}`}>{formatLak(row.cashRefundsLak)}</td>
                        <td className={`${tdCell} ${numClass}`}>{formatLak(row.cashVoidsLak)}</td>
                        <td className={`${tdCell} ${numClass}`}>{formatLak(row.cashInLak)}</td>
                        <td className={`${tdCell} ${numClass}`}>{formatLak(row.cashOutLak)}</td>
                        <td className={`${tdCell} ${numClass}`}>{formatLak(row.expectedDrawerLak)}</td>
                        <td className={`${tdCell} ${numClass}`}>{row.countedCashLak == null ? "—" : formatLak(row.countedCashLak)}</td>
                        <td className={`${tdCell} ${numClass}`}>
                          {row.varianceLak == null ? "—" : `${formatLak(row.varianceLak)} (${varianceLabel(row.varianceKind, locale)})`}
                        </td>
                      </tr>
                    ))
                  )}
                  {data.rows.length > 0 ? (
                    <tr>
                      <td className={tdTotal} colSpan={showCashierFilter ? 9 : 8}>{t("total", locale)} ({formatNumber(data.totalRow.rowCount)})</td>
                      <td className={`${tdTotal} ${numClass}`}>{formatLak(data.totalRow.openingCashLak)}</td>
                      <td className={`${tdTotal} ${numClass}`}>{formatLak(data.totalRow.grossCashSalesLak)}</td>
                      <td className={`${tdTotal} ${numClass}`}>{formatLak(data.totalRow.cashRefundsLak)}</td>
                      <td className={`${tdTotal} ${numClass}`}>{formatLak(data.totalRow.cashVoidsLak)}</td>
                      <td className={`${tdTotal} ${numClass}`}>{formatLak(data.totalRow.cashInLak)}</td>
                      <td className={`${tdTotal} ${numClass}`}>{formatLak(data.totalRow.cashOutLak)}</td>
                      <td className={`${tdTotal} ${numClass}`}>{formatLak(data.totalRow.expectedDrawerLak)}</td>
                      <td className={`${tdTotal} ${numClass}`}>{formatLak(data.totalRow.countedCashLak)}</td>
                      <td className={`${tdTotal} ${numClass}`}>{formatLak(data.totalRow.varianceLak)}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {data.pageCount > 1 ? (
              <div className="mt-3 flex items-center justify-between text-sm text-zinc-600">
                <span>{fillReportsCopy(t("pageOf", locale), { page: data.page, pages: data.pageCount })}</span>
                <div className="flex gap-2">
                  {data.page > 1 ? <Link className={`rounded-md border border-zinc-300 px-3 py-1 ${focusRing}`} href={shiftTableHref(pathname, query, { page: data.page - 1 })}>{t("previous", locale)}</Link> : null}
                  {data.page < data.pageCount ? <Link className={`rounded-md border border-zinc-300 px-3 py-1 ${focusRing}`} href={shiftTableHref(pathname, query, { page: data.page + 1 })}>{t("next", locale)}</Link> : null}
                </div>
              </div>
            ) : null}
          </ReportSheet>
          {shiftId ? <ShiftDetailDrawer locale={locale} onClose={() => setShiftId("")} ownOnly={ownOnly} shiftId={shiftId} /> : null}
        </>
      ) : null}
    </ReportFrame>
  );
}

export function ShiftSummaryReportView(props: { data?: ShiftTableResult; error?: string; locale: SupportedLocale }) {
  return (
    <ShiftReportView
      {...props}
      entryId="shifts-summary"
      errorKey="errorShiftTable"
      exportPath="/api/reports/shifts/summary/export"
      ownOnly={false}
      pathname="/reports/shifts/summary"
      showCashierFilter
    />
  );
}

export function OwnShiftHistoryReportView(props: { data?: ShiftTableResult; error?: string; locale: SupportedLocale }) {
  return (
    <ShiftReportView
      {...props}
      entryId="shifts-own-history"
      errorKey="errorShiftTable"
      exportPath="/api/reports/shifts/own-history/export"
      ownOnly
      pathname="/reports/shifts/own-history"
      showCashierFilter={false}
    />
  );
}
