import { comparePrintUnitNames } from "@/features/products/barcode-print";
import { ceilToLakIncrement, floorToLakIncrement, PERSISTED_ROUNDING_INCREMENTS } from "@/features/products/unit-pricing";
import { isSellableCoverageUnit } from "@/features/products/unit-coverage";

/**
 * Selling-price quotes for bulk update.
 * Percent and amount always start from that unit's own current selling price.
 * Increase rounds up and decrease rounds down. No Rounding keeps the LAK integer.
 * Exact multiples of the increment stay unchanged.
 * Pack and Box are never derived from Piece, cost, or conversion quantity.
 */
export const BULK_PRICE_MAX_LINES = 200;
export const BULK_PRICE_MAX_PERCENT = 1000;
export const BULK_PRICE_BATCH_SIZE = 25;

export type BulkPriceMethod = "set_exact" | "increase_amount" | "decrease_amount" | "increase_percent" | "decrease_percent";

export type BulkPriceUnitSource = {
  allowManualUnitSelect?: boolean;
  barcode?: string | null;
  costPriceLak?: number | null;
  id?: string;
  isBaseUnit?: boolean;
  isDefaultSaleUnit?: boolean;
  roundingLak?: number | null;
  sellingPriceLak?: number | null;
  status?: string | null;
  unitName?: string | null;
};

export type BulkPriceProductSource = {
  costPriceLak?: number | null;
  id: string;
  nameEn?: string | null;
  nameLo?: string | null;
  sellingPriceLak?: number | null;
  sku?: string | null;
  units?: BulkPriceUnitSource[] | null;
};

export type BulkPriceChoice = {
  barcode: string;
  costLak: number | null;
  isDefaultSale: boolean;
  nameEn: string;
  nameLo: string;
  priceLak: number;
  productId: string;
  roundingLak: number;
  sku: string;
  unitId: string;
  unitName: string;
};

export type BulkPriceQuote = {
  amount: number | null;
  newPriceLak: number | null;
  percent: number | null;
  rawPriceLak: number | null;
  reason: "invalid_value" | "negative" | "percent_range" | null;
};

export function normalizeUnitRounding(value: number | null | undefined) {
  const rounding = Math.trunc(Number(value));
  return PERSISTED_ROUNDING_INCREMENTS.includes(rounding as (typeof PERSISTED_ROUNDING_INCREMENTS)[number]) ? rounding : 0;
}

export function normalizeJobRounding(value: number | null | undefined) {
  const rounding = Math.trunc(Number(value));
  if (!Number.isFinite(rounding) || rounding < 0 || rounding > 100000) return 0;
  return rounding;
}

/** A successful selling-price write marks this unit. Legacy products use an empty unit id. */
export function shelfLabelReprintCandidate(input: { legacy?: boolean; productId: string; unitId: string }) {
  const legacy = input.legacy === true || input.unitId.length === 0;
  return {
    legacy,
    persist: true as const,
    productId: input.productId,
    unitId: legacy ? "" : input.unitId,
  };
}

export function bulkPriceUnits(product: BulkPriceProductSource): BulkPriceChoice[] {
  const shared = {
    nameEn: clean(product.nameEn),
    nameLo: clean(product.nameLo),
    productId: product.id,
    sku: clean(product.sku),
  };
  const units = product.units ?? [];
  if (units.length === 0) {
    const price = savedPrice(product.sellingPriceLak);
    if (price === null) return [];
    return [{
      ...shared,
      barcode: "",
      costLak: savedCost(product.costPriceLak),
      isDefaultSale: true,
      priceLak: price,
      roundingLak: 0,
      unitId: "",
      unitName: "Piece",
    }];
  }
  return units.filter((unit) => isSellableCoverageUnit(unit)).flatMap((unit) => {
    const price = savedPrice(unit.sellingPriceLak);
    if (price === null) return [];
    return [{
      ...shared,
      barcode: clean(unit.barcode),
      costLak: savedCost(unit.costPriceLak),
      isDefaultSale: Boolean(unit.isDefaultSaleUnit),
      priceLak: price,
      roundingLak: normalizeUnitRounding(unit.roundingLak),
      unitId: clean(unit.id),
      unitName: clean(unit.unitName) || "Unit",
    }];
  }).sort((left, right) => comparePrintUnitNames(left.unitName, right.unitName));
}

