/** Draft-string helpers for opening-stock Quantity received (non-negative integers). */

export type OpeningQtyInputState = {
  committed: number;
  draft: string | undefined;
};

export function parseOpeningQty(value: unknown) {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) return null;
    return value;
  }
  const text = String(value ?? "").trim();
  if (text === "" || !/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

export function openingQtyFromCommitted(committed: number): OpeningQtyInputState {
  const parsed = parseOpeningQty(committed);
  return { committed: parsed ?? 0, draft: undefined };
}

export function openingQtyDisplay(state: OpeningQtyInputState) {
  return state.draft !== undefined ? state.draft : String(state.committed);
}

export function onOpeningQtyFocus(state: OpeningQtyInputState): OpeningQtyInputState {
  return {
    committed: state.committed,
    draft: state.draft !== undefined ? state.draft : String(state.committed),
  };
}

export function onOpeningQtyChange(state: OpeningQtyInputState, raw: string): OpeningQtyInputState {
  if (raw.trim() === "") {
    return { committed: 0, draft: "" };
  }
  const digits = raw.replace(/[^\d]/g, "");
  if (digits === "") {
    return { committed: 0, draft: "" };
  }
  const parsed = parseOpeningQty(digits);
  return {
    committed: parsed ?? 0,
    draft: digits,
  };
}

export function onOpeningQtyBlur(state: OpeningQtyInputState): OpeningQtyInputState {
  if (state.draft === undefined) {
    return state;
  }
  if (state.draft.trim() === "") {
    return { committed: 0, draft: undefined };
  }
  const parsed = parseOpeningQty(state.draft);
  return {
    committed: parsed ?? state.committed,
    draft: undefined,
  };
}

export function simulateOpeningQtyClearThenType(committed: number, nextRaw: string) {
  const focused = onOpeningQtyFocus(openingQtyFromCommitted(committed));
  const cleared = onOpeningQtyChange(focused, "");
  const typed = onOpeningQtyChange(cleared, nextRaw);
  const blurred = onOpeningQtyBlur(typed);
  return {
    blank: openingQtyDisplay(cleared),
    duringEdit: openingQtyDisplay(typed),
    committed: blurred.committed,
    display: openingQtyDisplay(blurred),
  };
}

export function simulateOpeningQtyReplace(committed: number, nextRaw: string) {
  const focused = onOpeningQtyFocus(openingQtyFromCommitted(committed));
  const typed = onOpeningQtyChange(focused, nextRaw);
  const blurred = onOpeningQtyBlur(typed);
  return {
    duringEdit: openingQtyDisplay(typed),
    committed: blurred.committed,
    display: openingQtyDisplay(blurred),
  };
}
