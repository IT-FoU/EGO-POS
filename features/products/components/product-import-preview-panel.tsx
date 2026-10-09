"use client";

import { useEffect, useState } from "react";
import { WhiteDataTable } from "@/features/products/components/selected-products-list";
import { PRODUCT_IMPORT_COLUMNS, type ProductImportColumn, type ProductImportMappedColumn } from "@/features/products/product-import";
import {
  PREVIEW_PAGE_SIZE_STORAGE_KEY,
  PREVIEW_PAGE_SIZES,
  readStoredPreviewPageSize,
  type LargeImportPreview,
  type PreviewEdit,
  type PreviewFilter,
  type PreviewPageSize,
} from "@/features/products/product-import-preview";
import { fillProductsCopy, tProducts } from "@/lib/i18n/products-copy";
import { useAppLocale } from "@/lib/i18n/use-app-locale";

export function ProductImportPreviewPanel({ preview, onEdit, onFilter, onMapping, onPage, onPageSize }: {
  onEdit: (edit: PreviewEdit) => void;
  onFilter: (filter: PreviewFilter) => void;
  onMapping: (index: number, field: string) => void;
  onPage: (page: number) => void;
  onPageSize: (pageSize: PreviewPageSize) => void;
  preview: LargeImportPreview;
}) {
  const locale = useAppLocale();
  const t = (key: string) => tProducts(key, locale);
  const [pageSize, setPageSize] = useState<PreviewPageSize>(20);
  useEffect(() => {
    setPageSize(readStoredPreviewPageSize(window.localStorage));
  }, []);

  function changePageSize(next: PreviewPageSize) {
    setPageSize(next);
    window.localStorage.setItem(PREVIEW_PAGE_SIZE_STORAGE_KEY, String(next));
    onPageSize(next);
  }

  return (
    <section className="grid gap-3" data-testid="products-import-excel-preview">
      <style>{`
        .ego-white-table[data-testid="products-import-excel-table"] th:first-child,
        .ego-white-table[data-testid="products-import-excel-table"] td:first-child { min-width: 4rem; }
        .ego-white-table[data-testid="products-import-excel-table"] select {
          background: #FFFFFF;
          border: 1px solid #64748B;
          border-radius: 0.375rem;
          color: #111827;
          height: 2rem;
          min-width: 6.5rem;
          padding: 0 0.5rem;
          width: 100%;
        }
        .ego-white-table tr[data-preview-status="duplicate"] td { background: #FEF2F2; }
        .ego-white-table tr[data-preview-status="needs_review"] td { background: #FFFBEB; }
      `}</style>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid gap-2 sm:grid-cols-4" data-testid="products-import-preview-counts">
          <Count label={t("importPreviewRows")} value={preview.counts.totalRows} />
          <Count label={t("importPreviewNew")} value={preview.counts.newProducts + preview.counts.incomplete} />
          <Count label={t("importPreviewDuplicate")} value={preview.counts.duplicate} />
          <Count label={t("importPreviewReview")} value={preview.counts.needsReview} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          {t("importPreviewPageSize")}
          <select className="h-11 rounded-md border border-border bg-background px-3" data-testid="products-import-preview-page-size" value={pageSize} onChange={(event) => changePageSize(Number(event.target.value) as PreviewPageSize)}>
            {PREVIEW_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-2" data-testid="products-import-preview-filters">
        {(["all", "new", "duplicate", "needs_review", "incomplete"] as const).map((filter) => (
          <button className="h-9 rounded-md border border-border px-3 text-sm font-semibold" data-testid={`products-import-preview-filter-${filter}`} key={filter} type="button" onClick={() => onFilter(filter)}>{filterLabel(filter, t)}</button>
        ))}
      </div>
      <WhiteDataTable minWidth="1480px" testId="products-import-excel-table">
        <thead>
          <tr>
            <th>{t("importPreviewColNo")}</th>
            <th>{t("importPreviewColImage")}</th>
            <th>{t("importPreviewColName")}</th>
            <th>{t("importPreviewColBarcode")}</th>
            <th>{t("importPreviewColSku")}</th>
            <th>{t("importPreviewColCategory")}</th>
            <th>{t("importPreviewColUnit")}</th>
            <th>{t("importPreviewColQuantity")}</th>
            <th>{t("importPreviewColCost")}</th>
            <th>{t("importPreviewColPrice")}</th>
            <th>{t("importPreviewColNotes")}</th>
          </tr>
        </thead>
        <tbody>
          {preview.mapped.rows.map((row) => (
            <tr data-preview-status={row.status} key={row.rowNumber}>
              <td>{row.rowNumber}</td>
              <td>{row.thumb ? <img alt="" className="size-10 object-cover" data-testid={`products-import-excel-thumb-${row.rowNumber}`} src={row.thumb} /> : null}</td>
              <td><CellInput testId={`products-import-edit-name-${row.rowNumber}`} value={row.name} onCommit={(value) => onEdit({ field: "product_name", rowNumber: row.rowNumber, value })} /></td>
              <td><CellInput testId={`products-import-edit-barcode-${row.rowNumber}`} value={row.barcode} onCommit={(value) => onEdit({ field: barcodeField(row.unit), rowNumber: row.rowNumber, value })} /></td>
              <td><CellInput testId={`products-import-edit-sku-${row.rowNumber}`} value={row.sku} onCommit={(value) => onEdit({ field: "sku", rowNumber: row.rowNumber, value })} /></td>
              <td>
                <select data-testid={`products-import-edit-category-${row.rowNumber}`} value={row.category ?? ""} onChange={(event) => onEdit({ field: "category", rowNumber: row.rowNumber, value: event.target.value })}>
                  <option value=""></option>
                  {preview.categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </td>
              <td>
                <select data-testid={`products-import-edit-unit-${row.rowNumber}`} value={row.unit} onChange={(event) => onEdit({ field: "opening_stock_unit", rowNumber: row.rowNumber, value: event.target.value })}>
                  <option value=""></option>
                  <option value="Piece">{t("importPreviewUnitPiece")}</option>
                  <option value="Pack">{t("importPreviewUnitPack")}</option>
                  <option value="Box">{t("importPreviewUnitBox")}</option>
                </select>
              </td>
              <td><CellInput testId={`products-import-edit-quantity-${row.rowNumber}`} value={row.stock ?? ""} onCommit={(value) => onEdit({ field: "opening_stock", rowNumber: row.rowNumber, value })} /></td>
              <td><CellInput testId={`products-import-edit-cost-${row.rowNumber}`} value={row.cost ?? ""} onCommit={(value) => onEdit({ field: "piece_cost", rowNumber: row.rowNumber, value })} /></td>
              <td><CellInput testId={`products-import-edit-price-${row.rowNumber}`} value={row.price ?? ""} onCommit={(value) => onEdit({ field: "piece_selling_price", rowNumber: row.rowNumber, value })} /></td>
              <td>
                <CellInput testId={`products-import-edit-note-${row.rowNumber}`} value={row.note} onCommit={(value) => onEdit({ field: "notes", rowNumber: row.rowNumber, value })} />
                {row.issue ? <p className="mt-1 text-xs font-semibold text-red-700" data-testid={`products-import-issue-${row.rowNumber}`}>{row.issue}</p> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </WhiteDataTable>
      <Pager page={preview.mapped.page} pageCount={preview.mapped.pageCount} testId="products-import-excel-pager" onPage={onPage} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <details data-testid="products-import-adjust-columns">
          <summary className="cursor-pointer text-sm font-semibold">{t("importAdjustColumns")}</summary>
          <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-border" data-testid="products-import-preview-mapping">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="sticky top-0 bg-background text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">{t("importMapHeader")}</th>
                  <th className="p-3">{t("importMapSample")}</th>
                  <th className="p-3">{t("importMapSuggested")}</th>
                  <th className="p-3">{t("importMapField")}</th>
                  <th className="p-3">{t("importMapStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {preview.columns.map((column) => (
                  <tr className="border-t border-border" key={column.index}>
                    <td className="p-3 font-semibold">{column.header.trim() || "-"}</td>
                    <td className="p-3 font-mono text-xs">{column.sample || "-"}</td>
                    <td className="p-3">{mappingFieldLabel(column.suggestion, t)}</td>
                    <td className="p-3">
                      <select className="h-11 w-full max-w-56 rounded-md border border-border bg-background px-3" data-testid={`products-import-preview-map-${column.index}`} value={column.status === "review" ? "" : (column.choice ?? "")} onChange={(event) => onMapping(column.index, event.target.value)}>
                        <option value="">{t("importMapChoose")}</option>
                        <option value="ignore">{t("importMapIgnore")}</option>
                        {PRODUCT_IMPORT_COLUMNS.map((field) => <option key={field} value={field}>{mappingFieldLabel(field, t)}</option>)}
                      </select>
                    </td>
                    <td className="p-3 font-semibold" data-testid={`products-import-preview-map-status-${column.index}`}>{t(mappingStatusKey(column.status))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold text-muted-foreground" data-testid="products-import-preview-only" disabled type="button">{t("importPreviewOnly")}</button>
      </div>
    </section>
  );
}

function CellInput({ onCommit, testId, value }: { onCommit: (value: string) => void; testId: string; value: string }) {
  return (
    <input data-testid={testId} defaultValue={value} key={value} onBlur={(event) => { if (event.currentTarget.value !== value) onCommit(event.currentTarget.value); }} />
  );
}

function barcodeField(unit: string): PreviewEdit["field"] {
  if (unit === "Pack") return "pack_barcode";
  if (unit === "Box") return "box_barcode";
  return "piece_barcode";
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-white px-3 py-2 text-neutral-950">
      <p className="text-xs">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function Pager({ onPage, page, pageCount, testId }: { onPage: (page: number) => void; page: number; pageCount: number; testId: string }) {
  const locale = useAppLocale();
  const t = (key: string) => tProducts(key, locale);
  return (
    <div className="flex items-center justify-end gap-2" data-testid={testId}>
      <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={() => onPage(page - 1)}>{t("importPreviewPrevious")}</button>
      <span className="text-sm">{page + 1} / {pageCount}</span>
      <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={() => onPage(page + 1)}>{t("importPreviewNext")}</button>
    </div>
  );
}

function mappingStatusKey(status: ProductImportMappedColumn["status"]) {
  if (status === "mapped") return "importMapMapped";
  if (status === "ignored") return "importMapIgnored";
  if (status === "conflict") return "importMapConflict";
  return "importMapReview";
}

function mappingFieldLabel(field: ProductImportColumn | "ignore" | null, t: (key: string) => string) {
  if (field === "ignore") return t("importMapIgnore");
  if (!field) return t("importMapNone");
  const key = `importField_${field}`;
  const label = t(key);
  return label === key ? field : label;
}

function filterLabel(filter: PreviewFilter, t: (key: string) => string) {
  if (filter === "all") return t("importPreviewFilterAll");
  if (filter === "new") return t("importPreviewNew");
  if (filter === "duplicate") return t("importPreviewDuplicate");
  if (filter === "needs_review") return t("importPreviewReview");
  return t("importPreviewIncomplete");
}

export function previewPageLabel(page: number, pageCount: number) {
  return fillProductsCopy("{page} / {count}", { count: String(pageCount), page: String(page + 1) });
}
