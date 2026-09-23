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
import {
  estimatedLineCostLak,
  pickDefaultReorderPurchaseUnit,
  suggestedPurchaseQtyFromBase,
  supplierOrderBarcode,
  type SupplierOrderLine,
} from "@/features/reports/reorder-report-math";
import { reorderExportHref, reorderTableHref } from "@/features/reports/reorder-report-query";
import type { NeedReorderRow, ReorderHistoryRow, ReorderPageResult } from "@/features/reports/reorder-report-repository";
import { SettingsLargeDrawer } from "@/features/settings/components/settings-large-drawer";

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

function defaultUnitId(row: NeedReorderRow) {
  return pickDefaultReorderPurchaseUnit(row.units)?.id ?? row.units[0]?.id ?? "";
}

function displayBarcode(row: NeedReorderRow, unitId: string, locale: SupportedLocale) {
  const unit = row.units.find((item) => item.id === unitId);
  return (
    supplierOrderBarcode({ productBarcode: row.barcode, unitBarcode: unit?.barcode }) ||
    t("noBarcode", locale)
  );
}

function defaultOrderQty(row: NeedReorderRow, unitId: string) {
  if (row.reorderQtyMode !== "AUTO" || !(row.suggestedQtyBase > 0)) return "";
  const unit = row.units.find((item) => item.id === unitId) ?? pickDefaultReorderPurchaseUnit(row.units);
  const purchaseQty = suggestedPurchaseQtyFromBase(row.suggestedQtyBase, unit?.conversionQty ?? 1);
  return purchaseQty > 0 ? String(purchaseQty) : "";
}

function buildSeedDraft(row: NeedReorderRow): DraftLine {
  const unitId = defaultUnitId(row);
  return {
    orderQty: defaultOrderQty(row, unitId),
    selected: false,
    supplierId: row.preferredSupplierId ?? "",
    unitId,
  };
}

