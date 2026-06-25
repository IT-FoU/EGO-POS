import { readStringFromStorage, writeStringToStorage } from "@/lib/demo/storage";

export type ReceiptPrintModePreference = "ask_every_time" | "auto_print" | "no_auto_print";

const RECEIPT_PRINT_MODE_KEY = "ego-pos:receipt-print-mode";

function normalize(value: string | null | undefined): ReceiptPrintModePreference | null {
  if (value === "auto_print" || value === "no_auto_print" || value === "ask_every_time") {
    return value;
  }
  return null;
}

export function readReceiptPrintModePreference(
  fallback: ReceiptPrintModePreference = "ask_every_time",
): ReceiptPrintModePreference {
  return normalize(readStringFromStorage(RECEIPT_PRINT_MODE_KEY)) ?? fallback;
}

export function writeReceiptPrintModePreference(mode: ReceiptPrintModePreference) {
  writeStringToStorage(RECEIPT_PRINT_MODE_KEY, mode);
}
