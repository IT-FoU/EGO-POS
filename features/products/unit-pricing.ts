import type { UnitPricingMode } from "@/features/products/types";
import {
  applyHierarchyConversionsAndCosts,
  isHierarchyCostDerived,
  isHierarchyQtyLocked,
  isUnitEnabled,
  parsePositiveQty,
  unitRole,
  type HierarchyUnit,
} from "@/features/products/unit-hierarchy";
import { conversionMillis, deriveSharedUnitCost, toLakInteger } from "@/features/products/unit-pricing-math";

export { conversionMillis, deriveSharedUnitCost, toLakInteger } from "@/features/products/unit-pricing-math";

export const UNIT_ROUNDING_INCREMENTS = [0, 500, 1000] as const;
export const PERSISTED_ROUNDING_INCREMENTS = [0, 500, 1000, 5000] as const;

const MARKUP_SCALE = 1000n;
const PERCENT_SCALE = 100n * MARKUP_SCALE;

export type SharedStockUnit = HierarchyUnit & {
  addAmountLak?: number;
  markupPercent?: number;
  pricingMode?: UnitPricingMode;
  roundingLak?: number;
  sellingPriceLak: number;
};

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
    if (!isUnitEnabled(unit)) return unit;
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

  const patch: Partial<T> = { ...input.patch };
  if (patch.status === "inactive") {
    const remainingEnabled = input.units.filter((unit) => unit.id !== input.editedUnitId && isUnitEnabled(unit));
    if (remainingEnabled.length === 0) {
      return input.units;
    }
  }

  if (patch.hierarchyQty !== undefined && parsePositiveQty(patch.hierarchyQty) === null) {
    return input.units;
  }
  if (patch.conversionQty !== undefined && conversionMillis(patch.conversionQty) <= 0n) {
    return input.units;
  }
  if (isHierarchyQtyLocked(current, input.units)) {
    delete patch.hierarchyQty;
    delete patch.conversionQty;
  }
  if (input.shareStock && isHierarchyCostDerived(current, input.units)) {
    delete patch.costPriceLak;
  }

  if (patch.conversionQty !== undefined && patch.hierarchyQty === undefined) {
    const role = unitRole(current.unitName);
    const pack = input.units.find((unit) => unitRole(unit.unitName) === "pack" && isUnitEnabled(unit));
    if (role === "box" && pack) {
      const packQty = parsePositiveQty(pack.conversionQty) ?? 1;
      patch.hierarchyQty = Number(patch.conversionQty) / packQty as T["hierarchyQty"];
    } else {
      patch.hierarchyQty = patch.conversionQty as T["hierarchyQty"];
    }
  }

  const nextUnits = input.units.map((unit) => unit.id === input.editedUnitId ? { ...unit, ...patch } : unit);
  const edited = nextUnits.find((unit) => unit.id === input.editedUnitId)!;
  if (unitRole(current.unitName) === "pack" && (current.status ?? "active") !== (edited.status ?? "active")) {
    const pack = nextUnits.find((unit) => unitRole(unit.unitName) === "pack");
    const box = nextUnits.find((unit) => unitRole(unit.unitName) === "box");
    if (pack && box) {
      const packQty = parsePositiveQty(pack.conversionQty) ?? 1;
      if (isUnitEnabled(pack)) {
        box.hierarchyQty = (parsePositiveQty(box.conversionQty) ?? 1) / packQty;
      } else {
        box.hierarchyQty = parsePositiveQty(box.conversionQty) ?? 1;
      }
    }
  }
  const hierarchied = applyHierarchyConversionsAndCosts(nextUnits, input.shareStock);
  return applyAutomaticSellingPrices(hierarchied);
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
