/**
 * Pure POS read/search helpers (Phase 6).
 *
 * Shared by the online (SSR snapshot) and offline (local replica) POS read
 * adapters so search/barcode/lookup results are identical regardless of source.
 * No DB/browser imports.
 */

import type {
  CategoryPayload,
  CustomerPayload,
  ProductPayload,
} from "../replica/reference-types";

export function normalizeQuery(query: string): string {
  return (query ?? "").trim().toLowerCase();
}

export function productMatchesQuery(product: ProductPayload, normalized: string): boolean {
  if (!normalized) return true;
  if (product.name.toLowerCase().includes(normalized)) return true;
  if (product.sku && product.sku.toLowerCase().includes(normalized)) return true;
  return product.barcodes.some((barcode) => barcode.toLowerCase().includes(normalized));
}

/** Active-product search by name/sku/barcode, deterministically ordered by name+id. */
export function searchProducts(
  products: ProductPayload[],
  query: string,
  limit = 50,
): ProductPayload[] {
  const normalized = normalizeQuery(query);
  return products
    .filter((product) => product.isActive)
    .filter((product) => productMatchesQuery(product, normalized))
    .sort((a, b) =>
      a.name === b.name ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.name < b.name ? -1 : 1,
    )
    .slice(0, Math.max(0, limit));
}

/** Exact barcode match against product or any of its unit barcodes (active only). */
export function findProductByBarcode(
  products: ProductPayload[],
  barcode: string,
): ProductPayload | null {
  const target = (barcode ?? "").trim();
  if (!target) return null;
  const match = products.find(
    (product) => product.isActive && product.barcodes.some((code) => code === target),
  );
  return match ?? null;
}

export function customerMatchesQuery(customer: CustomerPayload, normalized: string): boolean {
  if (!normalized) return true;
  if (customer.name.toLowerCase().includes(normalized)) return true;
  if (customer.code.toLowerCase().includes(normalized)) return true;
  return Boolean(customer.phone && customer.phone.toLowerCase().includes(normalized));
}

export function searchCustomers(
  customers: CustomerPayload[],
  query: string,
  limit = 50,
): CustomerPayload[] {
  const normalized = normalizeQuery(query);
  return customers
    .filter((customer) => customerMatchesQuery(customer, normalized))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .slice(0, Math.max(0, limit));
}

export function listCategoriesSorted(categories: CategoryPayload[]): CategoryPayload[] {
  return [...categories].sort((a, b) =>
    a.name === b.name ? (a.id < b.id ? -1 : 1) : a.name < b.name ? -1 : 1,
  );
}
