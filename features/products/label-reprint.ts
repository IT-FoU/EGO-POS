import { isSellableCoverageUnit } from "@/features/products/unit-coverage";

export type ReprintUnit = {
  allowManualUnitSelect?: boolean;
  labelPrintedAt?: string | null;
  labelReprintNeeded?: boolean;
  status?: string | null;
  unitName?: string | null;
};

export type ReprintProduct = {
  labelPrintedAt?: string | null;
  labelReprintNeeded?: boolean;
  units?: ReprintUnit[] | null;
};

export function sellingPriceChanged(oldPrice: number, newPrice: number) {
  return Math.round(Number(oldPrice)) !== Math.round(Number(newPrice));
}

export function reprintUnitNames(product: ReprintProduct) {
  const units = product.units ?? [];
  if (units.length === 0) return product.labelReprintNeeded ? ["Piece"] : [];
  return units
    .filter((unit) => isSellableCoverageUnit(unit) && unit.labelReprintNeeded)
    .map((unit) => String(unit.unitName || "Unit"));
}

export function productNeedsLabelReprint(product: ReprintProduct) {
  return reprintUnitNames(product).length > 0;
}

export function latestReprintPrintedAt(product: ReprintProduct) {
  const units = product.units ?? [];
  const stamps = units.length === 0
    ? [product.labelPrintedAt]
    : units.filter((unit) => isSellableCoverageUnit(unit) && unit.labelReprintNeeded).map((unit) => unit.labelPrintedAt);
  const parsed = stamps
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter((value) => Number.isFinite(value));
  if (parsed.length === 0) return null;
  return new Date(Math.max(...parsed)).toISOString();
}
