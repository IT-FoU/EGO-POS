/**
 * Receipt layout prefs (paper size + content visibility) live in
 * company_settings.unit_pricing_defaults JSON under __receiptLayout.
 * No DDL / migration — same pattern as legacy cash-shift JSON flag.
 */

export const RECEIPT_LAYOUT_JSON_KEY = "__receiptLayout";

export type ReceiptPaperSize = "58mm" | "80mm" | "a5" | "a4" | "custom";

export const RECEIPT_PAPER_SIZE_OPTIONS: ReceiptPaperSize[] = ["58mm", "80mm", "a5", "a4", "custom"];

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
  showQr: boolean;
  showReceiptNumber: boolean;
  showTaxNumber: boolean;
};

export type ReceiptLayoutPrefs = {
  customHeightMm: number;
  customWidthMm: number;
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
  /** Missing stored value stays ON so existing eligible receipt QR keeps printing. */
  showQr: true,
  showReceiptNumber: true,
  showTaxNumber: true,
};

/** Default Custom paper when Custom is first selected (mm). */
export const DEFAULT_CUSTOM_WIDTH_MM = 100;
export const DEFAULT_CUSTOM_HEIGHT_MM = 150;

export const CUSTOM_WIDTH_MIN_MM = 40;
export const CUSTOM_WIDTH_MAX_MM = 320;
export const CUSTOM_HEIGHT_MIN_MM = 60;
export const CUSTOM_HEIGHT_MAX_MM = 420;

export const DEFAULT_RECEIPT_LAYOUT: ReceiptLayoutPrefs = {
  customHeightMm: DEFAULT_CUSTOM_HEIGHT_MM,
  customWidthMm: DEFAULT_CUSTOM_WIDTH_MM,
  paperSize: "80mm",
  visibility: { ...DEFAULT_RECEIPT_VISIBILITY },
};

/** Approximate CSS widths for thermal receipt preview (continuous height). */
export const RECEIPT_PAPER_WIDTH_PX: Record<"58mm" | "80mm", number> = {
  "58mm": 220,
  "80mm": 302,
};

export type PaperDimensionsMm = {
  continuous: boolean;
  heightMm: number;
  widthMm: number;
};

function asBool(value: unknown, fallback: boolean): boolean {
  if (value === false || value === 0 || value === "false" || value === "0") return false;
  if (value === true || value === 1 || value === "true" || value === "1") return true;
  return fallback;
}

export function asPaperSize(value: unknown): ReceiptPaperSize {
  if (value === "58mm" || value === "80mm" || value === "a5" || value === "a4" || value === "custom") {
    return value;
  }
  return "80mm";
}

export function isThermalPaperSize(size: ReceiptPaperSize): boolean {
  return size === "58mm" || size === "80mm";
}

export function isDocumentPaperSize(size: ReceiptPaperSize): boolean {
  return !isThermalPaperSize(size);
}

function toPositiveMm(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 10) / 10));
}

export function clampCustomWidthMm(value: unknown): number {
  return toPositiveMm(value, DEFAULT_CUSTOM_WIDTH_MM, CUSTOM_WIDTH_MIN_MM, CUSTOM_WIDTH_MAX_MM);
}

export function clampCustomHeightMm(value: unknown): number {
  return toPositiveMm(value, DEFAULT_CUSTOM_HEIGHT_MM, CUSTOM_HEIGHT_MIN_MM, CUSTOM_HEIGHT_MAX_MM);
}

export type CustomPaperValidationError =
  | "receiptCustomWidthRequired"
  | "receiptCustomHeightRequired"
  | "receiptCustomWidthInvalid"
  | "receiptCustomHeightInvalid"
  | "receiptCustomWidthRange"
  | "receiptCustomHeightRange";

export function validateCustomPaperDimensions(
  widthRaw: unknown,
  heightRaw: unknown,
): { ok: true; heightMm: number; widthMm: number } | { ok: false; errorKey: CustomPaperValidationError } {
  const widthText = String(widthRaw ?? "").trim();
  const heightText = String(heightRaw ?? "").trim();
  if (!widthText) return { ok: false, errorKey: "receiptCustomWidthRequired" };
  if (!heightText) return { ok: false, errorKey: "receiptCustomHeightRequired" };
  const width = Number(widthText);
  const height = Number(heightText);
  if (!Number.isFinite(width) || Number.isNaN(width)) return { ok: false, errorKey: "receiptCustomWidthInvalid" };
  if (!Number.isFinite(height) || Number.isNaN(height)) return { ok: false, errorKey: "receiptCustomHeightInvalid" };
  if (width <= 0) return { ok: false, errorKey: "receiptCustomWidthInvalid" };
  if (height <= 0) return { ok: false, errorKey: "receiptCustomHeightInvalid" };
  if (width < CUSTOM_WIDTH_MIN_MM || width > CUSTOM_WIDTH_MAX_MM) return { ok: false, errorKey: "receiptCustomWidthRange" };
  if (height < CUSTOM_HEIGHT_MIN_MM || height > CUSTOM_HEIGHT_MAX_MM) return { ok: false, errorKey: "receiptCustomHeightRange" };
  return {
    ok: true,
    heightMm: Math.round(height * 10) / 10,
    widthMm: Math.round(width * 10) / 10,
  };
}

