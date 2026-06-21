import type { CurrencyCode } from "@/features/purchasing/types";

export function formatNumber(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
    useGrouping: true,
  }).format(value);
}

export function formatMoney(value: number, currency: CurrencyCode | "LAK" = "LAK") {
  return `${formatNumber(value, currency === "LAK" ? 0 : 2)} ${currency}`;
}

export function convertToLak(value: number, exchangeRate: number) {
  return value * exchangeRate;
}