/** Internal Already Ordered / History print (unchanged). Need tab uses supplier-safe builder instead. */
function buildInternalTabHtml(input: {
  alreadyRows: ReorderPageResult["alreadyRows"];
  historyRows: ReorderHistoryRow[];
  locale: SupportedLocale;
  tab: string;
  title: string;
}) {
  const { alreadyRows, historyRows, locale, tab, title } = input;
  const esc = (value: string) =>
    value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  let body = "";
  if (tab === "already") {
    body = `<table><thead><tr>
      <th>${esc(t("product", locale))}</th><th>${esc(t("barcode", locale))}</th>
      <th>${esc(t("orderedQty", locale))}</th><th>${esc(t("remaining", locale))}</th>
      <th>${esc(t("poStatus", locale))}</th>
    </tr></thead><tbody>${alreadyRows
      .map(
        (row) => `<tr>
      <td>${esc(row.productName)}</td><td>${esc(row.barcode || t("noBarcode", locale))}</td>
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
  h2 { font-size: 13px; margin: 16px 0 8px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #a1a1aa; padding: 4px 6px; text-align: left; }
  th { background: #f4f4f5; }
</style></head><body><h1>${esc(title)}</h1>${body}</body></html>`;
}

/** Supplier-facing Print / PDF / Share — Product Name, Barcode, Order Qty, Order Unit only. */
function buildSupplierOrderHtml(input: {
  companyName: string;
  draftRef: string;
  locale: SupportedLocale;
  lines: SupplierOrderLine[];
}) {
  const { companyName, draftRef, locale, lines } = input;
  const esc = (value: string) =>
    value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const bySupplier = new Map<string, SupplierOrderLine[]>();
  for (const line of lines) {
    const key = line.supplierId || "__none__";
    const list = bySupplier.get(key) ?? [];
    list.push(line);
    bySupplier.set(key, list);
  }
  const dateLabel = new Date().toISOString().slice(0, 10);
  const sections = [...bySupplier.entries()]
    .map(([, group]) => {
      const supplierName = group[0]?.supplierName || t("noSupplier", locale);
      const rows = group
        .map(
          (line) => `<tr>
      <td>${esc(line.productName)}</td>
      <td>${esc(line.barcode)}</td>
      <td>${formatNumber(line.orderQty)}</td>
      <td>${esc(line.orderUnit)}</td>
    </tr>`,
        )
        .join("");
      return `<section>
  <h2>${esc(t("supplier", locale))}: ${esc(supplierName)}</h2>
  <table><thead><tr>
    <th>${esc(t("product", locale))}</th>
    <th>${esc(t("barcode", locale))}</th>
    <th>${esc(t("orderQty", locale))}</th>
    <th>${esc(t("orderUnit", locale))}</th>
  </tr></thead><tbody>${rows}</tbody></table>
</section>`;
    })
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${esc(t("supplierOrderDoc", locale))}</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: Arial, sans-serif; color: #18181b; font-size: 11px; }
  h1 { font-size: 16px; margin: 0 0 8px; }
  h2 { font-size: 13px; margin: 16px 0 8px; }
  .meta { margin: 0 0 12px; color: #3f3f46; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #a1a1aa; padding: 4px 6px; text-align: left; }
  th { background: #f4f4f5; }
</style></head><body>
<h1>${esc(t("supplierOrderDoc", locale))}</h1>
<p class="meta">${esc(t("company", locale))}: ${esc(companyName)}<br/>
${esc(t("generatedAt", locale))}: ${esc(dateLabel)}<br/>
${esc(t("purchaseDraftRef", locale))}: ${esc(draftRef)}</p>
${sections}
</body></html>`;
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

async function downloadExcelBuffer(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
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
  const [purchaseDraftKeys, setPurchaseDraftKeys] = useState<string[]>([]);
  const [purchaseDraftOpen, setPurchaseDraftOpen] = useState(false);
  const [groupBySupplier, setGroupBySupplier] = useState(true);
  const [message, setMessage] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [addProductId, setAddProductId] = useState("");
  const [addWarehouseId, setAddWarehouseId] = useState("");

  const query = data?.query;
  const needRows = data?.needRows ?? [];
  const alreadyRows = data?.alreadyRows ?? [];
  const historyRows = data?.historyRows ?? [];
  const needByKey = useMemo(() => new Map(needRows.map((row) => [rowKey(row), row])), [needRows]);

  const getDraft = (row: NeedReorderRow): DraftLine => {
    const key = rowKey(row);
    const existing = drafts[key];
    if (existing) return existing;
    return buildSeedDraft(row);
  };

  const setDraft = (row: NeedReorderRow, patch: Partial<DraftLine>) => {
    const key = rowKey(row);
    setDrafts((prev) => {
      const base = prev[key] ?? buildSeedDraft(row);
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

  const purchaseDraftRows = useMemo(() => {
    return purchaseDraftKeys.map((key) => needByKey.get(key)).filter(Boolean) as NeedReorderRow[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseDraftKeys, needByKey, drafts]);

  const draftSupplierGroups = useMemo(() => {
    const map = new Map<string, NeedReorderRow[]>();
    for (const row of purchaseDraftRows) {
      const draft = getDraft(row);
      const key = draft.supplierId || "__none__";
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseDraftRows, drafts, data?.suppliers]);

  function buildSupplierLinesFromDraft(): SupplierOrderLine[] {
    const lines: SupplierOrderLine[] = [];
    for (const row of purchaseDraftRows) {
      const draft = getDraft(row);
      const qty = Number(draft.orderQty);
      if (!(qty > 0)) continue;
      const unit = row.units.find((item) => item.id === draft.unitId);
      const barcode =
        supplierOrderBarcode({ productBarcode: row.barcode, unitBarcode: unit?.barcode }) ||
        t("noBarcode", locale);
      const supplierName =
        data?.suppliers.find((s) => s.id === draft.supplierId)?.name ||
        row.preferredSupplierName ||
        t("noSupplier", locale);
      lines.push({
        barcode,
        orderQty: qty,
        orderUnit: unit?.unitName || "—",
        productName: row.productName,
        supplierId: draft.supplierId || "",
        supplierName,
      });
    }
    return lines;
  }

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

  function onAddToPurchase() {
    setMessage("");
    if (!selectedRows.length) {
      setMessage(t("selectProductsFirst", locale));
      return;
    }
    const nextDrafts = { ...drafts };
    const keys: string[] = [];
    for (const row of selectedRows) {
      const key = rowKey(row);
      const seed = getDraft(row);
      nextDrafts[key] = {
        ...seed,
        orderQty: seed.orderQty || defaultOrderQty(row, seed.unitId || defaultUnitId(row)),
        selected: true,
        unitId: seed.unitId || defaultUnitId(row),
      };
      keys.push(key);
    }
    setDrafts(nextDrafts);
    setPurchaseDraftKeys((prev) => [...new Set([...prev, ...keys])]);
    setPurchaseDraftOpen(true);
  }

  function onRemoveFromDraft(row: NeedReorderRow) {
    const key = rowKey(row);
    setPurchaseDraftKeys((prev) => prev.filter((item) => item !== key));
  }

  function onCloseDraft() {
    setPurchaseDraftOpen(false);
    setConfirmOpen(false);
    // Closing draft does not create PO / history; keep Need selection for convenience.
  }

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
    for (const row of purchaseDraftRows) {
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
      setPurchaseDraftOpen(false);
      setPurchaseDraftKeys([]);
      setMessage(
        `${t("poCreated", locale)}: ${(result?.purchaseOrders ?? [])
          .map((po: { purchaseNo: string }) => po.purchaseNo)
          .join(", ")}`,
      );
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

  const draftRef = `PD-${new Date().toISOString().slice(0, 10)}`;

  function openSupplierPrint() {
    const lines = buildSupplierLinesFromDraft();
    if (!lines.length) {
      setMessage(t("addToPurchaseFirst", locale));
      return;
    }
    const html = buildSupplierOrderHtml({
      companyName: t("store", locale),
      draftRef,
      locale,
      lines,
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

  function openPrintWindow() {
    if (query!.tab === "need") {
      if (!purchaseDraftRows.length) {
        setMessage(t("addToPurchaseFirst", locale));
        return;
      }
      openSupplierPrint();
      return;
    }
    const html = buildInternalTabHtml({
      alreadyRows,
      historyRows,
      locale,
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
    if (query!.tab === "need") {
      const lines = buildSupplierLinesFromDraft();
      if (!lines.length) {
        setMessage(t("addToPurchaseFirst", locale));
        return;
      }
      const html = buildSupplierOrderHtml({
        companyName: t("store", locale),
        draftRef,
        locale,
        lines,
      });
      await downloadHtmlAsFile(html, `supplier-order-${new Date().toISOString().slice(0, 10)}.html`);
      return;
    }
    const html = buildInternalTabHtml({
      alreadyRows,
      historyRows,
      locale,
      tab: query!.tab,
      title: printableTitle,
    });
    await downloadHtmlAsFile(html, `reorder-${query!.tab}-${new Date().toISOString().slice(0, 10)}.html`);
  }

  async function onDeviceShare() {
    let html: string;
    let filename: string;
    let title: string;
    if (query!.tab === "need") {
      const lines = buildSupplierLinesFromDraft();
      if (!lines.length) {
        setMessage(t("addToPurchaseFirst", locale));
        return;
      }
      html = buildSupplierOrderHtml({
        companyName: t("store", locale),
        draftRef,
        locale,
        lines,
      });
      filename = `supplier-order-${new Date().toISOString().slice(0, 10)}.html`;
      title = t("supplierOrderDoc", locale);
    } else {
      html = buildInternalTabHtml({
        alreadyRows,
        historyRows,
        locale,
        tab: query!.tab,
        title: printableTitle,
      });
      filename = `reorder-${query!.tab}-${new Date().toISOString().slice(0, 10)}.html`;
      title = printableTitle;
    }
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const file = new File([blob], filename, { type: "text/html" });
    if (typeof navigator !== "undefined" && navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title });
        return;
      } catch {
        // fall through to download
      }
    }
    await downloadHtmlAsFile(html, filename);
    setMessage(t("shareNotSupported", locale));
  }

  async function onSupplierExcel() {
    const lines = buildSupplierLinesFromDraft();
    if (!lines.length) {
      setMessage(t("addToPurchaseFirst", locale));
      return;
    }
    const { buildReorderSupplierOrderExcel } = await import("@/features/reports/reorder-report-excel");
    const file = await buildReorderSupplierOrderExcel({
      companyName: t("store", locale),
      draftRef,
      locale,
      lines,
    });
    await downloadExcelBuffer(file.buffer, file.filename);
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
          {query.tab === "need" ? (
            <button className={btnSecondary} onClick={() => void onSupplierExcel()} type="button">
              {t("exportExcel", locale)}
            </button>
          ) : (
            <a className={btnSecondary} href={reorderExportHref(query.tab, query)}>{t("exportExcel", locale)}</a>
          )}
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
            <button className={btnPrimary} disabled={!selectedRows.length || pending} onClick={onAddToPurchase} type="button">
              {t("addToPurchase", locale)}
            </button>
            {purchaseDraftKeys.length > 0 ? (
              <button className={btnSecondary} onClick={() => setPurchaseDraftOpen(true)} type="button">
                {t("purchaseDraft", locale)} ({purchaseDraftKeys.length})
              </button>
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
                    <th className={`${thCell} text-left print:hidden`}>{t("status", locale)}</th>
                  </tr>
                </thead>
                <tbody>
                  {needRows.length === 0 ? (
                    <tr>
                      <td className={tdCell} colSpan={12}>{t("emptyReorderTable", locale)}</td>
                    </tr>
                  ) : (
                    needRows.map((row) => {
                      const draft = getDraft(row);
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
                          <td className={tdCell}>{displayBarcode(row, draft.unitId || defaultUnitId(row), locale)}</td>
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

      {purchaseDraftOpen ? (
        <SettingsLargeDrawer
          closeLabel={t("closeDraft", locale)}
          footer={
            <>
              <button className={btnSecondary} onClick={onCloseDraft} type="button">
                {t("cancel", locale)}
              </button>
              <button className={btnSecondary} onClick={() => void onSupplierExcel()} type="button">
                {t("exportExcel", locale)}
              </button>
              <button className={btnSecondary} onClick={openSupplierPrint} type="button">
                {t("printA4", locale)}
              </button>
              <button
                className={btnPrimary}
                disabled={!purchaseDraftRows.length || pending}
                onClick={() => setConfirmOpen(true)}
                type="button"
              >
                {t("createPo", locale)}
              </button>
            </>
          }
          onClose={onCloseDraft}
          title={t("purchaseDraft", locale)}
        >
          <p className="mb-4 text-sm text-zinc-600">{t("purchaseDraftHint", locale)}</p>
          <div className="mb-4 flex flex-wrap gap-4 text-sm">
            <div>
              <span className="text-zinc-500">{t("purchaseDraftItems", locale)}: </span>
              <span className="font-semibold tabular-nums">{purchaseDraftRows.length}</span>
            </div>
            <div>
              <span className="text-zinc-500">{t("supplierGroupsCount", locale)}: </span>
              <span className="font-semibold tabular-nums">{draftSupplierGroups.length}</span>
            </div>
          </div>
          {message ? <p className="mb-3 text-sm text-zinc-700">{message}</p> : null}
          {purchaseDraftRows.length === 0 ? (
            <p className="text-sm text-zinc-600">{t("purchaseDraftEmpty", locale)}</p>
          ) : (
            <div className="space-y-6">
              {draftSupplierGroups.map(([supplierId, rows]) => {
                const supplierName =
                  supplierId === "__none__"
                    ? t("noSupplier", locale)
                    : data.suppliers.find((s) => s.id === supplierId)?.name || supplierId;
                return (
                  <div key={supplierId}>
                    <h3 className="mb-2 text-sm font-semibold text-zinc-900">
                      {t("supplier", locale)}: {supplierName} ({rows.length})
                    </h3>
                    <div className="overflow-x-auto">
                      <table className={gridTable}>
                        <thead>
                          <tr>
                            <th className={`${thCell} text-left`}>{t("product", locale)}</th>
                            <th className={`${thCell} text-left`}>{t("barcode", locale)}</th>
                            <th className={`${thCell} text-right`}>{t("suggestedQtyBase", locale)}</th>
                            <th className={`${thCell} text-right`}>{t("colAvailable", locale)}</th>
                            <th className={`${thCell} text-right`}>{t("colTargetStock", locale)}</th>
                            <th className={`${thCell} text-right`}>{t("orderQty", locale)}</th>
                            <th className={`${thCell} text-left`}>{t("orderUnit", locale)}</th>
                            <th className={`${thCell} text-left`}>{t("supplier", locale)}</th>
                            <th className={`${thCell} text-left`}>{t("removeFromDraft", locale)}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => {
                            const draft = getDraft(row);
                            const unit = row.units.find((item) => item.id === draft.unitId);
                            const est =
                              Number(draft.orderQty) > 0
                                ? estimatedLineCostLak(Number(draft.orderQty), unit?.costPriceLak)
                                : null;
                            return (
                              <tr key={rowKey(row)}>
                                <td className={tdCell}>
                                  <div>{row.productName}</div>
                                  {est != null ? (
                                    <div className="text-xs text-zinc-500">
                                      {t("estimatedCost", locale)}: {formatLak(est)}
                                    </div>
                                  ) : null}
                                </td>
                                <td className={tdCell}>{displayBarcode(row, draft.unitId, locale)}</td>
                                <td className={`${tdCell} ${numClass}`}>
                                  {row.reorderQtyMode === "MANUAL" ? "—" : formatNumber(row.suggestedQtyBase)}
                                </td>
                                <td className={`${tdCell} ${numClass}`}>{formatNumber(row.available)}</td>
                                <td className={`${tdCell} ${numClass}`}>{formatNumber(row.targetStock)}</td>
                                <td className={tdCell}>
                                  <input
                                    className={`${fieldClass} w-24`}
                                    inputMode="decimal"
                                    onChange={(e) => setDraft(row, { orderQty: e.target.value })}
                                    value={draft.orderQty}
                                  />
                                </td>
                                <td className={tdCell}>
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
                                <td className={tdCell}>
                                  <select
                                    className={fieldClass}
                                    onChange={(e) => setDraft(row, { supplierId: e.target.value })}
                                    value={draft.supplierId}
                                  >
                                    <option value="">{t("noSupplier", locale)}</option>
                                    {data.suppliers.map((supplier) => (
                                      <option key={supplier.id} value={supplier.id}>
                                        {supplier.name}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className={tdCell}>
                                  <button
                                    className="text-xs text-zinc-700 underline"
                                    onClick={() => onRemoveFromDraft(row)}
                                    type="button"
                                  >
                                    {t("removeFromDraft", locale)}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SettingsLargeDrawer>
      ) : null}

      {confirmOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 print:hidden">
          <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-md border border-zinc-300 bg-white p-4 shadow-lg">
            <h3 className="text-base font-semibold text-zinc-900">{t("createPo", locale)}</h3>
            <p className="mt-2 text-sm text-zinc-600">{t("createPoConfirmHint", locale)}</p>
            <ul className="mt-3 space-y-2 text-sm">
              {purchaseDraftRows.map((row) => {
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
              <button className={btnPrimary} disabled={pending} onClick={() => void onCreatePo()} type="button">
                {t("confirm", locale)}
              </button>
              <button className={btnSecondary} onClick={() => setConfirmOpen(false)} type="button">
                {t("cancel", locale)}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
