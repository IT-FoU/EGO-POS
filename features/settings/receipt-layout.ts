/**
 * Receipt layout prefs (paper size + content visibility) live in
 * company_settings.unit_pricing_defaults JSON under __receiptLayout.
 * No DDL / migration — same Pattern as legacy cash-shift JSON flag.
 */

export const RECEIPT_LAYOUT_JSON_KEY = "__receiptLayout";

export type ReceiptPaperSize = "58mm" | "80mm";

export type ReceiptVisibilityPrefs = {
  showAddress: boolean;
  showBranchName: boolean;
  showCashier: boolean;
  showCompanyName: boolean;
  showDateTime: boolean;
  showEmail: boolean;
  showFooter: boolean;
  showHeader: boolean;
  showPhone: boolean;
  showReceiptNumber: boolean;
  showTaxNumber: boolean;
};

export type ReceiptLayoutPrefs = {
  paperSize: ReceiptPaperSize;
  visibility: ReceiptVisibilityPrefs;
};

export const DEFAULT_RECEIPT_VISIBILITY: ReceiptVisibilityPrefs = {
  showAddress: true,
  showBranchName: true,
  showCashier: true,
  showCompanyName: true,
  showDateTime: true,
  showEmail: true,
  showFooter: true,
  showHeader: true,
  showPhone: true,
  showReceiptNumber: true,
  showTaxNumber: true,
};

export const DEFAULT_RECEIPT_LAYOUT: ReceiptLayoutPrefs = {
  paperSize: "80mm",
  visibility: { ...DEFAULT_RECEIPT_VISIBILITY },
};

/** Approximate CSS widths for thermal receipt preview / print layout. */
export const RECEIPT_PAPER_WIDTH_PX: Record<ReceiptPaperSize, number> = {
  "58mm": 220,
  "80mm": 302,
};

function asBool(value: unknown, fallback: boolean): boolean {
  if (value === false || value === 0 || value === "false" || value === "0") return false;
  if (value === true || value === 1 || value === "true" || value === "1") return true;
  return fallback;
}

function asPaperSize(value: unknown): ReceiptPaperSize {
  return value === "58mm" ? "58mm" : "80mm";
}

export function parseReceiptLayoutPrefs(value: unknown): ReceiptLayoutPrefs {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_RECEIPT_LAYOUT, visibility: { ...DEFAULT_RECEIPT_VISIBILITY } };
  }
  const raw = (value as Record<string, unknown>)[RECEIPT_LAYOUT_JSON_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_RECEIPT_LAYOUT, visibility: { ...DEFAULT_RECEIPT_VISIBILITY } };
  }
  const row = raw as Record<string, unknown>;
  const visRaw =
    row.visibility && typeof row.visibility === "object" && !Array.isArray(row.visibility)
      ? (row.visibility as Record<string, unknown>)
      : {};
  return {
    paperSize: asPaperSize(row.paperSize),
    visibility: {
      showAddress: asBool(visRaw.showAddress, true),
      showBranchName: asBool(visRaw.showBranchName, true),
      showCashier: asBool(visRaw.showCashier, true),
      showCompanyName: asBool(visRaw.showCompanyName, true),
      showDateTime: asBool(visRaw.showDateTime, true),
      showEmail: asBool(visRaw.showEmail, true),
      showFooter: asBool(visRaw.showFooter, true),
      showHeader: asBool(visRaw.showHeader, true),
      showPhone: asBool(visRaw.showPhone, true),
      showReceiptNumber: asBool(visRaw.showReceiptNumber, true),
      showTaxNumber: asBool(visRaw.showTaxNumber, true),
    },
  };
}

export function withReceiptLayoutPrefs(current: unknown, layout: ReceiptLayoutPrefs): Record<string, unknown> {
  const base =
    current && typeof current === "object" && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};
  return {
    ...base,
    [RECEIPT_LAYOUT_JSON_KEY]: {
      paperSize: layout.paperSize === "58mm" ? "58mm" : "80mm",
      visibility: {
        showAddress: layout.visibility.showAddress === true,
        showBranchName: layout.visibility.showBranchName === true,
        showCashier: layout.visibility.showCashier === true,
        showCompanyName: layout.visibility.showCompanyName === true,
        showDateTime: layout.visibility.showDateTime === true,
        showEmail: layout.visibility.showEmail === true,
        showFooter: layout.visibility.showFooter === true,
        showHeader: layout.visibility.showHeader === true,
        showPhone: layout.visibility.showPhone === true,
        showReceiptNumber: layout.visibility.showReceiptNumber === true,
        showTaxNumber: layout.visibility.showTaxNumber === true,
      },
    },
  };
}

export function receiptLayoutFromFormFields(input: {
  receiptPaperSize?: ReceiptPaperSize | string | null;
  receiptShowAddress?: boolean | null;
  receiptShowBranchName?: boolean | null;
  receiptShowCashier?: boolean | null;
  receiptShowCompanyName?: boolean | null;
  receiptShowDateTime?: boolean | null;
  receiptShowEmail?: boolean | null;
  receiptShowFooter?: boolean | null;
  receiptShowHeader?: boolean | null;
  receiptShowPhone?: boolean | null;
  receiptShowReceiptNumber?: boolean | null;
  receiptShowTaxNumber?: boolean | null;
}): ReceiptLayoutPrefs {
  return {
    paperSize: asPaperSize(input.receiptPaperSize),
    visibility: {
      showAddress: input.receiptShowAddress !== false,
      showBranchName: input.receiptShowBranchName !== false,
      showCashier: input.receiptShowCashier !== false,
      showCompanyName: input.receiptShowCompanyName !== false,
      showDateTime: input.receiptShowDateTime !== false,
      showEmail: input.receiptShowEmail !== false,
      showFooter: input.receiptShowFooter !== false,
      showHeader: input.receiptShowHeader !== false,
      showPhone: input.receiptShowPhone !== false,
      showReceiptNumber: input.receiptShowReceiptNumber !== false,
      showTaxNumber: input.receiptShowTaxNumber !== false,
    },
  };
}

export function receiptFormFieldsFromLayout(layout: ReceiptLayoutPrefs) {
  return {
    receiptPaperSize: layout.paperSize,
    receiptShowAddress: layout.visibility.showAddress,
    receiptShowBranchName: layout.visibility.showBranchName,
    receiptShowCashier: layout.visibility.showCashier,
    receiptShowCompanyName: layout.visibility.showCompanyName,
    receiptShowDateTime: layout.visibility.showDateTime,
    receiptShowEmail: layout.visibility.showEmail,
    receiptShowFooter: layout.visibility.showFooter,
    receiptShowHeader: layout.visibility.showHeader,
    receiptShowPhone: layout.visibility.showPhone,
    receiptShowReceiptNumber: layout.visibility.showReceiptNumber,
    receiptShowTaxNumber: layout.visibility.showTaxNumber,
  };
}
