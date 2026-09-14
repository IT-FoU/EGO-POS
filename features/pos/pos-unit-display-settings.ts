/** POS unit display preference — localStorage only (no DB migration). */

export const POS_UNIT_DISPLAY_MODE_KEY = "ego.pos.unitDisplayMode";

export type PosUnitDisplayMode = "separate" | "combined";

export const DEFAULT_POS_UNIT_DISPLAY_MODE: PosUnitDisplayMode = "separate";

export function parsePosUnitDisplayMode(value: unknown): PosUnitDisplayMode {
  return value === "combined" ? "combined" : "separate";
}

export function readPosUnitDisplayMode(): PosUnitDisplayMode {
  if (typeof window === "undefined") {
    return DEFAULT_POS_UNIT_DISPLAY_MODE;
  }
  try {
    return parsePosUnitDisplayMode(window.localStorage.getItem(POS_UNIT_DISPLAY_MODE_KEY));
  } catch {
    return DEFAULT_POS_UNIT_DISPLAY_MODE;
  }
}

export function writePosUnitDisplayMode(mode: PosUnitDisplayMode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(POS_UNIT_DISPLAY_MODE_KEY, mode);
  } catch {
    // ignore quota / private mode
  }
}