export function resolvePaperDimensionsMm(
  paperSize: ReceiptPaperSize,
  customWidthMm?: number | null,
  customHeightMm?: number | null,
): PaperDimensionsMm {
  if (paperSize === "58mm") return { continuous: true, heightMm: 200, widthMm: 58 };
  if (paperSize === "80mm") return { continuous: true, heightMm: 220, widthMm: 80 };
  if (paperSize === "a5") return { continuous: false, heightMm: 210, widthMm: 148 };
  if (paperSize === "a4") return { continuous: false, heightMm: 297, widthMm: 210 };
  return {
    continuous: false,
    heightMm: clampCustomHeightMm(customHeightMm),
    widthMm: clampCustomWidthMm(customWidthMm),
  };
}

/** Screen preview: convert mm → CSS px, then cap so A4/A5 fit the Settings panel. */
export function resolvePreviewPaperStyle(
  paperSize: ReceiptPaperSize,
  customWidthMm?: number | null,
  customHeightMm?: number | null,
  maxWidthPx = 420,
): { heightPx: number | "auto"; widthPx: number } {
  const dims = resolvePaperDimensionsMm(paperSize, customWidthMm, customHeightMm);
  if (isThermalPaperSize(paperSize)) {
    return {
      heightPx: "auto",
      widthPx: paperSize === "58mm" ? RECEIPT_PAPER_WIDTH_PX["58mm"] : RECEIPT_PAPER_WIDTH_PX["80mm"],
    };
  }
  const mmToPx = 2.6;
  const naturalWidth = dims.widthMm * mmToPx;
  const widthPx = Math.min(naturalWidth, maxWidthPx);
  const scale = widthPx / naturalWidth;
  return {
    heightPx: Math.round(dims.heightMm * mmToPx * scale),
    widthPx: Math.round(widthPx),
  };
}

/** Browser @page size value — layout hint only; OS printer tray is not controlled. */
export function resolvePrintPageSizeCss(
  paperSize: ReceiptPaperSize,
  customWidthMm?: number | null,
  customHeightMm?: number | null,
): string {
  if (paperSize === "a4") return "A4";
  if (paperSize === "a5") return "A5";
  if (paperSize === "58mm") return "58mm auto";
  if (paperSize === "80mm") return "80mm auto";
  const dims = resolvePaperDimensionsMm("custom", customWidthMm, customHeightMm);
  return `${dims.widthMm}mm ${dims.heightMm}mm`;
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
    customHeightMm: clampCustomHeightMm(row.customHeightMm ?? DEFAULT_CUSTOM_HEIGHT_MM),
    customWidthMm: clampCustomWidthMm(row.customWidthMm ?? DEFAULT_CUSTOM_WIDTH_MM),
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
      showQr: asBool(visRaw.showQr, true),
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
      customHeightMm: clampCustomHeightMm(layout.customHeightMm),
      customWidthMm: clampCustomWidthMm(layout.customWidthMm),
      paperSize: asPaperSize(layout.paperSize),
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
        showQr: layout.visibility.showQr === true,
        showReceiptNumber: layout.visibility.showReceiptNumber === true,
        showTaxNumber: layout.visibility.showTaxNumber === true,
      },
    },
  };
}

export function receiptLayoutFromFormFields(input: {
  receiptCustomHeightMm?: number | null;
  receiptCustomWidthMm?: number | null;
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
  receiptShowQr?: boolean | null;
  receiptShowReceiptNumber?: boolean | null;
  receiptShowTaxNumber?: boolean | null;
}): ReceiptLayoutPrefs {
  return {
    customHeightMm: clampCustomHeightMm(input.receiptCustomHeightMm),
    customWidthMm: clampCustomWidthMm(input.receiptCustomWidthMm),
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
      showQr: input.receiptShowQr !== false,
      showReceiptNumber: input.receiptShowReceiptNumber !== false,
      showTaxNumber: input.receiptShowTaxNumber !== false,
    },
  };
}

export function receiptFormFieldsFromLayout(layout: ReceiptLayoutPrefs) {
  return {
    receiptCustomHeightMm: layout.customHeightMm,
    receiptCustomWidthMm: layout.customWidthMm,
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
    receiptShowQr: layout.visibility.showQr,
    receiptShowReceiptNumber: layout.visibility.showReceiptNumber,
    receiptShowTaxNumber: layout.visibility.showTaxNumber,
  };
}
