import type { UnitPricingMode } from "@/features/products/types";

export const UNIT_ROUNDING_INCREMENTS = [0, 500, 1000] as const;
export const PERSISTED_ROUNDING_INCREMENTS = [0, 500, 1000, 5000] as const;

const MARKUP_SCALE = 1000n;
const PERCENT_SCALE = 100n * MARKUP_SCALE;

export type SharedStockUnit = {
  addAmountLak?: number;
  conversionQty: number;
  costPriceLak?: number;
  id?: string;
  markupPercent?: number;
  pricingMode?: UnitPricingMode;
  roundingLak?: number;
  sellingPriceLak: number;
};

export function toLakInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.trunc(parsed);
}

export function conversionMillis(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0n;
  return BigInt(Math.trunc(parsed * 1000 + 1e-9));
}

export function deriveSharedUnitCost(editedCostLak: number, editedConversion: number, targetConversion: number) {
  const editedCost = toLakInteger(editedCostLak);
  const from = conversionMillis(editedConversion);
  const to = conversionMillis(targetConversion);
  if (from <= 0n) return 0;
  return Number((BigInt(editedCost) * to) / from);
}

export function syncSharedStockCosts<T extends SharedStockUnit>(units: T[], editedUnitId: string, nextCostLak: number): T[] {
  const edited = units.find((unit) => unit.id === editedUnitId);
  if (!edited) return units;
  const editedConversion = Number(edited.conversionQty);
  if (conversionMillis(editedConversion) <= 0n) return units;
  const editedCost = toLakInteger(nextCostLak);
  return units.map((unit) => {
    if (unit.id === editedUnitId) {
      return { ...unit, costPriceLak: editedCost };
    }
    return {
      ...unit,
      costPriceLak: deriveSharedUnitCost(editedCost, editedConversion, Number(unit.conversionQty)),
    };
  });
}

export function markupMillis(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0n;
  return BigInt(Math.trunc(parsed * Number(MARKUP_SCALE) + 1e-9));
}

export function ceilToLakIncrement(rawNumerator: bigint, rawDenominator: bigint, increment: number) {
  if (rawDenominator <= 0n) return 0;
  if (rawNumerator <= 0n) return 0;
  if (increment <= 0) {
    return Number(rawNumerator / rawDenominator);
  }
  const step = BigInt(increment);
  const scaledDenominator = rawDenominator * step;
  const roundedSteps = (rawNumerator + scaledDenominator - 1n) / scaledDenominator;
  return Number(roundedSteps * step);
}

export function sellingPriceFromCost(input: {
  addAmountLak?: number;
  costPriceLak?: number;
  markupPercent?: number;
  pricingMode?: UnitPricingMode;
  roundingLak?: number;
}) {
  const cost = toLakInteger(input.costPriceLak);
  const rounding = PERSISTED_ROUNDING_INCREMENTS.includes(toLakInteger(input.roundingLak) as (typeof PERSISTED_ROUNDING_INCREMENTS)[number])
    ? toLakInteger(input.roundingLak)
    : 0;
  const mode = input.pricingMode === "cost_plus_percent" || input.pricingMode === "cost_plus_amount"
    ? input.pricingMode
    : "manual";

  if (mode === "manual") {
    return undefined;
  }

  let numerator: bigint;
  let denominator: bigint;
  if (mode === "cost_plus_amount") {
    numerator = BigInt(cost + toLakInteger(input.addAmountLak));
    denominator = 1n;
  } else {
    numerator = BigInt(cost) * (PERCENT_SCALE + markupMillis(input.markupPercent));
    denominator = PERCENT_SCALE;
  }
  return ceilToLakIncrement(numerator, denominator, rounding);
}

export function applyAutomaticSellingPrices<T extends SharedStockUnit>(units: T[]): T[] {
  return units.map((unit) => {
    const nextPrice = sellingPriceFromCost(unit);
    if (nextPrice === undefined) return unit;
    return { ...unit, sellingPriceLak: nextPrice };
  });
}

export function applyUnitPricingPatch<T extends SharedStockUnit>(input: {
  editedUnitId: string;
  patch: Partial<T>;
  shareStock: boolean;
  units: T[];
}): T[] {
  const current = input.units.find((unit) => unit.id === input.editedUnitId);
  if (!current) return input.units;

  const nextConversion = input.patch.conversionQty === undefined ? Number(current.conversionQty) : Number(input.patch.conversionQty);
  if (input.patch.conversionQty !== undefined && conversionMillis(nextConversion) <= 0n) {
    return input.units;
  }

  let nextUnits = input.units.map((unit) => unit.id === input.editedUnitId ? { ...unit, ...input.patch } : unit);

  const costChanged = input.patch.costPriceLak !== undefined;
  const conversionChanged = input.patch.conversionQty !== undefined;
  if (input.shareStock && (costChanged || conversionChanged)) {
    const anchor = nextUnits.find((unit) => unit.id === input.editedUnitId)!;
    nextUnits = syncSharedStockCosts(nextUnits, anchor.id ?? input.editedUnitId, Number(anchor.costPriceLak ?? 0));
  }

  return applyAutomaticSellingPrices(nextUnits);
}

export function applyRoundingToAllUnits<T extends SharedStockUnit>(units: T[], roundingLak: number): T[] {
  const rounding = UNIT_ROUNDING_INCREMENTS.includes(toLakInteger(roundingLak) as (typeof UNIT_ROUNDING_INCREMENTS)[number])
    ? toLakInteger(roundingLak)
    : 0;
  return applyAutomaticSellingPrices(units.map((unit) => ({ ...unit, roundingLak: rounding })));
}

export function assertSafePricingValue(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a finite number greater than or equal to zero.`);
  }
}
