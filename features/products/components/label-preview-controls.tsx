"use client";

import { useEffect, useState } from "react";
import {
  LABEL_PREVIEW_PAGE_SIZE_KEY,
  LABEL_PREVIEW_PAGE_SIZES,
  labelPreviewPageCount,
  nextLabelPreviewPage,
  normalizeLabelPreviewPageSize,
  type LabelPreviewPageSize,
} from "@/features/products/label-preview-page";

export function useLabelPreviewPaging(total: number, selectionSignature: string) {
  const [pageSize, setPageSize] = useState<LabelPreviewPageSize>(12);
  const [page, setPage] = useState(1);
  const [ready, setReady] = useState(false);
  const [signature, setSignature] = useState(selectionSignature);

  useEffect(() => {
    setPageSize(normalizeLabelPreviewPageSize(window.localStorage.getItem(LABEL_PREVIEW_PAGE_SIZE_KEY)));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(LABEL_PREVIEW_PAGE_SIZE_KEY, String(pageSize));
  }, [pageSize, ready]);

  useEffect(() => {
    setPage((current) => nextLabelPreviewPage({
      page: current,
      pageSize,
      previousSignature: signature,
      signature: selectionSignature,
      total,
    }));
    setSignature(selectionSignature);
  }, [pageSize, selectionSignature, signature, total]);

  return {
    page,
    pageSize,
    pages: labelPreviewPageCount(total, pageSize),
    setPage,
    setPageSize,
  };
}

export function LabelPreviewPager({ onPage, onPageSize, page, pageSize, pages, t, testPrefix }: {
  onPage: (page: number) => void;
  onPageSize: (size: LabelPreviewPageSize) => void;
  page: number;
  pageSize: LabelPreviewPageSize;
  pages: number;
  t: (key: string) => string;
  testPrefix: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 print:hidden" data-testid={`${testPrefix}-preview-pager`}>
      <label className="flex items-center gap-2 text-sm font-semibold">
        {t("printLabelsPerPage")}
        <select
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          data-testid={`${testPrefix}-page-size`}
          value={pageSize}
          onChange={(event) => onPageSize(normalizeLabelPreviewPageSize(event.target.value))}
        >
          {LABEL_PREVIEW_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <div className="flex items-center gap-2">
        <button className="h-9 rounded-md border border-border px-3 text-sm font-semibold disabled:opacity-50" data-testid={`${testPrefix}-page-prev`} disabled={page <= 1} type="button" onClick={() => onPage(page - 1)}>{t("previous")}</button>
        <span className="text-sm font-semibold" data-testid={`${testPrefix}-page-status`}>{t("printPageLabel")} {page} / {pages}</span>
        <button className="h-9 rounded-md border border-border px-3 text-sm font-semibold disabled:opacity-50" data-testid={`${testPrefix}-page-next`} disabled={page >= pages} type="button" onClick={() => onPage(page + 1)}>{t("next")}</button>
      </div>
    </div>
  );
}
