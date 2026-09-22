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
import { CASH_COUNT_STATUSES, CASH_COUNT_VARIANCE, CASH_MOVEMENT_TYPES } from "@/features/reports/cash-report-math";
import {
  cashCountExportHref,
  cashCountTableHref,
  cashMovementExportHref,
  cashMovementTableHref,
} from "@/features/reports/cash-report-query";
import type { CashCountTableResult, CashMovementTableResult } from "@/features/reports/cash-report-repository";

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

function CountDetailDrawer({
  locale,
  onClose,
  sessionId,
}: {
  locale: SupportedLocale;
  onClose: () => void;
  sessionId: string;
}) {
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [detail, setDetail] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetch(`/api/reports/shifts/cash-counts/${encodeURIComponent(sessionId)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.ok) throw new Error("load");
        if (!cancelled) {
          setDetail(payload.data);
          setState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const closing = detail?.countBreakdown?.closing ?? null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <aside className="flex h-full w-full max-w-md flex-col border-l border-zinc-300 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <h2 className="text-base font-semibold">{t("cashCountDetail", locale)}</h2>
          <button aria-label={t("close", locale)} className={`inline-flex size-10 items-center justify-center rounded-md ${focusRing}`} onClick={onClose} type="button">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 text-sm">
          {state === "loading" ? <p>{t("loadingCashCountTable", locale)}</p> : null}
          {state === "error" ? <p>{t("errorCashCountTable", locale)}</p> : null}
          {state === "ready" && detail ? (
            <div className="flex flex-col gap-4">
              <div className="grid gap-2">
                <p><span className="text-zinc-500">{t("shiftSession", locale)}:</span> {detail.id}</p>
                <p><span className="text-zinc-500">{t("countedBy", locale)}:</span> {detail.countedByName}</p>
                <p><span className="text-zinc-500">{t("branch", locale)}:</span> {detail.branchName}</p>
                <p><span className="text-zinc-500">{t("terminal", locale)}:</span> {detail.terminalName || "—"}</p>
                <p><span className="text-zinc-500">{t("countedAt", locale)}:</span> {detail.countedAt ? String(detail.countedAt).slice(0, 16).replace("T", " ") : "—"}</p>
                <p><span className="text-zinc-500">{t("expectedCash", locale)}:</span> {formatLak(Number(detail.expectedCashLak ?? 0))}</p>
                <p><span className="text-zinc-500">{t("countedCash", locale)}:</span> {detail.countedCashLak == null ? "—" : formatLak(Number(detail.countedCashLak))}</p>
                <p><span className="text-zinc-500">{t("variance", locale)}:</span> {detail.varianceLak == null ? "—" : `${formatLak(Number(detail.varianceLak))} (${varianceLabel(String(detail.varianceKind), locale)})`}</p>
              </div>
              <div>
                <h3 className="mb-2 font-semibold">{t("denominationBreakdown", locale)}</h3>
                {closing && Object.keys(closing).length ? (
                  <table className={gridTable}>
                    <thead>
                      <tr>
                        <th className={thCell}>{t("denomination", locale)}</th>
                        <th className={`${thCell} ${numClass}`}>{t("qty", locale)}</th>
                        <th className={`${thCell} ${numClass}`}>{t("amount", locale)}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {CASH_DENOMINATIONS_LAK.map((denom) => {
                        const qty = Number(closing[String(denom)] ?? 0);
                        if (!qty) return null;
                        return (
                          <tr key={denom}>
                            <td className={tdCell}>{formatNumber(denom)}</td>
                            <td className={`${tdCell} ${numClass}`}>{qty}</td>
                            <td className={`${tdCell} ${numClass}`}>{formatLak(denom * qty)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-zinc-500">{t("noDenominationBreakdown", locale)}</p>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function MovementDetailDrawer({
  locale,
  movementId,
  onClose,
}: {
  locale: SupportedLocale;
  movementId: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [detail, setDetail] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetch(`/api/reports/shifts/cash-movements/${encodeURIComponent(movementId)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.ok) throw new Error("load");
        if (!cancelled) {
          setDetail(payload.data);
          setState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [movementId]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <aside className="flex h-full w-full max-w-md flex-col border-l border-zinc-300 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <h2 className="text-base font-semibold">{t("cashMovementDetail", locale)}</h2>
          <button aria-label={t("close", locale)} className={`inline-flex size-10 items-center justify-center rounded-md ${focusRing}`} onClick={onClose} type="button">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 text-sm">
          {state === "loading" ? <p>{t("loadingCashMovementTable", locale)}</p> : null}
          {state === "error" ? <p>{t("errorCashMovementTable", locale)}</p> : null}
          {state === "ready" && detail ? (
            <div className="grid gap-2">
              <p><span className="text-zinc-500">{t("postSaleType", locale)}:</span> {detail.type === "cash_in" ? t("cashIn", locale) : t("cashOut", locale)}</p>
              <p><span className="text-zinc-500">{t("amount", locale)}:</span> {formatLak(Number(detail.amountLak ?? 0))}</p>
              <p><span className="text-zinc-500">{t("colDateTime", locale)}:</span> {String(detail.createdAt).slice(0, 16).replace("T", " ")}</p>
              <p><span className="text-zinc-500">{t("reason", locale)}:</span> {detail.reason || "—"}</p>
              <p><span className="text-zinc-500">{t("reference", locale)}:</span> {detail.reference || "—"}</p>
              <p><span className="text-zinc-500">{t("actor", locale)}:</span> {detail.actorName}</p>
              <p><span className="text-zinc-500">{t("branch", locale)}:</span> {detail.branchName}</p>
              <p><span className="text-zinc-500">{t("terminal", locale)}:</span> {detail.terminalName || "—"}</p>
              <p><span className="text-zinc-500">{t("shiftSession", locale)}:</span> {detail.sessionId || t("noLinkedShift", locale)}</p>
              <p><span className="text-zinc-500">{t("note", locale)}:</span> {detail.note || "—"}</p>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

export function CashShiftCountReportView(props: { data?: CashCountTableResult; error?: string; locale: SupportedLocale }) {
  const locale = useAppLocale(props.locale);
  const data = props.data;
  const query = data?.query;
  const pathname = "/reports/shifts/cash-counts";
  const [sessionId, setSessionId] = useState("");

  const summaryItems = useMemo(() => {
    if (!data) return [];
    return [
      { key: "total", label: t("totalCounts", locale), value: formatNumber(data.summary.totalCounts) },
      { key: "balanced", label: t("varianceBalanced", locale), value: formatNumber(data.summary.balancedCounts) },
      { key: "over", label: t("varianceOver", locale), value: formatNumber(data.summary.overCounts) },
      { key: "short", label: t("varianceShort", locale), value: formatNumber(data.summary.shortCounts) },
      { key: "expected", label: t("expectedCash", locale), value: formatLak(data.summary.expectedCashLak) },
      { key: "counted", label: t("countedCash", locale), value: formatLak(data.summary.countedCashLak) },
      { key: "variance", label: t("totalVariance", locale), value: formatLak(data.summary.totalVarianceLak) },
      { key: "totalOver", label: t("totalOver", locale), value: formatLak(data.summary.totalOverLak) },
      { key: "totalShort", label: t("totalShort", locale), value: formatLak(data.summary.totalShortLak) },
    ];
  }, [data, locale]);

  return (
    <ReportFrame entryId="shifts-cash-count" error={props.error} errorKey="errorCashCountTable" locale={locale}>
      {data && query ? (
        <>
          <ReportSheet>
            <form className="flex flex-col gap-3" method="get">
              <div className="flex flex-wrap gap-3">
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="cc-preset">
                  {t("dateRange", locale)}
                  <select className={fieldClass} defaultValue={query.datePreset} id="cc-preset" name="datePreset">
                    <option value="today">{t("today", locale)}</option>
                    <option value="yesterday">{t("yesterday", locale)}</option>
                    <option value="this_week">{t("thisWeek", locale)}</option>
                    <option value="this_month">{t("thisMonth", locale)}</option>
                    <option value="custom">{t("custom", locale)}</option>
                  </select>
                </label>
                <label className="flex min-w-[9rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="cc-from">
                  {t("from", locale)}
                  <input className={fieldClass} defaultValue={query.dateFrom ? String(query.dateFrom).slice(0, 10) : ""} id="cc-from" name="dateFrom" type="date" />
                </label>
                <label className="flex min-w-[9rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="cc-to">
                  {t("to", locale)}
                  <input className={fieldClass} defaultValue={query.dateTo ? String(query.dateTo).slice(0, 10) : ""} id="cc-to" name="dateTo" type="date" />
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="cc-branch">
                  {t("branch", locale)}
                  <select className={fieldClass} defaultValue={query.branchId ?? ""} id="cc-branch" name="branchId">
                    <option value="">{t("allBranches", locale)}</option>
                    {data.filterOptions.branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>{branch.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="cc-cashier">
                  {t("cashier", locale)}
                  <select className={fieldClass} defaultValue={query.cashierId ?? ""} id="cc-cashier" name="cashierId">
                    <option value="">{t("allCashiers", locale)}</option>
                    {data.filterOptions.cashiers.map((cashier) => (
                      <option key={cashier.id} value={cashier.id}>{cashier.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-[9rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="cc-status">
                  {t("status", locale)}
                  <select className={fieldClass} defaultValue={query.status} id="cc-status" name="status">
                    {CASH_COUNT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status === "all" ? t("allStatuses", locale) : status === "open" ? t("shiftStatusOpen", locale) : t("shiftStatusClosed", locale)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="cc-variance">
                  {t("varianceStatus", locale)}
                  <select className={fieldClass} defaultValue={query.varianceStatus} id="cc-variance" name="varianceStatus">
                    {CASH_COUNT_VARIANCE.map((status) => (
                      <option key={status} value={status}>
                        {status === "all" ? t("allVarianceStatuses", locale) : varianceLabel(status, locale)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="cc-q">
                  {t("sessionSearch", locale)}
                  <input className={fieldClass} defaultValue={query.sessionQuery ?? ""} id="cc-q" name="q" />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className={`h-10 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white ${focusRing}`} type="submit">{t("apply", locale)}</button>
                <Link className={`inline-flex h-10 items-center rounded-md border border-zinc-300 bg-white px-4 text-sm ${focusRing}`} href={pathname}>{t("clear", locale)}</Link>
                <Link className={`inline-flex h-10 items-center rounded-md border border-zinc-300 bg-white px-4 text-sm ${focusRing}`} href={cashCountExportHref("/api/reports/shifts/cash-counts/export", query)}>
                  {t("exportExcel", locale)}
                </Link>
              </div>
            </form>
          </ReportSheet>
          <ReportSheet>
            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {summaryItems.map((item) => (
                <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2" key={item.key}>
                  <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{item.label}</div>
                  <div className="mt-1 text-base font-semibold tabular-nums text-zinc-900">{item.value}</div>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className={gridTable}>
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className={thCell}>{t("colNo", locale)}</th>
                    <th className={thCell}>{t("countDateTime", locale)}</th>
                    <th className={thCell}>{t("shiftSession", locale)}</th>
                    <th className={thCell}>{t("cashier", locale)}</th>
                    <th className={thCell}>{t("branch", locale)}</th>
                    <th className={thCell}>{t("terminal", locale)}</th>
                    <th className={`${thCell} ${numClass}`}>{t("expectedCash", locale)}</th>
                    <th className={`${thCell} ${numClass}`}>{t("countedCash", locale)}</th>
                    <th className={`${thCell} ${numClass}`}>{t("variance", locale)}</th>
                    <th className={thCell}>{t("colStatus", locale)}</th>
                    <th className={thCell}>{t("countedBy", locale)}</th>
                    <th className={thCell}>{t("note", locale)}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 ? (
                    <tr>
                      <td className={tdCell} colSpan={12}>
                        <p className="py-6 text-center text-sm text-zinc-600">{t("emptyCashCountTable", locale)}</p>
                      </td>
                    </tr>
                  ) : (
                    data.rows.map((row, index) => (
                      <tr className="group cursor-pointer" key={row.id} onClick={() => setSessionId(row.id)}>
                        <td className={`${tdCell} ${numClass}`}>{(data.page - 1) * data.pageSize + index + 1}</td>
                        <td className={tdCell}>{row.countedAt ? row.countedAt.slice(0, 16).replace("T", " ") : "—"}</td>
                        <td className={tdCell}>
                          <button className={`font-medium underline-offset-2 hover:underline ${focusRing}`} onClick={() => setSessionId(row.id)} type="button">
                            {row.id.slice(0, 10)}…
                          </button>
                        </td>
                        <td className={tdCell}>{row.countedByName}</td>
                        <td className={tdCell}>{row.branchName}</td>
                        <td className={tdCell}>{row.terminalName || "—"}</td>
                        <td className={`${tdCell} ${numClass}`}>{formatLak(row.expectedCashLak)}</td>
                        <td className={`${tdCell} ${numClass}`}>{row.countedCashLak == null ? "—" : formatLak(row.countedCashLak)}</td>
                        <td className={`${tdCell} ${numClass}`}>{row.varianceLak == null ? "—" : formatLak(row.varianceLak)}</td>
                        <td className={tdCell}>{varianceLabel(row.varianceKind, locale)}</td>
                        <td className={tdCell}>{row.countedByName}</td>
                        <td className={tdCell}>{row.note || "—"}</td>
                      </tr>
                    ))
                  )}
                  {data.rows.length > 0 ? (
                    <tr>
                      <td className={tdTotal} colSpan={6}>{t("total", locale)} ({formatNumber(data.totalRow.rowCount)})</td>
                      <td className={`${tdTotal} ${numClass}`}>{formatLak(data.totalRow.expectedCashLak)}</td>
                      <td className={`${tdTotal} ${numClass}`}>{formatLak(data.totalRow.countedCashLak)}</td>
                      <td className={`${tdTotal} ${numClass}`}>{formatLak(data.totalRow.varianceLak)}</td>
                      <td className={tdTotal} colSpan={3} />
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {data.pageCount > 1 ? (
              <div className="mt-3 flex items-center justify-between text-sm text-zinc-600">
                <span>{fillReportsCopy(t("pageOf", locale), { page: data.page, pages: data.pageCount })}</span>
                <div className="flex gap-2">
                  {data.page > 1 ? <Link className={`rounded-md border border-zinc-300 px-3 py-1 ${focusRing}`} href={cashCountTableHref(pathname, query, { page: data.page - 1 })}>{t("previous", locale)}</Link> : null}
                  {data.page < data.pageCount ? <Link className={`rounded-md border border-zinc-300 px-3 py-1 ${focusRing}`} href={cashCountTableHref(pathname, query, { page: data.page + 1 })}>{t("next", locale)}</Link> : null}
                </div>
              </div>
            ) : null}
          </ReportSheet>
          {sessionId ? <CountDetailDrawer locale={locale} onClose={() => setSessionId("")} sessionId={sessionId} /> : null}
        </>
      ) : null}
    </ReportFrame>
  );
}

export function CashMovementReportView(props: { data?: CashMovementTableResult; error?: string; locale: SupportedLocale }) {
  const locale = useAppLocale(props.locale);
  const data = props.data;
  const query = data?.query;
  const pathname = "/reports/shifts/cash-movements";
  const [movementId, setMovementId] = useState("");

  const summaryItems = useMemo(() => {
    if (!data) return [];
    return [
      { key: "total", label: t("totalMovements", locale), value: formatNumber(data.summary.totalMovements) },
      { key: "inTx", label: t("cashInTransactions", locale), value: formatNumber(data.summary.cashInCount) },
      { key: "outTx", label: t("cashOutTransactions", locale), value: formatNumber(data.summary.cashOutCount) },
      { key: "in", label: t("totalCashIn", locale), value: formatLak(data.summary.cashInLak) },
      { key: "out", label: t("totalCashOut", locale), value: formatLak(data.summary.cashOutLak) },
      { key: "net", label: t("netCashMovement", locale), value: formatLak(data.summary.netMovementLak) },
    ];
  }, [data, locale]);

  return (
    <ReportFrame entryId="shifts-cash-in-out" error={props.error} errorKey="errorCashMovementTable" locale={locale}>
      {data && query ? (
        <>
          <ReportSheet>
            <form className="flex flex-col gap-3" method="get">
              <div className="flex flex-wrap gap-3">
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="cm-preset">
                  {t("dateRange", locale)}
                  <select className={fieldClass} defaultValue={query.datePreset} id="cm-preset" name="datePreset">
                    <option value="today">{t("today", locale)}</option>
                    <option value="yesterday">{t("yesterday", locale)}</option>
                    <option value="this_week">{t("thisWeek", locale)}</option>
                    <option value="this_month">{t("thisMonth", locale)}</option>
                    <option value="custom">{t("custom", locale)}</option>
                  </select>
                </label>
                <label className="flex min-w-[9rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="cm-from">
                  {t("from", locale)}
                  <input className={fieldClass} defaultValue={query.dateFrom ? String(query.dateFrom).slice(0, 10) : ""} id="cm-from" name="dateFrom" type="date" />
                </label>
                <label className="flex min-w-[9rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="cm-to">
                  {t("to", locale)}
                  <input className={fieldClass} defaultValue={query.dateTo ? String(query.dateTo).slice(0, 10) : ""} id="cm-to" name="dateTo" type="date" />
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="cm-branch">
                  {t("branch", locale)}
                  <select className={fieldClass} defaultValue={query.branchId ?? ""} id="cm-branch" name="branchId">
                    <option value="">{t("allBranches", locale)}</option>
                    {data.filterOptions.branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>{branch.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="cm-actor">
                  {t("actor", locale)}
                  <select className={fieldClass} defaultValue={query.actorId ?? ""} id="cm-actor" name="actorId">
                    <option value="">{t("allCashiers", locale)}</option>
                    {data.filterOptions.cashiers.map((cashier) => (
                      <option key={cashier.id} value={cashier.id}>{cashier.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-[9rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="cm-type">
                  {t("postSaleType", locale)}
                  <select className={fieldClass} defaultValue={query.type} id="cm-type" name="type">
                    {CASH_MOVEMENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type === "all" ? t("allTypes", locale) : type === "cash_in" ? t("cashIn", locale) : t("cashOut", locale)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="cm-reason">
                  {t("reason", locale)}
                  <input className={fieldClass} defaultValue={query.reasonQuery ?? ""} id="cm-reason" name="reason" />
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="cm-session">
                  {t("sessionSearch", locale)}
                  <input className={fieldClass} defaultValue={query.sessionQuery ?? ""} id="cm-session" name="session" />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className={`h-10 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white ${focusRing}`} type="submit">{t("apply", locale)}</button>
                <Link className={`inline-flex h-10 items-center rounded-md border border-zinc-300 bg-white px-4 text-sm ${focusRing}`} href={pathname}>{t("clear", locale)}</Link>
                <Link className={`inline-flex h-10 items-center rounded-md border border-zinc-300 bg-white px-4 text-sm ${focusRing}`} href={cashMovementExportHref("/api/reports/shifts/cash-movements/export", query)}>
                  {t("exportExcel", locale)}
                </Link>
              </div>
            </form>
          </ReportSheet>
          <ReportSheet>
            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {summaryItems.map((item) => (
                <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2" key={item.key}>
                  <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{item.label}</div>
                  <div className="mt-1 text-base font-semibold tabular-nums text-zinc-900">{item.value}</div>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className={gridTable}>
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className={thCell}>{t("colNo", locale)}</th>
                    <th className={thCell}>{t("colDateTime", locale)}</th>
                    <th className={thCell}>{t("postSaleType", locale)}</th>
                    <th className={`${thCell} ${numClass}`}>{t("amount", locale)}</th>
                    <th className={thCell}>{t("reason", locale)}</th>
                    <th className={thCell}>{t("reference", locale)}</th>
                    <th className={thCell}>{t("actor", locale)}</th>
                    <th className={thCell}>{t("shiftSession", locale)}</th>
                    <th className={thCell}>{t("branch", locale)}</th>
                    <th className={thCell}>{t("terminal", locale)}</th>
                    <th className={thCell}>{t("note", locale)}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 ? (
                    <tr>
                      <td className={tdCell} colSpan={11}>
                        <p className="py-6 text-center text-sm text-zinc-600">{t("emptyCashMovementTable", locale)}</p>
                      </td>
                    </tr>
                  ) : (
                    data.rows.map((row, index) => (
                      <tr className="group cursor-pointer" key={row.id} onClick={() => setMovementId(row.id)}>
                        <td className={`${tdCell} ${numClass}`}>{(data.page - 1) * data.pageSize + index + 1}</td>
                        <td className={tdCell}>{row.createdAt.slice(0, 16).replace("T", " ")}</td>
                        <td className={tdCell}>{row.type === "cash_in" ? t("cashIn", locale) : t("cashOut", locale)}</td>
                        <td className={`${tdCell} ${numClass}`}>{formatLak(row.amountLak)}</td>
                        <td className={tdCell}>{row.reason || "—"}</td>
                        <td className={tdCell}>{row.reference || "—"}</td>
                        <td className={tdCell}>{row.actorName}</td>
                        <td className={tdCell}>{row.sessionId ? `${row.sessionId.slice(0, 10)}…` : t("noLinkedShift", locale)}</td>
                        <td className={tdCell}>{row.branchName}</td>
                        <td className={tdCell}>{row.terminalName || "—"}</td>
                        <td className={tdCell}>{row.note || "—"}</td>
                      </tr>
                    ))
                  )}
                  {data.rows.length > 0 ? (
                    <tr>
                      <td className={tdTotal} colSpan={3}>{t("total", locale)} ({formatNumber(data.totalRow.rowCount)})</td>
                      <td className={`${tdTotal} ${numClass}`}>{formatLak(data.totalRow.netMovementLak)}</td>
                      <td className={tdTotal} colSpan={2}>
                        {t("totalCashIn", locale)} {formatLak(data.totalRow.cashInLak)} · {t("totalCashOut", locale)} {formatLak(data.totalRow.cashOutLak)}
                      </td>
                      <td className={tdTotal} colSpan={5} />
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {data.pageCount > 1 ? (
              <div className="mt-3 flex items-center justify-between text-sm text-zinc-600">
                <span>{fillReportsCopy(t("pageOf", locale), { page: data.page, pages: data.pageCount })}</span>
                <div className="flex gap-2">
                  {data.page > 1 ? <Link className={`rounded-md border border-zinc-300 px-3 py-1 ${focusRing}`} href={cashMovementTableHref(pathname, query, { page: data.page - 1 })}>{t("previous", locale)}</Link> : null}
                  {data.page < data.pageCount ? <Link className={`rounded-md border border-zinc-300 px-3 py-1 ${focusRing}`} href={cashMovementTableHref(pathname, query, { page: data.page + 1 })}>{t("next", locale)}</Link> : null}
                </div>
              </div>
            ) : null}
          </ReportSheet>
          {movementId ? <MovementDetailDrawer locale={locale} movementId={movementId} onClose={() => setMovementId("")} /> : null}
        </>
      ) : null}
    </ReportFrame>
  );
}
