import type { ProductUnit, UnitPricingMode } from "@/features/products/types";
import { PERSISTED_ROUNDING_INCREMENTS, toLakInteger } from "@/features/products/unit-pricing";

export type UnitPricingDefault = {
  markupPercent: number;
  pricingMode: UnitPricingMode;
  roundingLak: number;
};

export type UnitPricingDefaultsMap = {
  units: Record<string, UnitPricingDefault>;
  version: 1;
};

export function normalizeUnitTypeKey(unitName: unknown) {
  return String(unitName ?? "").trim().toLowerCase();
}

export function emptyPricingDefaults(): UnitPricingDefaultsMap {
  return { units: {}, version: 1 };
}

function normalizePricingMode(value: unknown): UnitPricingMode {
  return value === "cost_plus_percent" || value === "cost_plus_amount" ? value : "manual";
}

function normalizeRounding(value: unknown) {
  const rounding = toLakInteger(value);
  return PERSISTED_ROUNDING_INCREMENTS.includes(rounding as (typeof PERSISTED_ROUNDING_INCREMENTS)[number]) ? rounding : 0;
}

export function parseUnitPricingDefaults(value: unknown): UnitPricingDefaultsMap {
  const defaults = emptyPricingDefaults();
  if (!value || typeof value !== "object") return defaults;
  const units = (value as { units?: unknown }).units;
  if (!units || typeof units !== "object") return defaults;
  for (const [key, entry] of Object.entries(units as Record<string, unknown>)) {
    const typeKey = normalizeUnitTypeKey(key);
    if (!typeKey || !entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const markup = Number(row.markupPercent);
    defaults.units[typeKey] = {
      markupPercent: Number.isFinite(markup) && markup >= 0 ? Math.trunc(markup * 1000 + 1e-9) / 1000 : 0,
      pricingMode: normalizePricingMode(row.pricingMode),
      roundingLak: normalizeRounding(row.roundingLak),
    };
  }
  return defaults;
}

export function defaultForUnitType(defaults: UnitPricingDefaultsMap | undefined, unitName: unknown): UnitPricingDefault {
  const key = normalizeUnitTypeKey(unitName);
  return defaults?.units[key] ?? {
    markupPercent: 0,
    pricingMode: "manual",
    roundingLak: 0,
  };
}

export function applyDefaultsToNewUnit<T extends Pick<ProductUnit, "unitName" | "pricingMode" | "markupPercent" | "roundingLak">>(
  unit: T,
  defaults: UnitPricingDefaultsMap | undefined,
): T {
  const preset = defaultForUnitType(defaults, unit.unitName);
  return {
    ...unit,
    markupPercent: preset.markupPercent,
    pricingMode: preset.pricingMode,
    roundingLak: preset.roundingLak,
  };
}

export function mergeUnitPricingDefaultsFromUnits(
  current: unknown,
  units: Array<{ markupPercent?: number; pricingMode?: string; roundingLak?: number; unitName: string }>,
): UnitPricingDefaultsMap {
  const next = parseUnitPricingDefaults(current);
  for (const unit of units) {
    const key = normalizeUnitTypeKey(unit.unitName);
    if (!key) continue;
    next.units[key] = {
      markupPercent: Math.max(0, Number.isFinite(Number(unit.markupPercent)) ? Math.trunc(Number(unit.markupPercent) * 1000 + 1e-9) / 1000 : 0),
      pricingMode: normalizePricingMode(unit.pricingMode),
      roundingLak: normalizeRounding(unit.roundingLak),
    };
  }
  return next;
}
