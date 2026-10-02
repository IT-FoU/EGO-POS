import type { ReceiptPaperSize } from "@/features/settings/receipt-layout";

export type CurrencyCode = "LAK" | "THB" | "USD";
export type ReceiptPrintMode = "ask_every_time" | "auto_print" | "no_auto_print";

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
  /** Layout width for preview / print CSS only — not physical printer binding. */
  receiptPaperSize: ReceiptPaperSize;
  receiptPrintMode: ReceiptPrintMode;
  receiptPrefix: string;
  receiptShowAddress: boolean;
  receiptShowBranchName: boolean;
  receiptShowCashier: boolean;
  receiptShowCompanyName: boolean;
  receiptShowDateTime: boolean;
  receiptShowEmail: boolean;
  receiptShowFooter: boolean;
  receiptShowHeader: boolean;
  receiptShowPhone: boolean;
  receiptShowReceiptNumber: boolean;
  receiptShowTaxNumber: boolean;
  /** Default true: Pay requires Start Work (open cash + attendance). */
  requireCashShiftBeforeSale: boolean;
  roundingMethod: string;
  showLogoOnReceipt: boolean;
  showTaxOnReceipt: boolean;
  taxInclusive: boolean;
  taxNumber?: string;
  vatEnabled: boolean;
  vatRate: number;
};
