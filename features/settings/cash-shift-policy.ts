import { readRequireCashShiftBeforeSaleFromJson } from "@/features/products/unit-pricing-defaults";

export type CashShiftPolicyRow = {
  requireCashShiftBeforeSale?: boolean | null;
  unitPricingDefaults?: unknown;
};

/**
 * Canonical read.
 * An explicit boolean on the company row wins.
 * JSON is consulted only when that boolean is absent, so a pre-migration
 * row still treats a missing key as required and an explicit false as off.
 * Callers that already have a non-null column must not write the JSON key.
 */
export function readCompanyRequireCashShift(row: CashShiftPolicyRow | null | undefined): boolean {
  if (!row) return true;
  if (row.requireCashShiftBeforeSale === false) return false;
  if (row.requireCashShiftBeforeSale === true) return true;
  return readRequireCashShiftBeforeSaleFromJson(row.unitPricingDefaults ?? row);
}
