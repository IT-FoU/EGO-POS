import type { ReceiptPaperSize } from "@/features/settings/receipt-layout";

export type CurrencyCode = "LAK" | "THB" | "USD";
export type ReceiptPrintMode = "ask_every_time" | "auto_print" | "no_auto_print";

export type SettingsFormData = {
  baseCurrency: CurrencyCode;
  companyName: string;
  currencyDisplay: string;
  decimalPlaces: number;
  loyaltyAllowPartial: boolean;
  loyaltyAllowRedeemWithDiscount: boolean;
  loyaltyEnabled: boolean;
  loyaltyExpiryDays: number;
  loyaltyExpiryEnabled: boolean;
  loyaltyExpiryUnit: "days" | "months";
  loyaltyMaxRedeemPoints: number;
  loyaltyMinRedeemPoints: number;
  loyaltyPointValueLak: number;
  loyaltySpendPerPointLak: number;
  profileAddress?: string;
  profileEmail?: string;
  profilePhone?: string;
  receiptFooter?: string;
  receiptHeader?: string;
  /** Layout for preview / print CSS only — not physical printer binding. */
  receiptPaperSize: ReceiptPaperSize;
  receiptCustomWidthMm: number;
  receiptCustomHeightMm: number;
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
  /** Layout gate. Account Print on Receipt remains a separate eligibility flag. */
  receiptShowQr: boolean;
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
