"use client";

import { useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SupportedLocale } from "@/lib/constants";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import { tReports } from "@/lib/i18n/reports-copy";
import { formatLak, formatNumber } from "@/features/reports/format";
import { ReportDetailHeader, ReportPageChrome, ReportSheet } from "@/features/reports/components/report-page-shell";
import { findReportCenterEntry } from "@/features/reports/report-center-catalog";
import { REPORT_CENTER_ICON_MAP } from "@/features/reports/report-center-icons";
import { estimatedLineCostLak, suggestedPurchaseQtyFromBase } from "@/features/reports/reorder-report-math";
import { reorderExportHref, reorderTableHref } from "@/features/reports/reorder-report-query";
import type { NeedReorderRow, ReorderHistoryRow, ReorderPageResult } from "@/features/reports/reorder-report-repository";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const fieldClass = `h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 ${focusRing}`;
const numClass = "text-right tabular-nums";
const gridTable = "w-full border-separate border-spacing-0 text-sm text-zinc-900";
const thCell = "border border-zinc-300 bg-zinc-100 px-2.5 py-2 align-middle text-xs font-semibold uppercase tracking-wide text-zinc-700";
const tdCell = "border border-zinc-300 bg-white px-2.5 py-1.5 align-middle text-zinc-900";
const btnPrimary = `inline-flex h-10 items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white ${focusRing}`;
const btnSecondary = `inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 ${focusRing}`;

type DraftLine = {
  orderQty: string;
  selected: boolean;
  supplierId: string;
  unitId: string;
};

function t(key: string, locale: SupportedLocale) {
  return tReports(key, locale);
}

function rowKey(row: NeedReorderRow) {
  return `${row.productId}:${row.warehouseId}`;
}

function reasonLabel(reason: string, locale: SupportedLocale) {
  if (reason === "out_of_stock") return t("reasonOutOfStock", locale);
  if (reason === "reached_reorder_level") return t("reasonReachedReorderLevel", locale);
  if (reason === "only_1_2_left") return t("reasonOnlyOneTwoLeft", locale);
  if (reason === "added_manually") return t("reasonAddedManually", locale);
  return reason;
}

function displayBarcode(row: NeedReorderRow, unitId: string, locale: SupportedLocale) {
  const unit = row.units.find((item) => item.id === unitId);
  if (unit?.barcode) return unit.barcode;
  if (row.barcode) return row.barcode;
  return t("noBarcode", locale);
}

function defaultOrderQty(row: NeedReorderRow, unitId: string) {
  if (row.reorderQtyMode !== "AUTO" || !(row.suggestedQtyBase > 0)) return "";
  const unit = row.units.find((item) => item.id === unitId) ?? row.units.find((item) => item.isBaseUnit) ?? row.units[0];
  const purchaseQty = suggestedPurchaseQtyFromBase(row.suggestedQtyBase, unit?.conversionQty ?? 1);
  return purchaseQty > 0 ? String(purchaseQty) : "";
}

