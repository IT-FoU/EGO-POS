export const currencyRates = {
  LAK: 1,
  THB: 0.0016,
  USD: 0.000046,
} as const;

export type ReportCurrency = keyof typeof currencyRates;
