export const LABEL_PREVIEW_PAGE_SIZES = [12, 24, 48] as const;
export const LABEL_PREVIEW_PAGE_SIZE_KEY = "ego-pos-label-preview-page-size";

export type LabelPreviewPageSize = (typeof LABEL_PREVIEW_PAGE_SIZES)[number];

export function normalizeLabelPreviewPageSize(value: unknown): LabelPreviewPageSize {
  const size = Number(value);
  return size === 24 || size === 48 ? size : 12;
}

export function labelPreviewPageCount(total: number, pageSize: number) {
  const count = Math.max(0, Math.trunc(total));
  const size = Math.max(1, Math.trunc(pageSize));
  if (count === 0) return 1;
  return Math.ceil(count / size);
}

export function clampLabelPreviewPage(page: number, total: number, pageSize: number) {
  const pages = labelPreviewPageCount(total, pageSize);
  const current = Number.isFinite(page) ? Math.trunc(page) : 1;
  return Math.min(pages, Math.max(1, current));
}

export function sliceLabelPreview<T>(items: T[], page: number, pageSize: number) {
  const safePage = clampLabelPreviewPage(page, items.length, pageSize);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: safePage,
    pages: labelPreviewPageCount(items.length, pageSize),
  };
}

export function expandLabelCopies<T extends { copies: number }>(lines: T[]) {
  return lines.flatMap((line) => Array.from({ length: Math.max(0, line.copies) }, (_, copy) => ({ copy, line })));
}

export function nextLabelPreviewPage(input: {
  page: number;
  pageSize: number;
  previousSignature: string;
  signature: string;
  total: number;
}) {
  const page = input.signature === input.previousSignature ? input.page : 1;
  return clampLabelPreviewPage(page, input.total, input.pageSize);
}
