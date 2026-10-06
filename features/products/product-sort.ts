export const PRODUCT_SORT_MODES = ["name_asc", "name_desc", "newest", "oldest"] as const;

export type ProductSortMode = (typeof PRODUCT_SORT_MODES)[number];

export const DEFAULT_PRODUCT_SORT_MODE: ProductSortMode = "newest";

export const PRODUCT_LIST_PAGE_SIZES = [25, 50, 100, 200] as const;

export type ProductListPageSize = (typeof PRODUCT_LIST_PAGE_SIZES)[number];

export const DEFAULT_PRODUCT_LIST_PAGE_SIZE: ProductListPageSize = 100;

export type ProductSortLocale = "en" | "lo";

export type ProductSortRecord = {
  createdAt?: string | null;
  id: string;
  nameEn?: string | null;
  nameLo?: string | null;
};

export function parseProductSortMode(value: unknown): ProductSortMode {
  return PRODUCT_SORT_MODES.includes(value as ProductSortMode)
    ? (value as ProductSortMode)
    : DEFAULT_PRODUCT_SORT_MODE;
}

export function parseProductListPageSize(value: unknown, fallback: ProductListPageSize = DEFAULT_PRODUCT_LIST_PAGE_SIZE): ProductListPageSize {
  const parsed = Number(value);
  return PRODUCT_LIST_PAGE_SIZES.includes(parsed as ProductListPageSize)
    ? (parsed as ProductListPageSize)
    : fallback;
}

export function productSortName(record: Pick<ProductSortRecord, "nameEn" | "nameLo">, locale: ProductSortLocale) {
  const nameEn = record.nameEn?.trim() ?? "";
  const nameLo = record.nameLo?.trim() ?? "";
  return locale === "lo" ? nameLo || nameEn : nameEn || nameLo;
}

function createdAtMillis(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function compareProductSort(left: ProductSortRecord, right: ProductSortRecord, mode: ProductSortMode, locale: ProductSortLocale) {
  if (mode === "name_asc" || mode === "name_desc") {
    const compared = productSortName(left, locale).localeCompare(productSortName(right, locale), locale, {
      numeric: true,
      sensitivity: "base",
    });
    if (compared !== 0) return mode === "name_asc" ? compared : -compared;
  } else {
    const leftTime = createdAtMillis(left.createdAt);
    const rightTime = createdAtMillis(right.createdAt);
    if (leftTime !== rightTime) return mode === "newest" ? rightTime - leftTime : leftTime - rightTime;
  }
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

export function sortProductRecords<T extends ProductSortRecord>(records: readonly T[], mode: ProductSortMode, locale: ProductSortLocale): T[] {
  return [...records].sort((left, right) => compareProductSort(left, right, mode, locale));
}

export function productListOrderBy(sort: ProductSortMode, locale: ProductSortLocale) {
  if (sort === "name_asc") {
    return locale === "lo"
      ? [{ nameLo: { sort: "asc" as const, nulls: "last" as const } }, { id: "asc" as const }]
      : [{ nameEn: { sort: "asc" as const, nulls: "last" as const } }, { id: "asc" as const }];
  }
  if (sort === "name_desc") {
    return locale === "lo"
      ? [{ nameLo: { sort: "desc" as const, nulls: "last" as const } }, { id: "asc" as const }]
      : [{ nameEn: { sort: "desc" as const, nulls: "last" as const } }, { id: "asc" as const }];
  }
  if (sort === "oldest") {
    return [{ createdAt: "asc" as const }, { id: "asc" as const }];
  }
  return [{ createdAt: "desc" as const }, { id: "asc" as const }];
}
