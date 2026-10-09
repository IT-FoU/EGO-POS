"use client";

import { useEffect, useState } from "react";
import { WhiteDataTable } from "@/features/products/components/selected-products-list";
import {
  PREVIEW_PAGE_SIZE_STORAGE_KEY,
  PREVIEW_PAGE_SIZES,
  readStoredPreviewPageSize,
  type LargeImportPreview,
  type PreviewEdit,
  type PreviewFilter,
  type PreviewPageSize,
} from "@/features/products/product-import-preview";
import { IMPORT_DESTINATION_LETTERS } from "@/features/products/product-import-methods";
import { fillProductsCopy, tProducts } from "@/lib/i18n/products-copy";
import { useAppLocale } from "@/lib/i18n/use-app-locale";

export function ProductImportPreviewPanel({ preview, onEdit, onFilter, onPage, onPageSize }: {
  onEdit: (edit: PreviewEdit) => void;
  onFilter: (filter: PreviewFilter) => void;
  onPage: (page: number) => void;
  onPageSize: (pageSize: PreviewPageSize) => void;
  preview: LargeImportPreview;
}) {
  const locale = useAppLocale();
  const t = (key: string) => tProducts(key, locale);
  const [pageSize, setPageSize] = useState<PreviewPageSize>(preview.mapped.pageSize === 50 || preview.mapped.pageSize === 100 ? preview.mapped.pageSize : 20);
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
      {(preview.notices ?? []).length > 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" data-testid="products-import-method-notices">
          {preview.notices.map((notice, index) => (
            <p data-testid={`products-import-notice-${notice.code}`} key={`${notice.code}-${index}`}>{noticeText(notice, t)}</p>
          ))}
        </div>
      ) : null}
      <WhiteDataTable minWidth="1480px" testId="products-import-excel-table">
        <thead>
          <tr className="ego-column-letters" data-testid="products-import-letter-row">
            {IMPORT_DESTINATION_LETTERS.map((letter) => (
              <th key={letter} data-testid={`products-import-destination-${letter}`}>{letter}</th>
            ))}
          </tr>
          <tr className="ego-column-names">
            {[
              t("importPreviewColNo"),
              t("importPreviewColImage"),
              t("importPreviewColName"),
              t("importPreviewColBarcode"),
              t("importPreviewColSku"),
              t("importPreviewColCategory"),
              t("importPreviewColUnit"),
              t("importPreviewColQuantity"),
              t("importPreviewColCost"),
              t("importPreviewColPrice"),
              t("importPreviewColNotes"),
            ].map((label, index) => (
              <th key={IMPORT_DESTINATION_LETTERS[index]}>{IMPORT_DESTINATION_LETTERS[index]} — {label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {preview.mapped.rows.map((row, index) => (
            <tr data-preview-status={row.status} data-source-row={row.rowNumber} key={row.rowNumber}>
              <td data-testid={`products-import-sequence-${row.sequence || preview.mapped.page * pageSize + index + 1}`}>{row.sequence || preview.mapped.page * pageSize + index + 1}</td>
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

function noticeText(notice: { code: string; detail: string; sample: string }, t: (key: string) => string) {
  if (notice.code === "template_mismatch") return t("importTemplateMismatch");
  if (notice.code === "invalid_letter") return fillProductsCopy(t("importLetterInvalid"), { detail: notice.detail });
  if (notice.code === "duplicate_source") return fillProductsCopy(t("importLetterDuplicate"), { detail: notice.sample || notice.detail });
  return `${t("importLetterMissing")} ${notice.detail} ${notice.sample}`.trim();
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