export function quoteBulkSellingPrice(input: {
  currentPriceLak: number;
  jobRounding?: number | null;
  method: BulkPriceMethod;
  roundExact?: boolean;
  roundingLak?: number;
  value: number;
}): BulkPriceQuote {
  const current = savedPrice(input.currentPriceLak);
  if (current === null) return invalid("invalid_value");
  if (!Number.isFinite(input.value) || input.value < 0) return invalid("invalid_value");
  const rounding = input.jobRounding === undefined || input.jobRounding === null
    ? normalizeUnitRounding(input.roundingLak)
    : normalizeJobRounding(input.jobRounding);

  if (input.method === "set_exact") {
    const exact = Math.round(input.value);
    if (input.roundExact && rounding > 0) return priced(current, ceilToLakIncrement(BigInt(exact), 1n, rounding), exact);
    return priced(current, exact, exact);
  }

  if (input.method === "increase_percent" || input.method === "decrease_percent") {
    const points = Math.round(input.value * 10);
    if (points > BULK_PRICE_MAX_PERCENT * 10) return invalid("percent_range");
    if (input.method === "decrease_percent" && points > 1000) return invalid("negative");
    const factor = input.method === "increase_percent" ? 1000 + points : 1000 - points;
    const numerator = BigInt(current) * BigInt(factor);
    const raw = Number(numerator / 1000n);
    const next = roundDirected(numerator, 1000n, rounding, input.method === "increase_percent" ? "up" : "down");
    return priced(current, next, raw);
  }

  const amount = Math.round(input.value);
  const raw = input.method === "increase_amount" ? current + amount : current - amount;
  if (raw < 0) return invalid("negative");
  const next = roundDirected(BigInt(raw), 1n, rounding, input.method === "increase_amount" ? "up" : "down");
  return priced(current, next, raw);
}

export function classifyBulkLine(input: {
  currentPriceLak: number;
  enabled: boolean;
  expectedPriceLak: number;
  found: boolean;
  newPriceLak: number;
}) {
  if (!input.found) return "failed" as const;
  if (!input.enabled) return "skipped" as const;
  if (!Number.isInteger(input.newPriceLak) || input.newPriceLak < 0) return "failed" as const;
  if (input.currentPriceLak !== input.expectedPriceLak) return "conflict" as const;
  if (input.currentPriceLak === input.newPriceLak) return "skipped" as const;
  return "updated" as const;
}

function roundDirected(numerator: bigint, denominator: bigint, increment: number, direction: "down" | "up") {
  if (increment <= 0) return Number(numerator / denominator);
  return direction === "up"
    ? ceilToLakIncrement(numerator, denominator, increment)
    : floorToLakIncrement(numerator, denominator, increment);
}

function priced(current: number, next: number, raw: number): BulkPriceQuote {
  if (!Number.isFinite(next) || next < 0) return invalid("negative");
  const amount = next - current;
  return {
    amount,
    newPriceLak: next,
    percent: current === 0 ? null : Math.round((amount / current) * 1000) / 10,
    rawPriceLak: raw,
    reason: null,
  };
}

function invalid(reason: BulkPriceQuote["reason"]): BulkPriceQuote {
  return { amount: null, newPriceLak: null, percent: null, rawPriceLak: null, reason };
}

function savedPrice(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) return null;
  return Math.round(price);
}

function savedCost(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  const cost = Number(value);
  if (!Number.isFinite(cost) || cost < 0) return null;
  return Math.round(cost);
}

function clean(value?: string | null) {
  return String(value ?? "").trim();
}
