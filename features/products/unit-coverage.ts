import { unitRole } from "@/features/products/unit-hierarchy";

/**
 * Unit coverage for Product Health.
 *
 * Enabled selling units match POS `resolvePosSaleUnits`: status is not inactive,
 * and manual selection is not blocked.
 *
 * A unit image counts only when that unit row stores its own image reference.
 * A POS/display fallback to the product image does not count.
 * A unit barcode counts only when that unit row stores a non-blank barcode.
 * The product-level barcode does not cover other units.
 *
 * Legacy products with no unit rows keep one implicit Piece unit. That unit
 * uses the product image and product barcode already stored on the product.
 * No unit rows are created.
 */
export type CoverageUnit = {
  allowManualUnitSelect?: boolean;
  barcode?: string | null;
  imageUrl?: string | null;
  sortOrder?: number;
  status?: string | null;
  unitName?: string | null;
};

export type CoverageProduct = {
  barcode?: string | null;
  imageUrl?: string | null;
  units?: CoverageUnit[] | null;
};

const ROLE_ORDER = { piece: 0, pack: 1, box: 2, custom: 3 } as const;

export function isSellableCoverageUnit(unit: CoverageUnit) {
  return (unit.status ?? "active") !== "inactive" && unit.allowManualUnitSelect !== false;
}

export function hasAssignedUnitImage(value?: string | null) {
  return Boolean(value && value.trim());
}

export function hasAssignedUnitBarcode(value?: string | null) {
  return Boolean(value && value.trim());
}

function compareCoverageUnits(left: CoverageUnit, right: CoverageUnit) {
  const roleDiff = ROLE_ORDER[unitRole(left.unitName)] - ROLE_ORDER[unitRole(right.unitName)];
  if (roleDiff !== 0) return roleDiff;
  const sortDiff = (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
  if (sortDiff !== 0) return sortDiff;
  return String(left.unitName ?? "").localeCompare(String(right.unitName ?? ""));
}

export function sellableCoverageUnits(product: CoverageProduct): CoverageUnit[] {
  const units = product.units ?? [];
  if (units.length === 0) {
    return [{
      allowManualUnitSelect: true,
      barcode: product.barcode,
      imageUrl: product.imageUrl,
      sortOrder: 0,
      status: "active",
      unitName: "Piece",
    }];
  }
  return units.filter(isSellableCoverageUnit).sort(compareCoverageUnits);
}

export function missingImageUnits(product: CoverageProduct) {
  return sellableCoverageUnits(product).filter((unit) => !hasAssignedUnitImage(unit.imageUrl));
}

export function missingBarcodeUnits(product: CoverageProduct) {
  return sellableCoverageUnits(product).filter((unit) => !hasAssignedUnitBarcode(unit.barcode));
}

export function productMissingImage(product: CoverageProduct) {
  return missingImageUnits(product).length > 0;
}

export function productMissingBarcode(product: CoverageProduct) {
  return missingBarcodeUnits(product).length > 0;
}
