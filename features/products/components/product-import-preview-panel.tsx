"use client";

import { useEffect, useState } from "react";
import { WhiteDataTable, WhiteTableText } from "@/features/products/components/selected-products-list";
import { PRODUCT_IMPORT_COLUMNS, type ProductImportColumn, type ProductImportMappedColumn } from "@/features/products/product-import";
import {
  PREVIEW_PAGE_SIZE_STORAGE_KEY,
  PREVIEW_PAGE_SIZES,
  readStoredPreviewPageSize,
  type LargeImportPreview,
  type PreviewFilter,
  type PreviewPageSize,
} from "@/features/products/product-import-preview";
import { fillProductsCopy, tProducts } from "@/lib/i18n/products-copy";
import { useAppLocale } from "@/lib/i18n/use-app-locale";

export function ProductImportPreviewPanel({ preview, onFilter, onMappedPage, onMapping, onPage, onPageSize }: {
  onFilter: (filter: PreviewFilter) => void;
  onMappedPage: (page: number) => void;
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
    <section className="grid gap-4" data-testid="products-import-excel-preview">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{t("importPreviewOriginal")}</h3>
        <label className="flex items-center gap-2 text-sm">
          {t("importPreviewPageSize")}
          <select className="h-11 rounded-md border border-border bg-background px-3" data-testid="products-import-preview-page-size" value={pageSize} onChange={(event) => changePageSize(Number(event.target.value) as PreviewPageSize)}>
            {PREVIEW_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="products-import-preview-counts">
        <Count label={t("importPreviewRows")} value={preview.counts.totalRows} />
        <Count label={t("importPreviewNew")} value={preview.counts.newProducts} />
        <Count label={t("importPreviewDuplicate")} value={preview.counts.duplicate} />
        <Count label={t("importPreviewReview")} value={preview.counts.needsReview} />
        <Count label={t("importPreviewIncomplete")} value={preview.counts.incomplete} />
        <Count label={t("importPreviewImageMatched")} value={preview.counts.imageMatched} />
        <Count label={t("importPreviewImageReview")} value={preview.counts.imageNeedsReview} />
      </div>
      <WhiteDataTable minWidth={`${Math.max(preview.excel.headers.length, 1) * 148}px`} testId="products-import-excel-table">
        <thead>
          <tr>{preview.excel.headers.map((header, index) => <th key={`${index}-${header}`}>{header}</th>)}<th>Image</th></tr>
        </thead>
        <tbody>
          {preview.excel.rows.map((row) => (
            <tr key={row.rowNumber}>
              {preview.excel.headers.map((_, index) => <td key={`${row.rowNumber}-${index}`}><WhiteTableText>{row.cells[index] ?? ""}</WhiteTableText></td>)}
              <td>{row.thumb ? <img alt="" className="size-10 object-cover" data-testid={`products-import-excel-thumb-${row.rowNumber}`} src={row.thumb} /> : null}</td>
            </tr>
          ))}
        </tbody>
      </WhiteDataTable>
      <Pager page={preview.excel.page} pageCount={preview.excel.pageCount} testId="products-import-excel-pager" onPage={onPage} />
      <div className="max-h-[320px] overflow-auto rounded-lg border border-border" data-testid="products-import-preview-mapping">
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
      <div className="flex flex-wrap gap-2" data-testid="products-import-preview-filters">
        {(["all", "new", "duplicate", "needs_review", "incomplete"] as const).map((filter) => (
          <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" data-testid={`products-import-preview-filter-${filter}`} key={filter} type="button" onClick={() => onFilter(filter)}>{filterLabel(filter, t)}</button>
        ))}
      </div>
      <h3 className="text-base font-semibold">{t("importPreviewMapped")}</h3>
      <WhiteDataTable minWidth="1120px" testId="products-import-mapped-table">
        <thead>
          <tr>
            <th>Image</th><th>Product Name</th><th>SKU</th><th>Barcode</th><th>Unit</th><th>Cost Price</th><th>Selling Price</th><th>Stock</th><th>Status / Issue</th>
          </tr>
        </thead>
        <tbody>
          {preview.mapped.rows.map((row) => (
            <tr key={row.rowNumber}>
              <td>{row.thumb ? <img alt="" className="size-10 object-cover" src={row.thumb} /> : null}</td>
              <td><WhiteTableText>{row.name}</WhiteTableText></td>
              <td><WhiteTableText>{row.sku}</WhiteTableText></td>
              <td><WhiteTableText>{row.barcode}</WhiteTableText></td>
              <td>{row.unit}</td>
              <td>{row.cost ?? ""}</td>
              <td>{row.price ?? ""}</td>
              <td>{row.stock ?? ""}</td>
              <td data-testid={`products-import-preview-status-${row.rowNumber}`}>{statusLabel(row.status, t)}{row.match ? ` ${row.match.productName} / ${row.match.unit}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </WhiteDataTable>
      <Pager page={preview.mapped.page} pageCount={preview.mapped.pageCount} testId="products-import-mapped-pager" onPage={onMappedPage} />
    </section>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="text-lg font-semibold">{value}</div></div>;
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

function statusLabel(status: LargeImportPreview["mapped"]["rows"][number]["status"], t: (key: string) => string) {
  if (status === "incomplete") return t("importPreviewIncompleteLabel");
  if (status === "duplicate") return t("importPreviewDuplicate");
  if (status === "needs_review") return t("importPreviewReview");
  return t("importPreviewNew");
}

export function previewPageLabel(page: number, pageCount: number) {
  return fillProductsCopy("{page} / {count}", { count: String(pageCount), page: String(page + 1) });
}
