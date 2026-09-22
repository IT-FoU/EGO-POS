"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { SupportedLocale } from "@/lib/constants";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import { fillReportsCopy, paymentMethodLabel, tReports } from "@/lib/i18n/reports-copy";
import { formatLak, formatNumber } from "@/features/reports/format";
import { ReportDetailHeader, ReportPageChrome, ReportSheet } from "@/features/reports/components/report-page-shell";
import { findReportCenterEntry } from "@/features/reports/report-center-catalog";
import { REPORT_CENTER_ICON_MAP } from "@/features/reports/report-center-icons";
import { POSTSALE_EVENT_TYPES } from "@/features/reports/postsale-table-math";
import { postSaleTableExportHref, postSaleTableHref } from "@/features/reports/postsale-table-query";
import type { PostSaleEventResult, ReceiptSalesResult } from "@/features/reports/postsale-table-repository";
import { SALES_TABLE_PAYMENT_METHODS, SALES_TABLE_STATUSES, saleStatusCopyKey } from "@/features/reports/sales-table-math";

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

function eventTypeLabel(type: string, locale: SupportedLocale) {
  const map: Record<string, string> = {
    refund: t("postSaleTypeRefund", locale),
    partial_refund: t("postSaleTypePartialRefund", locale),
    full_refund: t("postSaleTypeFullRefund", locale),
    void: t("postSaleTypeVoid", locale),
    exchange: t("postSaleTypeExchange", locale),
  };
  return map[type] || type;
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
      <aside className="flex h-full w-full max-w-lg flex-col bg-white text-zinc-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <h2 className="text-base font-semibold">{t("saleDetail", locale)}</h2>
          <button aria-label={t("close", locale)} className={`inline-flex size-10 items-center justify-center rounded-md ${focusRing}`} onClick={onClose} type="button">
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 text-sm">
          {state === "loading" ? <p>{t("loadingReceiptTable", locale)}</p> : null}
          {state === "error" ? <p>{t("errorReceiptTable", locale)}</p> : null}
          {state === "ready" && sale ? (
            <div className="flex flex-col gap-4">
              <div className="grid gap-1">
                <p><span className="text-zinc-500">{t("colReceipt", locale)}:</span> {sale.receiptNo || sale.saleNo}</p>
                <p><span className="text-zinc-500">{t("colDateTime", locale)}:</span> {String(sale.createdAt ?? "").slice(0, 16).replace("T", " ")}</p>
                <p><span className="text-zinc-500">{t("cashier", locale)}:</span> {sale.cashierName}</p>
                <p><span className="text-zinc-500">{t("customer", locale)}:</span> {sale.customerName || "—"}</p>
                <p><span className="text-zinc-500">{t("colStatus", locale)}:</span> {t(saleStatusCopyKey(String(sale.status ?? "")), locale)}</p>
                <p><span className="text-zinc-500">{t("colGross", locale)}:</span> {formatLak(Number(sale.totalAmount ?? 0))}</p>
                <p><span className="text-zinc-500">{t("colDiscount", locale)}:</span> {formatLak(Number(sale.discountAmount ?? 0))}</p>
                <p><span className="text-zinc-500">{t("colRefund", locale)}:</span> {formatLak(Number(sale.refundedAmountLak ?? 0))}</p>
                <p><span className="text-zinc-500">{t("colNet", locale)}:</span> {formatLak(Math.max(0, Number(sale.totalAmount ?? 0) - Number(sale.refundedAmountLak ?? 0)))}</p>
              </div>
              <div>
                <h3 className="mb-2 font-semibold">{t("colItems", locale)}</h3>
                <ul className="divide-y divide-zinc-200 border-y border-zinc-200">
                  {(sale.items ?? []).map((item: Record<string, any>, index: number) => (
                    <li className="flex justify-between gap-3 py-2" key={`${item.id ?? "item"}-${item.unitId ?? index}`}>
                      <span>
                        {item.nameEn || item.nameLo}
                        {item.unitName ? ` (${item.unitName})` : ""}
                      </span>
                      <span className="tabular-nums">
                        {item.quantity} × {formatLak(Number(item.priceLak ?? 0))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-2 font-semibold">{t("colPayment", locale)}</h3>
                <ul className="divide-y divide-zinc-200 border-y border-zinc-200">
                  {(sale.paymentBreakdown ?? []).map((payment: Record<string, any>, index: number) => (
                    <li className="flex justify-between gap-3 py-2" key={`${payment.method}-${index}`}>
                      <span>{paymentMethodLabel(String(payment.method ?? "cash"), locale)}</span>
                      <span className="tabular-nums">{formatLak(Number(payment.amountLak ?? 0))}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {(sale.timeline ?? []).length > 1 ? (
                <div>
                  <h3 className="mb-2 font-semibold">{t("postSaleHistory", locale)}</h3>
                  <ul className="divide-y divide-zinc-200 border-y border-zinc-200">
                    {(sale.timeline ?? []).map((event: Record<string, any>, index: number) => (
                      <li className="flex justify-between gap-3 py-2" key={`${event.at}-${index}`}>
                        <span>
                          {String(event.label ?? "")}
                          {event.user ? ` · ${event.user}` : ""}
                        </span>
                        <span className="tabular-nums text-zinc-500">{String(event.at ?? "").slice(0, 16).replace("T", " ")}</span>
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

export function RefundVoidReportView({
  data,
  error,
  locale: localeProp,
}: {
  data?: PostSaleEventResult;
  error?: string;
  locale: SupportedLocale;
}) {
  const locale = useAppLocale(localeProp);
  const pathname = "/reports/sales/refunds-voids";
  const query = data?.query;
  const [saleId, setSaleId] = useState(data?.query.saleId ?? "");

  const summaryItems = useMemo(() => {
    if (!data) return [];
    return [
      { key: "rt", label: t("refundTransactions", locale), value: formatNumber(data.summary.refundTransactions) },
      { key: "vt", label: t("voidTransactions", locale), value: formatNumber(data.summary.voidTransactions) },
      { key: "ra", label: t("refundAmount", locale), value: formatLak(data.summary.refundAmountLak) },
      { key: "cr", label: t("cashRefunds", locale), value: formatLak(data.summary.cashRefundLak) },
      { key: "nr", label: t("noncashRefunds", locale), value: formatLak(data.summary.noncashRefundLak) },
      { key: "va", label: t("voidAmount", locale), value: formatLak(data.summary.voidAmountLak) },
      { key: "ir", label: t("itemsReturned", locale), value: formatNumber(data.summary.itemsReturned) },
      { key: "net", label: t("netPostSaleEffect", locale), value: formatLak(data.summary.netPostSaleEffectLak) },
    ];
  }, [data, locale]);

  return (
    <ReportFrame entryId="sales-refunds-voids" error={error} errorKey="errorRefundVoidTable" locale={locale}>
      {data && query ? (
        <>
          <ReportSheet>
            <form className="flex flex-col gap-3" method="get">
              <div className="flex flex-wrap gap-3">
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="rv-preset">
                  {t("dateRange", locale)}
                  <select className={fieldClass} defaultValue={query.datePreset} id="rv-preset" name="datePreset">
                    <option value="today">{t("today", locale)}</option>
                    <option value="yesterday">{t("yesterday", locale)}</option>
                    <option value="this_week">{t("thisWeek", locale)}</option>
                    <option value="this_month">{t("thisMonth", locale)}</option>
                    <option value="custom">{t("custom", locale)}</option>
                  </select>
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="rv-from">
                  {t("from", locale)}
                  <input className={fieldClass} defaultValue={String(query.dateFrom ?? "").slice(0, 10)} id="rv-from" name="dateFrom" type="date" />
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="rv-to">
                  {t("to", locale)}
                  <input className={fieldClass} defaultValue={String(query.dateTo ?? "").slice(0, 10)} id="rv-to" name="dateTo" type="date" />
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="rv-branch">
                  {t("branch", locale)}
                  <select className={fieldClass} defaultValue={query.branchId ?? ""} id="rv-branch" name="branchId">
                    <option value="">{t("allBranches", locale)}</option>
                    {data.filterOptions.branches.map((row) => (
                      <option key={row.id} value={row.id}>{row.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="rv-cashier">
                  {t("cashier", locale)}
                  <select className={fieldClass} defaultValue={query.cashierId ?? ""} id="rv-cashier" name="cashierId">
                    <option value="">{t("allCashiers", locale)}</option>
                    {data.filterOptions.cashiers.map((row) => (
                      <option key={row.id} value={row.id}>{row.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="rv-approver">
                  {t("approver", locale)}
                  <select className={fieldClass} defaultValue={query.approverId ?? ""} id="rv-approver" name="approverId">
                    <option value="">{t("allApprovers", locale)}</option>
                    {data.filterOptions.approvers.map((row) => (
                      <option key={row.id} value={row.id}>{row.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="rv-type">
                  {t("postSaleType", locale)}
                  <select className={fieldClass} defaultValue={query.eventType} id="rv-type" name="eventType">
                    {POSTSALE_EVENT_TYPES.map((type) => (
                      <option key={type} value={type}>{type === "all" ? t("allTypes", locale) : eventTypeLabel(type, locale)}</option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="rv-status">
                  {t("status", locale)}
                  <select className={fieldClass} defaultValue={query.status ?? ""} id="rv-status" name="status">
                    <option value="">{t("allStatuses", locale)}</option>
                    {SALES_TABLE_STATUSES.map((status) => (
                      <option key={status} value={status}>{t(saleStatusCopyKey(status), locale)}</option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="rv-pay">
                  {t("colPayment", locale)}
                  <select className={fieldClass} defaultValue={query.paymentMethod ?? ""} id="rv-pay" name="paymentMethod">
                    <option value="">{t("allPaymentMethods", locale)}</option>
                    {SALES_TABLE_PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>{paymentMethodLabel(method, locale)}</option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-[12rem] flex-[2] flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="rv-q">
                  {t("receiptSearch", locale)}
                  <input className={fieldClass} defaultValue={query.receiptQuery ?? ""} id="rv-q" name="q" placeholder={t("searchReceiptPlaceholder", locale)} />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button className={`h-10 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white ${focusRing}`} type="submit">{t("apply", locale)}</button>
                <Link className={`inline-flex h-10 items-center rounded-md border border-zinc-300 bg-white px-4 text-sm ${focusRing}`} href={pathname}>{t("clear", locale)}</Link>
                <Link className={`inline-flex h-10 items-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium ${focusRing}`} href={postSaleTableExportHref("/api/reports/sales/refunds-voids/export", query)}>
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
                    <th className={thCell}>{t("colDateTime", locale)}</th>
                    <th className={thCell}>{t("colReceipt", locale)}</th>
                    <th className={thCell}>{t("originalSaleDate", locale)}</th>
                    <th className={thCell}>{t("cashier", locale)}</th>
                    <th className={thCell}>{t("approver", locale)}</th>
                    <th className={thCell}>{t("postSaleType", locale)}</th>
                    <th className={`${thCell} ${numClass}`}>{t("colItems", locale)}</th>
                    <th className={`${thCell} ${numClass}`}>{t("colSaleTotal", locale)}</th>
                    <th className={`${thCell} ${numClass}`}>{t("refundAmount", locale)}</th>
                    <th className={`${thCell} ${numClass}`}>{t("cashRefund", locale)}</th>
                    <th className={`${thCell} ${numClass}`}>{t("noncashRefund", locale)}</th>
                    <th className={`${thCell} ${numClass}`}>{t("voidAmount", locale)}</th>
                    <th className={thCell}>{t("colPayment", locale)}</th>
                    <th className={thCell}>{t("reason", locale)}</th>
                    <th className={thCell}>{t("colStatus", locale)}</th>
                    <th className={`${thCell} ${numClass}`}>{t("stockRestored", locale)}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 ? (
                    <tr>
                      <td className={tdCell} colSpan={17}>
                        <p className="py-6 text-center text-sm text-zinc-600">{t("emptyRefundVoidTable", locale)}</p>
                      </td>
                    </tr>
                  ) : (
                    data.rows.map((row, index) => (
                      <tr className="group cursor-pointer" key={row.id} onClick={() => setSaleId(row.saleId)}>
                        <td className={`${tdCell} ${numClass}`}>{(data.page - 1) * data.pageSize + index + 1}</td>
                        <td className={tdCell}>{row.eventAt.slice(0, 16).replace("T", " ")}</td>
                        <td className={tdCell}>
                          <button className={`font-medium underline-offset-2 hover:underline ${focusRing}`} onClick={() => setSaleId(row.saleId)} type="button">
                            {row.receipt}
                          </button>
                        </td>
                        <td className={tdCell}>{row.originalSaleAt.slice(0, 16).replace("T", " ")}</td>
                        <td className={tdCell}>{row.cashierName}</td>
                        <td className={tdCell}>{row.approverName}</td>
                        <td className={tdCell}>{eventTypeLabel(row.type, locale)}</td>
                        <td className={`${tdCell} ${numClass}`}>{formatNumber(row.items)}</td>
                        <td className={`${tdCell} ${numClass}`}>{formatLak(row.originalTotalLak)}</td>
                        <td className={`${tdCell} ${numClass}`}>{formatLak(row.refundLak)}</td>
                        <td className={`${tdCell} ${numClass}`}>{formatLak(row.cashRefundLak)}</td>
                        <td className={`${tdCell} ${numClass}`}>{formatLak(row.noncashRefundLak)}</td>
                        <td className={`${tdCell} ${numClass}`}>{formatLak(row.voidLak)}</td>
                        <td className={tdCell}>{row.paymentMethods.map((method) => paymentMethodLabel(method, locale)).join(" + ")}</td>
                        <td className={tdCell}>{row.reason || "—"}</td>
                        <td className={tdCell}>{t(saleStatusCopyKey(row.status), locale)}</td>
                        <td className={`${tdCell} ${numClass}`}>{row.stockRestoredBaseQty == null ? "—" : formatNumber(row.stockRestoredBaseQty)}</td>
                      </tr>
                    ))
                  )}
                  {data.rows.length > 0 ? (
                    <tr>
                      <td className={tdTotal} colSpan={7}>{t("total", locale)} ({formatNumber(data.totalRow.rowCount)})</td>
                      <td className={`${tdTotal} ${numClass}`}>{formatNumber(data.totalRow.items)}</td>
                      <td className={tdTotal} />
                      <td className={`${tdTotal} ${numClass}`}>{formatLak(data.totalRow.refundLak)}</td>
                      <td className={`${tdTotal} ${numClass}`}>{formatLak(data.totalRow.cashRefundLak)}</td>
                      <td className={`${tdTotal} ${numClass}`}>{formatLak(data.totalRow.noncashRefundLak)}</td>
                      <td className={`${tdTotal} ${numClass}`}>{formatLak(data.totalRow.voidLak)}</td>
                      <td className={tdTotal} colSpan={4} />
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {data.pageCount > 1 ? (
              <div className="mt-3 flex items-center justify-between text-sm text-zinc-600">
                <span>{fillReportsCopy(t("pageOf", locale), { page: data.page, pages: data.pageCount })}</span>
                <div className="flex gap-2">
                  {data.page > 1 ? <Link className={`rounded-md border border-zinc-300 px-3 py-1 ${focusRing}`} href={postSaleTableHref(pathname, query, { page: data.page - 1 })}>{t("previous", locale)}</Link> : null}
                  {data.page < data.pageCount ? <Link className={`rounded-md border border-zinc-300 px-3 py-1 ${focusRing}`} href={postSaleTableHref(pathname, query, { page: data.page + 1 })}>{t("next", locale)}</Link> : null}
                </div>
              </div>
            ) : null}
          </ReportSheet>
          {saleId ? <SaleDetailDrawer locale={locale} onClose={() => setSaleId("")} saleId={saleId} /> : null}
        </>
      ) : null}
    </ReportFrame>
  );
}

export function ReceiptSalesReportView({
  data,
  error,
  locale: localeProp,
}: {
  data?: ReceiptSalesResult;
  error?: string;
  locale: SupportedLocale;
}) {
  const locale = useAppLocale(localeProp);
  const pathname = "/reports/sales/receipts";
  const query = data?.query;
  const [saleId, setSaleId] = useState(data?.query.saleId ?? "");

  const summaryItems = useMemo(() => {
    if (!data) return [];
    return [
      { key: "bills", label: t("bills", locale), value: formatNumber(data.summary.bills) },
      { key: "items", label: t("totalItems", locale), value: formatNumber(data.summary.itemsSold) },
      { key: "gross", label: t("grossSales", locale), value: formatLak(data.summary.grossLak) },
      { key: "refunds", label: t("refunds", locale), value: formatLak(data.summary.refundLak) },
      { key: "voids", label: t("voids", locale), value: formatLak(data.summary.voidLak) },
      { key: "net", label: t("netSales", locale), value: formatLak(data.summary.netLak) },
      { key: "avg", label: t("averageBill", locale), value: formatLak(data.summary.averageBillLak) },
      { key: "cash", label: t("paymentCash", locale), value: formatLak(data.summary.cashLak) },
      { key: "qr", label: t("paymentQr", locale), value: formatLak(data.summary.qrLak) },
      { key: "transfer", label: t("paymentTransfer", locale), value: formatLak(data.summary.transferLak) },
      { key: "card", label: t("paymentCard", locale), value: formatLak(data.summary.cardLak) },
    ];
  }, [data, locale]);

  return (
    <ReportFrame entryId="sales-receipts" error={error} errorKey="errorReceiptTable" locale={locale}>
      {data && query ? (
        <>
          <ReportSheet>
            <form className="flex flex-col gap-3" method="get">
              <div className="flex flex-wrap gap-3">
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="rc-preset">
                  {t("dateRange", locale)}
                  <select className={fieldClass} defaultValue={query.datePreset} id="rc-preset" name="datePreset">
                    <option value="today">{t("today", locale)}</option>
                    <option value="yesterday">{t("yesterday", locale)}</option>
                    <option value="this_week">{t("thisWeek", locale)}</option>
                    <option value="this_month">{t("thisMonth", locale)}</option>
                    <option value="custom">{t("custom", locale)}</option>
                  </select>
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="rc-from">
                  {t("from", locale)}
                  <input className={fieldClass} defaultValue={String(query.dateFrom ?? "").slice(0, 10)} id="rc-from" name="dateFrom" type="date" />
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="rc-to">
                  {t("to", locale)}
                  <input className={fieldClass} defaultValue={String(query.dateTo ?? "").slice(0, 10)} id="rc-to" name="dateTo" type="date" />
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="rc-branch">
                  {t("branch", locale)}
                  <select className={fieldClass} defaultValue={query.branchId ?? ""} id="rc-branch" name="branchId">
                    <option value="">{t("allBranches", locale)}</option>
                    {data.filterOptions.branches.map((row) => (
                      <option key={row.id} value={row.id}>{row.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="rc-cashier">
                  {t("cashier", locale)}
                  <select className={fieldClass} defaultValue={query.cashierId ?? ""} id="rc-cashier" name="cashierId">
                    <option value="">{t("allCashiers", locale)}</option>
                    {data.filterOptions.cashiers.map((row) => (
                      <option key={row.id} value={row.id}>{row.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="rc-pay">
                  {t("colPayment", locale)}
                  <select className={fieldClass} defaultValue={query.paymentMethod ?? ""} id="rc-pay" name="paymentMethod">
                    <option value="">{t("allPaymentMethods", locale)}</option>
                    {SALES_TABLE_PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>{paymentMethodLabel(method, locale)}</option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="rc-status">
                  {t("status", locale)}
                  <select className={fieldClass} defaultValue={query.status ?? ""} id="rc-status" name="status">
                    <option value="">{t("allStatuses", locale)}</option>
                    {SALES_TABLE_STATUSES.map((status) => (
                      <option key={status} value={status}>{t(saleStatusCopyKey(status), locale)}</option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-[12rem] flex-[2] flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="rc-q">
                  {t("receiptSearch", locale)}
                  <input className={fieldClass} defaultValue={query.receiptQuery ?? ""} id="rc-q" name="q" placeholder={t("searchReceiptPlaceholder", locale)} />
                </label>
                <label className="flex min-w-[12rem] flex-[2] flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="rc-customer">
                  {t("customer", locale)}
                  <input className={fieldClass} defaultValue={query.customerQuery ?? ""} id="rc-customer" name="customer" />
                </label>
                <label className="flex min-w-[12rem] flex-[2] flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="rc-product">
                  {t("productBarcodeSearch", locale)}
                  <input className={fieldClass} defaultValue={query.productQuery ?? ""} id="rc-product" name="product" />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button className={`h-10 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white ${focusRing}`} type="submit">{t("apply", locale)}</button>
                <Link className={`inline-flex h-10 items-center rounded-md border border-zinc-300 bg-white px-4 text-sm ${focusRing}`} href={pathname}>{t("clear", locale)}</Link>
                <Link className={`inline-flex h-10 items-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium ${focusRing}`} href={postSaleTableExportHref("/api/reports/sales/receipts/export", query)}>
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
              <table className={`${gridTable} min-w-[1100px]`}>
                <thead>
                  <tr>
                    <th className={thCell}>{t("colNo", locale)}</th>
                    <th className={thCell}>{t("colDateTime", locale)}</th>
                    <th className={thCell}>{t("colReceipt", locale)}</th>
                    <th className={thCell}>{t("cashier", locale)}</th>
                    <th className={thCell}>{t("customer", locale)}</th>
                    <th className={`${thCell} ${numClass}`}>{t("colItems", locale)}</th>
                    <th className={`${thCell} ${numClass}`}>{t("colGross", locale)}</th>
                    <th className={`${thCell} ${numClass}`}>{t("colDiscount", locale)}</th>
                    <th className={`${thCell} ${numClass}`}>{t("colRefund", locale)}</th>
                    <th className={`${thCell} ${numClass}`}>{t("colVoid", locale)}</th>
                    <th className={`${thCell} ${numClass}`}>{t("colNet", locale)}</th>
                    <th className={thCell}>{t("colPayment", locale)}</th>
                    <th className={thCell}>{t("colStatus", locale)}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 ? (
                    <tr>
                      <td className={tdCell} colSpan={13}>
                        <p className="py-6 text-center text-sm text-zinc-600">{t("emptyReceiptTable", locale)}</p>
                      </td>
                    </tr>
                  ) : (
                    data.rows.map((row, index) => (
                      <tr className="group cursor-pointer" key={row.id} onClick={() => setSaleId(row.id)}>
                        <td className={`${tdCell} ${numClass}`}>{(data.page - 1) * data.pageSize + index + 1}</td>
                        <td className={tdCell}>{row.createdAt.slice(0, 16).replace("T", " ")}</td>
                        <td className={tdCell}>
                          <button className={`font-medium underline-offset-2 hover:underline ${focusRing}`} onClick={() => setSaleId(row.id)} type="button">
                            {row.receipt}
                          </button>
                        </td>
                        <td className={tdCell}>{row.cashierName}</td>
                        <td className={tdCell}>{row.customerName}</td>
                        <td className={`${tdCell} ${numClass}`}>{formatNumber(row.items)}</td>
                        <td className={`${tdCell} ${numClass}`}>{formatLak(row.grossLak)}</td>
                        <td className={`${tdCell} ${numClass}`}>{formatLak(row.discountLak)}</td>
                        <td className={`${tdCell} ${numClass}`}>{formatLak(row.refundLak)}</td>
                        <td className={`${tdCell} ${numClass}`}>{formatLak(row.voidLak)}</td>
                        <td className={`${tdCell} ${numClass}`}>{formatLak(row.netLak)}</td>
                        <td className={tdCell}>
                          {row.paymentLabel === "mixed"
                            ? t("paymentMixed", locale)
                            : paymentMethodLabel(row.paymentLabel, locale)}
                        </td>
                        <td className={tdCell}>{t(saleStatusCopyKey(row.status), locale)}</td>
                      </tr>
                    ))
                  )}
                  {data.rows.length > 0 ? (
                    <tr>
                      <td className={tdTotal} colSpan={2}>{t("total", locale)}</td>
                      <td className={`${tdTotal} ${numClass}`}>{formatNumber(data.totalRow.bills)}</td>
                      <td className={tdTotal} colSpan={2} />
                      <td className={`${tdTotal} ${numClass}`}>{formatNumber(data.totalRow.items)}</td>
                      <td className={`${tdTotal} ${numClass}`}>{formatLak(data.totalRow.grossLak)}</td>
                      <td className={`${tdTotal} ${numClass}`}>{formatLak(data.totalRow.discountLak)}</td>
                      <td className={`${tdTotal} ${numClass}`}>{formatLak(data.totalRow.refundLak)}</td>
                      <td className={`${tdTotal} ${numClass}`}>{formatLak(data.totalRow.voidLak)}</td>
                      <td className={`${tdTotal} ${numClass}`}>{formatLak(data.totalRow.netLak)}</td>
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
                  {data.page > 1 ? <Link className={`rounded-md border border-zinc-300 px-3 py-1 ${focusRing}`} href={postSaleTableHref(pathname, query, { page: data.page - 1 })}>{t("previous", locale)}</Link> : null}
                  {data.page < data.pageCount ? <Link className={`rounded-md border border-zinc-300 px-3 py-1 ${focusRing}`} href={postSaleTableHref(pathname, query, { page: data.page + 1 })}>{t("next", locale)}</Link> : null}
                </div>
              </div>
            ) : null}
          </ReportSheet>
          {saleId ? <SaleDetailDrawer locale={locale} onClose={() => setSaleId("")} saleId={saleId} /> : null}
        </>
      ) : null}
    </ReportFrame>
  );
}
