export type CurrencyCode = "LAK" | "THB" | "USD";

export type SettingsFormData = {
  baseCurrency: CurrencyCode;
  companyName: string;
  currencyDisplay: string;
  decimalPlaces: number;
  loyaltyEnabled: boolean;
  loyaltyMinRedeemPoints: number;
  loyaltyPointValueLak: number;
  loyaltySpendPerPointLak: number;
  profileAddress?: string;
  profileEmail?: string;
  profilePhone?: string;
  receiptFooter?: string;
  receiptHeader?: string;
  receiptPrefix: string;
  roundingMethod: string;
  showLogoOnReceipt: boolean;
  showTaxOnReceipt: boolean;
  taxInclusive: boolean;
  taxNumber?: string;
  vatEnabled: boolean;
  vatRate: number;
};
