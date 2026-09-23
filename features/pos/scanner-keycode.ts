/**
 * POS keyboard-wedge scanner helper (layout-safe).
 *
 * HID scanners inject physical key codes. The OS keyboard layout may translate
 * those into Lao/Thai (etc.) characters in input.value. This module rebuilds
 * ASCII barcodes from KeyboardEvent.code for confirmed scanner sequences only.
 *
 * Human typing stays on the normal controlled input path (productQuery).
 */

/** Max gap between successive codes to stay in one scanner candidate (HID wedges are typically much faster). */
export const SCAN_MAX_KEY_INTERVAL_MS = 50;

/**
 * Minimum reconstructed length to treat a fast sequence as a scan.
 * Short unit barcodes in POS tests can be 3 chars (e.g. "222"); longer EAN/UPC are covered.
 * Length-2 bursts (e.g. fast "hi") are rejected.
 */
export const SCAN_MIN_LENGTH = 3;

const DIGIT_CODES: Record<string, string> = {
  Digit0: "0",
  Digit1: "1",
  Digit2: "2",
  Digit3: "3",
  Digit4: "4",
  Digit5: "5",
  Digit6: "6",
  Digit7: "7",
  Digit8: "8",
  Digit9: "9",
  Numpad0: "0",
  Numpad1: "1",
  Numpad2: "2",
  Numpad3: "3",
  Numpad4: "4",
  Numpad5: "5",
  Numpad6: "6",
  Numpad7: "7",
  Numpad8: "8",
  Numpad9: "9",
};

const LETTER_CODES: Record<string, string> = Object.fromEntries(
  Array.from({ length: 26 }, (_, index) => {
    const letter = String.fromCharCode(65 + index);
    return [`Key${letter}`, letter] as const;
  }),
);

/** Punctuation justified by SKU/barcode patterns (e.g. E6-SKU-A, dotted codes). */
const PUNCT_CODES: Record<string, string> = {
  Minus: "-",
  Equal: "=",
  Slash: "/",
  Period: ".",
};

const CODE_TO_ASCII: Record<string, string> = {
  ...DIGIT_CODES,
  ...LETTER_CODES,
  ...PUNCT_CODES,
};

export function mapScannerKeyCode(code: string): string | null {
  return CODE_TO_ASCII[code] ?? null;
}

export function isScannerEnterCode(code: string): boolean {
  return code === "Enter" || code === "NumpadEnter";
}

export type ScannerSessionFinalize =
  | { ok: true; value: string }
  | { ok: false; reason: "empty" | "too_short" | "stale" };

/**
 * Stateful candidate buffer for one focused POS search field.
 * Does not look up products — ASCII reconstruction only.
 */
export class ScannerKeycodeSession {
  private chars: string[] = [];
  private lastAt = 0;
  private invalidated = false;

  reset() {
    this.chars = [];
    this.lastAt = 0;
    this.invalidated = false;
  }

  /**
   * Record a physical key for the candidate.
   * Unsupported codes invalidate the candidate (do not invent characters).
   * Interval expiry starts a fresh candidate on the new code.
   */
  pushCode(code: string, nowMs: number): void {
    if (isScannerEnterCode(code)) return;

    const mapped = mapScannerKeyCode(code);
    if (mapped == null) {
      this.invalidated = true;
      this.chars = [];
      this.lastAt = 0;
      return;
    }

    if (this.invalidated) {
      this.invalidated = false;
    }

    if (this.chars.length > 0 && nowMs - this.lastAt > SCAN_MAX_KEY_INTERVAL_MS) {
      this.chars = [];
    }

    this.chars.push(mapped);
    this.lastAt = nowMs;
  }

  /**
   * Finalize on Enter/NumpadEnter.
   * Requires consecutive fast codes, min length, and no unsupported-code invalidation mid-stream.
   */
  finalize(nowMs: number): ScannerSessionFinalize {
    if (this.invalidated || this.chars.length === 0) {
      this.reset();
      return { ok: false, reason: "empty" };
    }
    if (this.chars.length < SCAN_MIN_LENGTH) {
      this.reset();
      return { ok: false, reason: "too_short" };
    }
    if (nowMs - this.lastAt > SCAN_MAX_KEY_INTERVAL_MS) {
      this.reset();
      return { ok: false, reason: "stale" };
    }
    const value = this.chars.join("");
    this.reset();
    return { ok: true, value };
  }

  /** Test helper — current candidate text without clearing. */
  peek(): string {
    return this.chars.join("");
  }
}
