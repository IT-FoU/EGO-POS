/** Shared SKU builder used by Auto-generate button, name blur, and Save. */
export function buildSkuFromProductName(productName: string, now = Date.now()): string {
  const baseName = productName.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  const prefix = (baseName || "SKU").slice(0, 12);
  const timestamp = now.toString().slice(-4);
  return `${prefix}-${timestamp}`;
}

/** Fill SKU only when empty and a product name is available. Never overwrites a manual SKU. */
export function ensureSkuWhenEmpty(productName: string, sku: string, now = Date.now()): string {
  const trimmedSku = sku.trim();
  if (trimmedSku) return trimmedSku;
  const trimmedName = productName.trim();
  if (!trimmedName) return "";
  return buildSkuFromProductName(trimmedName, now);
}

export type ProductRequiredFieldKey = "productName" | "sku" | "category";

export function collectProductRequiredGaps(input: {
  categoryId?: string | null;
  productName: string;
  requireCategory?: boolean;
  sku: string;
}): ProductRequiredFieldKey[] {
  const gaps: ProductRequiredFieldKey[] = [];
  if (!input.productName.trim()) gaps.push("productName");
  if (!input.sku.trim()) gaps.push("sku");
  if (input.requireCategory !== false && !String(input.categoryId ?? "").trim()) {
    gaps.push("category");
  }
  return gaps;
}
