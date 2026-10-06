import {
  DEFAULT_PRODUCT_LIST_PAGE_SIZE,
  DEFAULT_PRODUCT_SORT_MODE,
  parseProductListPageSize,
  parseProductSortMode,
  type ProductListPageSize,
  type ProductSortMode,
} from "@/features/products/product-sort";

/** Device preferences only. Never written to product or company records. */
export const PRODUCT_LIST_SORT_KEY = "ego.products.listSort";
export const PRODUCT_LIST_PAGE_SIZE_KEY = "ego.products.pageSize";
export const POS_PRODUCT_SORT_KEY = "ego.pos.productSort";
export const INVENTORY_STOCK_SORT_KEY = "ego.inventory.stockSort";

function readStored(key: string) {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore quota / private mode
  }
}

export function readProductListSort(): ProductSortMode {
  return parseProductSortMode(readStored(PRODUCT_LIST_SORT_KEY) ?? DEFAULT_PRODUCT_SORT_MODE);
}

export function writeProductListSort(mode: ProductSortMode) {
  writeStored(PRODUCT_LIST_SORT_KEY, mode);
}

export function readProductListPageSize(): ProductListPageSize {
  return parseProductListPageSize(readStored(PRODUCT_LIST_PAGE_SIZE_KEY) ?? DEFAULT_PRODUCT_LIST_PAGE_SIZE);
}

export function writeProductListPageSize(pageSize: ProductListPageSize) {
  writeStored(PRODUCT_LIST_PAGE_SIZE_KEY, String(pageSize));
}

export function readPosProductSort(): ProductSortMode {
  return parseProductSortMode(readStored(POS_PRODUCT_SORT_KEY) ?? DEFAULT_PRODUCT_SORT_MODE);
}

export function writePosProductSort(mode: ProductSortMode) {
  writeStored(POS_PRODUCT_SORT_KEY, mode);
}

export function readInventoryStockSort(): ProductSortMode {
  return parseProductSortMode(readStored(INVENTORY_STOCK_SORT_KEY) ?? DEFAULT_PRODUCT_SORT_MODE);
}

export function writeInventoryStockSort(mode: ProductSortMode) {
  writeStored(INVENTORY_STOCK_SORT_KEY, mode);
}