function buildPrintableHtml(input: {
  alreadyRows: ReorderPageResult["alreadyRows"];
  historyRows: ReorderHistoryRow[];
  locale: SupportedLocale;
  needRows: NeedReorderRow[];
  tab: string;
  title: string;
}) {
  const { alreadyRows, historyRows, locale, needRows, tab, title } = input;
  const esc = (value: string) =>
    value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  let body = "";
  if (tab === "need") {
    body = `<table><thead><tr>
      <th>${esc(t("product", locale))}</th><th>${esc(t("barcode", locale))}</th>
      <th>${esc(t("colAvailable", locale))}</th><th>${esc(t("colReorderLevel", locale))}</th>
      <th>${esc(t("colTargetStock", locale))}</th><th>${esc(t("suggestedQtyBase", locale))}</th>
      <th>${esc(t("reason", locale))}</th>
    </tr></thead><tbody>${needRows
      .map(
        (row) => `<tr>
      <td>${esc(row.productName)}</td><td>${esc(row.barcode || t("noBarcode", locale))}</td>
      <td>${formatNumber(row.available)}</td><td>${row.minStock > 0 ? formatNumber(row.minStock) : esc(t("noReorderLevel", locale))}</td>
      <td>${formatNumber(row.targetStock)}</td><td>${formatNumber(row.suggestedQtyBase)}</td>
      <td>${esc(reasonLabel(row.reason, locale))}</td>
    </tr>`,
      )
      .join("")}</tbody></table>`;
  } else if (tab === "already") {
    body = `<table><thead><tr>
      <th>${esc(t("product", locale))}</th><th>${esc(t("poNo", locale))}</th>
      <th>${esc(t("orderedQty", locale))}</th><th>${esc(t("remaining", locale))}</th>
      <th>${esc(t("poStatus", locale))}</th>
    </tr></thead><tbody>${alreadyRows
      .map(
        (row) => `<tr>
      <td>${esc(row.productName)}</td><td>${esc(row.poNo)}</td>
      <td>${formatNumber(row.orderedQty)}</td><td>${formatNumber(row.remainingQty)}</td>
      <td>${esc(row.poStatus)}</td>
    </tr>`,
      )
      .join("")}</tbody></table>`;
  } else {
    body = `<table><thead><tr>
      <th>${esc(t("orderedAtHistory", locale))}</th><th>${esc(t("product", locale))}</th>
      <th>${esc(t("poNo", locale))}</th><th>${esc(t("suggestedQtyBase", locale))}</th>
      <th>${esc(t("orderedQty", locale))}</th><th>${esc(t("livePoStatus", locale))}</th>
    </tr></thead><tbody>${historyRows
      .map(
        (row) => `<tr>
      <td>${esc(row.createdAt.slice(0, 10))}</td><td>${esc(row.productName)}</td>
      <td>${esc(row.purchaseNo || "—")}</td><td>${formatNumber(row.suggestedQtyBase)}</td>
      <td>${formatNumber(row.orderedQtyBase)}</td><td>${esc(row.livePoStatus || "—")}</td>
    </tr>`,
      )
      .join("")}</tbody></table>`;
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: Arial, sans-serif; color: #18181b; font-size: 11px; }
  h1 { font-size: 16px; margin: 0 0 12px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #a1a1aa; padding: 4px 6px; text-align: left; }
  th { background: #f4f4f5; }
</style></head><body><h1>${esc(title)}</h1>${body}</body></html>`;
}

async function downloadHtmlAsFile(html: string, filename: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  return blob;
}

export function ReorderReportView({
  data,
  error,
  locale: localeProp,
}: {
  data?: ReorderPageResult;
  error?: string;
  locale: SupportedLocale;
}) {
  const locale = useAppLocale(localeProp);
  const router = useRouter();
  const entry = findReportCenterEntry("inventory-reorder");
  const printRef = useRef<HTMLDivElement>(null);
  const [pending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState<Record<string, DraftLine>>({});
  const [groupBySupplier, setGroupBySupplier] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [addProductId, setAddProductId] = useState("");
  const [addWarehouseId, setAddWarehouseId] = useState("");

  const query = data?.query;
  const needRows = data?.needRows ?? [];
  const alreadyRows = data?.alreadyRows ?? [];
  const historyRows = data?.historyRows ?? [];

  const getDraft = (row: NeedReorderRow): DraftLine => {
    const key = rowKey(row);
    const existing = drafts[key];
    if (existing) return existing;
    const baseUnit = row.units.find((unit) => unit.isBaseUnit) ?? row.units[0];
    const unitId = baseUnit?.id ?? "";
    return {
      orderQty: defaultOrderQty(row, unitId),
      selected: false,
      supplierId: row.preferredSupplierId ?? "",
      unitId,
    };
  };

  const setDraft = (row: NeedReorderRow, patch: Partial<DraftLine>) => {
    const key = rowKey(row);
    setDrafts((prev) => {
      const base =
        prev[key] ??
        ({
          orderQty: defaultOrderQty(row, (row.units.find((unit) => unit.isBaseUnit) ?? row.units[0])?.id ?? ""),
          selected: false,
          supplierId: row.preferredSupplierId ?? "",
          unitId: (row.units.find((unit) => unit.isBaseUnit) ?? row.units[0])?.id ?? "",
        } satisfies DraftLine);
      const next = { ...base, ...patch };
      if (patch.unitId && patch.orderQty === undefined && row.reorderQtyMode === "AUTO") {
        next.orderQty = defaultOrderQty(row, patch.unitId);
      }
      return { ...prev, [key]: next };
    });
  };

  const selectedRows = useMemo(() => {
    return needRows.filter((row) => getDraft(row).selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needRows, drafts]);

  const estimatedSelected = useMemo(() => {
    let total = 0;
    let any = false;
    for (const row of selectedRows) {
      const draft = getDraft(row);
      const unit = row.units.find((item) => item.id === draft.unitId);
      const qty = Number(draft.orderQty);
      if (!(qty > 0) || unit?.costPriceLak == null) continue;
      const cost = estimatedLineCostLak(qty, unit.costPriceLak);
      if (cost == null) continue;
      total += cost;
      any = true;
    }
    return any ? total : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRows, drafts]);

  if (!entry) return null;
  if (error || !data || !query) {
    return (
      <div className="flex min-w-0 flex-col gap-5">
        <ReportPageChrome entry={entry} locale={locale} />
        <ReportDetailHeader
          descriptionKey={entry.descriptionKey}
          icon={REPORT_CENTER_ICON_MAP[entry.icon]}
          locale={locale}
          titleKey={entry.titleKey}
        />
        <ReportSheet>
          <p className="py-8 text-center text-sm text-zinc-600">{t("errorReorderTable", locale)}</p>
        </ReportSheet>
      </div>
    );
  }

  const selectAll = () => {
    const next = { ...drafts };
    for (const row of needRows) {
      const key = rowKey(row);
      next[key] = { ...getDraft(row), selected: true };
    }
    setDrafts(next);
  };

  const clearSelection = () => {
    const next = { ...drafts };
    for (const row of needRows) {
      const key = rowKey(row);
      next[key] = { ...getDraft(row), selected: false };
    }
    setDrafts(next);
  };

  async function postJson(url: string, body: unknown) {
    const response = await fetch(url, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.ok) {
      throw new Error(json?.error || json?.message || `HTTP ${response.status}`);
    }
    return json.data;
  }

  async function onAddManual(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    if (!addProductId || !addWarehouseId) {
      setMessage(t("productAndWarehouseRequired", locale));
      return;
    }
    try {
      const result = await postJson("/api/reports/inventory/reorder/manual-add", {
        productId: addProductId,
        warehouseId: addWarehouseId,
      });
      if (result?.alreadyOrdered) {
        setMessage(`${t("alreadyOrdered", locale)}: ${result.poNo}`);
      } else {
        setMessage(t("manualAddSaved", locale));
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t("errorReorderTable", locale));
    }
  }

  async function onRemoveManual(row: NeedReorderRow) {
    setMessage("");
    try {
      await postJson("/api/reports/inventory/reorder/manual-remove", {
        productId: row.productId,
        warehouseId: row.warehouseId,
      });
      startTransition(() => router.refresh());
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t("errorReorderTable", locale));
    }
  }

  async function onCreatePo() {
    setMessage("");
    const lines = [];
    for (const row of selectedRows) {
      const draft = getDraft(row);
      const qty = Number(draft.orderQty);
      if (!(qty > 0)) {
        setMessage(t("orderQtyRequired", locale));
        return;
      }
      if (!draft.supplierId) {
        setMessage(t("supplierRequiredSelected", locale));
        return;
      }
      const unit = row.units.find((item) => item.id === draft.unitId);
      lines.push({
        available: row.available,
        conversionQty: unit?.conversionQty ?? 1,
        productId: row.productId,
        purchaseUnitName: unit?.unitName ?? null,
        quantity: qty,
        reorderLevel: row.minStock,
        reorderQtyMode: row.reorderQtyMode,
        suggestedQtyBase: row.suggestedQtyBase,
        supplierId: draft.supplierId,
        targetStock: row.targetStock,
        unitCost: unit?.costPriceLak ?? 0,
        unitId: draft.unitId || null,
        warehouseId: row.warehouseId,
      });
    }
    if (!lines.length) {
      setMessage(t("selectProductsFirst", locale));
      return;
    }
    try {
      const result = await postJson("/api/reports/inventory/reorder/create-po", { lines });
      setConfirmOpen(false);
      setMessage(`${t("poCreated", locale)}: ${(result?.purchaseOrders ?? []).map((po: { purchaseNo: string }) => po.purchaseNo).join(", ")}`);
      setDrafts({});
      startTransition(() => router.refresh());
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t("errorReorderTable", locale));
    }
  }

  const printableTitle =
    query.tab === "already"
      ? t("alreadyOrdered", locale)
      : query.tab === "history"
        ? t("history", locale)
        : t("needReorder", locale);

  function openPrintWindow() {
    const html = buildPrintableHtml({
      alreadyRows,
      historyRows,
      locale,
      needRows,
      tab: query!.tab,
      title: printableTitle,
    });
    const win = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
    if (!win) {
      window.print();
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }

  async function onDownloadPdf() {
    const html = buildPrintableHtml({
      alreadyRows,
      historyRows,
      locale,
      needRows,
      tab: query!.tab,
      title: printableTitle,
    });
    await downloadHtmlAsFile(html, `reorder-${query!.tab}-${new Date().toISOString().slice(0, 10)}.html`);
    // Browser print-to-PDF remains available via Print A4.
  }

  async function onDeviceShare() {
    const html = buildPrintableHtml({
      alreadyRows,
      historyRows,
      locale,
      needRows,
      tab: query!.tab,
      title: printableTitle,
    });
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const file = new File([blob], `reorder-${query!.tab}.html`, { type: "text/html" });
    if (typeof navigator !== "undefined" && navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: printableTitle });
        return;
      } catch {
        // fall through to download
      }
    }
    await downloadHtmlAsFile(html, `reorder-${query!.tab}-${new Date().toISOString().slice(0, 10)}.html`);
    setMessage(t("shareNotSupported", locale));
  }

  const supplierGroups = useMemo(() => {
    if (!groupBySupplier) return null;
    const map = new Map<string, NeedReorderRow[]>();
    for (const row of selectedRows) {
      const draft = getDraft(row);
      const key = draft.supplierId || "__none__";
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupBySupplier, selectedRows, drafts, data?.suppliers]);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="print:hidden">
        <ReportPageChrome entry={entry} locale={locale} />
        <ReportDetailHeader
          descriptionKey={entry.descriptionKey}
          icon={REPORT_CENTER_ICON_MAP[entry.icon]}
          locale={locale}
          titleKey={entry.titleKey}
        />
      </div>

      <div className="flex flex-wrap gap-2 print:hidden">
        <Link className={query.tab === "need" ? btnPrimary : btnSecondary} href={reorderTableHref({ ...query, page: 1, tab: "need" })}>
          {t("needReorder", locale)} ({data.summary.needReorder})
        </Link>
        <Link className={query.tab === "already" ? btnPrimary : btnSecondary} href={reorderTableHref({ ...query, page: 1, tab: "already" })}>
          {t("alreadyOrdered", locale)} ({data.summary.alreadyOrdered})
        </Link>
        <Link className={query.tab === "history" ? btnPrimary : btnSecondary} href={reorderTableHref({ ...query, page: 1, tab: "history" })}>
          {t("history", locale)} ({data.historyCount})
        </Link>
      </div>

      <ReportSheet>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 print:hidden">
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">{t("needReorder", locale)}</div>
            <div className="text-lg font-semibold tabular-nums">{formatNumber(data.summary.needReorder)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">{t("statusOutOfStock", locale)}</div>
            <div className="text-lg font-semibold tabular-nums">{formatNumber(data.summary.outOfStock)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">{t("statusLowStock", locale)}</div>
            <div className="text-lg font-semibold tabular-nums">{formatNumber(data.summary.lowStock)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">{t("selected", locale)}</div>
            <div className="text-lg font-semibold tabular-nums">{formatNumber(selectedRows.length)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">{t("alreadyOrdered", locale)}</div>
            <div className="text-lg font-semibold tabular-nums">{formatNumber(data.summary.alreadyOrdered)}</div>
          </div>
        </div>
      </ReportSheet>

      <ReportSheet>
        <form action={reorderTableHref({ tab: query.tab })} className="flex flex-wrap gap-3 print:hidden" method="get">
          <input name="tab" type="hidden" value={query.tab} />
          <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-zinc-600">
            {t("branch", locale)}
            <select className={fieldClass} defaultValue={query.branchId ?? ""} name="branchId">
              <option value="">{t("allBranches", locale)}</option>
              {data.filterOptions.branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.label}</option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-zinc-600">
            {t("warehouse", locale)}
            <select className={fieldClass} defaultValue={query.warehouseId ?? ""} name="warehouseId">
              <option value="">{t("allWarehouses", locale)}</option>
              {data.filterOptions.warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>{warehouse.label}</option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600">
            {t("search", locale)}
            <input className={fieldClass} defaultValue={query.productSearch ?? ""} name="q" placeholder={t("searchProductBarcode", locale)} />
          </label>
          <button className={btnPrimary} type="submit">{t("apply", locale)}</button>
          <a className={btnSecondary} href={reorderExportHref(query.tab, query)}>{t("exportExcel", locale)}</a>
          <button className={btnSecondary} onClick={openPrintWindow} type="button">{t("printA4", locale)}</button>
          <button className={btnSecondary} onClick={() => void onDownloadPdf()} type="button">{t("downloadPdf", locale)}</button>
          <button className={btnSecondary} onClick={() => void onDeviceShare()} type="button">{t("deviceShare", locale)}</button>
        </form>
      </ReportSheet>

      <div className="hidden print:block" ref={printRef}>
        <h1 className="mb-3 text-base font-semibold">{printableTitle}</h1>
      </div>

      {query.tab === "need" ? (
        <>
          <ReportSheet>
            <form className="flex flex-wrap items-end gap-3 print:hidden" onSubmit={onAddManual}>
              <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600">
                {t("addProduct", locale)}
                <input className={fieldClass} onChange={(e) => setAddProductId(e.target.value)} placeholder="productId" value={addProductId} />
              </label>
              <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-zinc-600">
                {t("warehouse", locale)}
                <select className={fieldClass} onChange={(e) => setAddWarehouseId(e.target.value)} value={addWarehouseId}>
                  <option value="">—</option>
                  {data.filterOptions.warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>{warehouse.label}</option>
                  ))}
                </select>
              </label>
              <button className={btnSecondary} disabled={pending} type="submit">{t("addToReorder", locale)}</button>
            </form>
            {message ? <p className="mt-3 text-sm text-zinc-700 print:hidden">{message}</p> : null}
          </ReportSheet>

          <div className="flex flex-wrap gap-2 print:hidden">
            <button className={btnSecondary} onClick={selectAll} type="button">{t("selectAll", locale)}</button>
            <button className={btnSecondary} onClick={clearSelection} type="button">{t("clearSelection", locale)}</button>
            <button className={btnSecondary} onClick={() => setGroupBySupplier((v) => !v)} type="button">
              {t("groupBySupplier", locale)}
            </button>
            <button className={btnPrimary} disabled={!selectedRows.length || pending} onClick={() => setConfirmOpen(true)} type="button">
              {t("createPo", locale)}
            </button>
            {estimatedSelected != null ? (
              <span className="self-center text-sm text-zinc-700">
                {t("estimatedCost", locale)}: {formatLak(estimatedSelected)}
              </span>
            ) : null}
          </div>

          {groupBySupplier && supplierGroups ? (
            <ReportSheet>
              <ul className="space-y-1 text-sm print:hidden">
                {supplierGroups.map(([supplierId, rows]) => {
                  const name =
                    supplierId === "__none__"
                      ? t("noSupplier", locale)
                      : data.suppliers.find((s) => s.id === supplierId)?.name || supplierId;
                  return (
                    <li key={supplierId}>
                      {name} — {rows.length} {t("selected", locale).toLowerCase()}
                    </li>
                  );
                })}
              </ul>
            </ReportSheet>
          ) : null}

          <ReportSheet>
            <div className="overflow-x-auto">
              <table className={gridTable}>
                <thead>
                  <tr>
                    <th className={`${thCell} print:hidden`}>☐</th>
                    <th className={`${thCell} text-left`}>{t("product", locale)}</th>
                    <th className={`${thCell} text-left`}>{t("barcode", locale)}</th>
                    <th className={`${thCell} text-left`}>{t("category", locale)}</th>
                    <th className={`${thCell} text-right`}>{t("colOnHand", locale)}</th>
                    <th className={`${thCell} text-right`}>{t("colReserved", locale)}</th>
                    <th className={`${thCell} text-right`}>{t("colAvailable", locale)}</th>
                    <th className={`${thCell} text-right`}>{t("colReorderLevel", locale)}</th>
                    <th className={`${thCell} text-right`}>{t("colTargetStock", locale)}</th>
                    <th className={`${thCell} text-right`}>{t("suggestedQtyBase", locale)}</th>
                    <th className={`${thCell} text-left`}>{t("reason", locale)}</th>
                    <th className={`${thCell} text-right print:hidden`}>{t("orderQty", locale)}</th>
                    <th className={`${thCell} text-left print:hidden`}>{t("orderUnit", locale)}</th>
                    <th className={`${thCell} text-left print:hidden`}>{t("supplier", locale)}</th>
                    <th className={`${thCell} text-right print:hidden`}>{t("unitCost", locale)}</th>
                    <th className={`${thCell} text-right print:hidden`}>{t("estimatedCost", locale)}</th>
                    <th className={`${thCell} text-left print:hidden`}>{t("status", locale)}</th>
                  </tr>
                </thead>
                <tbody>
                  {needRows.length === 0 ? (
                    <tr>
                      <td className={tdCell} colSpan={17}>{t("emptyReorderTable", locale)}</td>
                    </tr>
                  ) : (
                    needRows.map((row) => {
                      const draft = getDraft(row);
                      const unit = row.units.find((item) => item.id === draft.unitId);
                      const qty = Number(draft.orderQty);
                      const est = qty > 0 ? estimatedLineCostLak(qty, unit?.costPriceLak) : null;
                      return (
                        <tr key={rowKey(row)}>
                          <td className={`${tdCell} print:hidden`}>
                            <input
                              checked={draft.selected}
                              onChange={(e) => setDraft(row, { selected: e.target.checked })}
                              type="checkbox"
                            />
                          </td>
                          <td className={tdCell}>{row.productName}</td>
                          <td className={tdCell}>{displayBarcode(row, draft.unitId, locale)}</td>
                          <td className={tdCell}>{row.categoryName}</td>
                          <td className={`${tdCell} ${numClass}`}>{formatNumber(row.onHand)}</td>
                          <td className={`${tdCell} ${numClass}`}>{formatNumber(row.reserved)}</td>
                          <td className={`${tdCell} ${numClass}`}>{formatNumber(row.available)}</td>
                          <td className={`${tdCell} ${numClass}`}>
                            {row.minStock > 0 ? formatNumber(row.minStock) : t("noReorderLevel", locale)}
                          </td>
                          <td className={`${tdCell} ${numClass}`}>{formatNumber(row.targetStock)}</td>
                          <td className={`${tdCell} ${numClass}`}>
                            {row.reorderQtyMode === "MANUAL" ? "—" : formatNumber(row.suggestedQtyBase)}
                          </td>
                          <td className={tdCell}>{reasonLabel(row.reason, locale)}</td>
                          <td className={`${tdCell} print:hidden`}>
                            <input
                              className={`${fieldClass} w-24`}
                              inputMode="decimal"
                              onChange={(e) => setDraft(row, { orderQty: e.target.value })}
                              value={draft.orderQty}
                            />
                          </td>
                          <td className={`${tdCell} print:hidden`}>
                            <select
                              className={fieldClass}
                              onChange={(e) => setDraft(row, { unitId: e.target.value })}
                              value={draft.unitId}
                            >
                              {row.units.map((unitOption) => (
                                <option key={unitOption.id} value={unitOption.id}>
                                  {unitOption.unitName}
                                  {unitOption.conversionQty > 1 ? ` (=${unitOption.conversionQty})` : ""}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className={`${tdCell} print:hidden`}>
                            <select
                              className={fieldClass}
                              onChange={(e) => setDraft(row, { supplierId: e.target.value })}
                              value={draft.supplierId}
                            >
                              <option value="">{t("noSupplier", locale)}</option>
                              {data.suppliers.map((supplier) => (
                                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                              ))}
                            </select>
                          </td>
                          <td className={`${tdCell} ${numClass} print:hidden`}>
                            {unit?.costPriceLak == null ? t("noCost", locale) : formatLak(unit.costPriceLak)}
                          </td>
                          <td className={`${tdCell} ${numClass} print:hidden`}>
                            {est == null ? "—" : formatLak(est)}
                          </td>
                          <td className={`${tdCell} print:hidden`}>
                            {row.isManual && row.reason === "added_manually" ? (
                              <button className="text-xs text-zinc-700 underline" onClick={() => onRemoveManual(row)} type="button">
                                {t("removeFromReorder", locale)}
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </ReportSheet>
        </>
      ) : query.tab === "already" ? (
        <ReportSheet>
          <div className="overflow-x-auto">
            <table className={gridTable}>
              <thead>
                <tr>
                  <th className={`${thCell} text-left`}>{t("product", locale)}</th>
                  <th className={`${thCell} text-left`}>{t("barcode", locale)}</th>
                  <th className={`${thCell} text-right`}>{t("orderedQty", locale)}</th>
                  <th className={`${thCell} text-left`}>{t("orderUnit", locale)}</th>
                  <th className={`${thCell} text-left`}>{t("supplier", locale)}</th>
                  <th className={`${thCell} text-left`}>{t("poNo", locale)}</th>
                  <th className={`${thCell} text-left`}>{t("orderedDate", locale)}</th>
                  <th className={`${thCell} text-left`}>{t("poStatus", locale)}</th>
                  <th className={`${thCell} text-right`}>{t("receivedQty", locale)}</th>
                  <th className={`${thCell} text-right`}>{t("remaining", locale)}</th>
                </tr>
              </thead>
              <tbody>
                {alreadyRows.length === 0 ? (
                  <tr>
                    <td className={tdCell} colSpan={10}>{t("emptyAlreadyOrderedTable", locale)}</td>
                  </tr>
                ) : (
                  alreadyRows.map((row) => (
                    <tr key={row.purchaseItemId}>
                      <td className={tdCell}>{row.productName}</td>
                      <td className={tdCell}>{row.barcode || t("noBarcode", locale)}</td>
                      <td className={`${tdCell} ${numClass}`}>{formatNumber(row.orderedQty)}</td>
                      <td className={tdCell}>{row.unitName}</td>
                      <td className={tdCell}>{row.supplierName}</td>
                      <td className={tdCell}>
                        <Link className="underline print:no-underline" href="/purchasing">{row.poNo}</Link>
                      </td>
                      <td className={tdCell}>{row.orderedAt.slice(0, 10)}</td>
                      <td className={tdCell}>{row.poStatus}</td>
                      <td className={`${tdCell} ${numClass}`}>{formatNumber(row.receivedQty)}</td>
                      <td className={`${tdCell} ${numClass}`}>{formatNumber(row.remainingQty)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </ReportSheet>
      ) : (
        <ReportSheet>
          <div className="overflow-x-auto">
            <table className={gridTable}>
              <thead>
                <tr>
                  <th className={`${thCell} text-left`}>{t("orderedAtHistory", locale)}</th>
                  <th className={`${thCell} text-left`}>{t("product", locale)}</th>
                  <th className={`${thCell} text-left`}>{t("barcode", locale)}</th>
                  <th className={`${thCell} text-left`}>{t("warehouse", locale)}</th>
                  <th className={`${thCell} text-left`}>{t("poNo", locale)}</th>
                  <th className={`${thCell} text-left`}>{t("supplier", locale)}</th>
                  <th className={`${thCell} text-right`}>{t("colReorderLevel", locale)}</th>
                  <th className={`${thCell} text-right`}>{t("colTargetStock", locale)}</th>
                  <th className={`${thCell} text-right`}>{t("availableAtOrder", locale)}</th>
                  <th className={`${thCell} text-right`}>{t("suggestedQtyBase", locale)}</th>
                  <th className={`${thCell} text-right`}>{t("orderedQty", locale)}</th>
                  <th className={`${thCell} text-left`}>{t("qtyMode", locale)}</th>
                  <th className={`${thCell} text-left`}>{t("livePoStatus", locale)}</th>
                  <th className={`${thCell} text-right`}>{t("liveReceivedQty", locale)}</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.length === 0 ? (
                  <tr>
                    <td className={tdCell} colSpan={14}>{t("emptyHistoryTable", locale)}</td>
                  </tr>
                ) : (
                  historyRows.map((row) => (
                    <tr key={row.id}>
                      <td className={tdCell}>{row.createdAt.slice(0, 16).replace("T", " ")}</td>
                      <td className={tdCell}>{row.productName}</td>
                      <td className={tdCell}>{row.barcode || t("noBarcode", locale)}</td>
                      <td className={tdCell}>{row.warehouseName}</td>
                      <td className={tdCell}>{row.purchaseNo || "—"}</td>
                      <td className={tdCell}>{row.supplierName || t("noSupplier", locale)}</td>
                      <td className={`${tdCell} ${numClass}`}>{formatNumber(row.reorderLevel)}</td>
                      <td className={`${tdCell} ${numClass}`}>{formatNumber(row.targetStock)}</td>
                      <td className={`${tdCell} ${numClass}`}>{formatNumber(row.availableAtOrder)}</td>
                      <td className={`${tdCell} ${numClass}`}>{formatNumber(row.suggestedQtyBase)}</td>
                      <td className={`${tdCell} ${numClass}`}>
                        {formatNumber(row.orderedQtyPurchase)}
                        {row.purchaseUnitName ? ` ${row.purchaseUnitName}` : ""}
                        {` / ${formatNumber(row.orderedQtyBase)}`}
                      </td>
                      <td className={tdCell}>
                        {row.reorderQtyMode === "MANUAL" ? t("qtyModeManual", locale) : t("qtyModeAuto", locale)}
                      </td>
                      <td className={tdCell}>{row.livePoStatus || "—"}</td>
                      <td className={`${tdCell} ${numClass}`}>
                        {row.liveReceivedQty == null ? "—" : formatNumber(row.liveReceivedQty)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </ReportSheet>
      )}

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden">
          <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-md border border-zinc-300 bg-white p-4 shadow-lg">
            <h3 className="text-base font-semibold text-zinc-900">{t("createPo", locale)}</h3>
            <p className="mt-2 text-sm text-zinc-600">{t("createPoConfirmHint", locale)}</p>
            <ul className="mt-3 space-y-2 text-sm">
              {selectedRows.map((row) => {
                const draft = getDraft(row);
                const unit = row.units.find((item) => item.id === draft.unitId);
                const supplier = data.suppliers.find((s) => s.id === draft.supplierId)?.name || t("noSupplier", locale);
                return (
                  <li key={rowKey(row)} className="border-b border-zinc-200 pb-2">
                    <div className="font-medium">{row.productName}</div>
                    <div className="text-zinc-600">
                      {draft.orderQty} {unit?.unitName} · {supplier}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex gap-2">
              <button className={btnPrimary} disabled={pending} onClick={onCreatePo} type="button">{t("confirm", locale)}</button>
              <button className={btnSecondary} onClick={() => setConfirmOpen(false)} type="button">{t("cancel", locale)}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
