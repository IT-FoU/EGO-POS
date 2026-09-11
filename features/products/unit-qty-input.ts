import { parseIntegerQty, parsePositiveIntQty } from "@/features/products/unit-hierarchy";

export type QtyInputState = {
  committed: number | null;
  draft: string | undefined;
  error: boolean;
};

export function qtyInputFromCommitted(committed: number | null): QtyInputState {
  return {
    committed,
    draft: undefined,
    error: false,
  };
}

export function qtyInputDisplay(state: QtyInputState) {
  return state.draft !== undefined ? state.draft : (state.committed === null ? "" : String(state.committed));
}

export function onQtyInputFocus(state: QtyInputState): QtyInputState {
  return {
    ...state,
    draft: state.draft !== undefined ? state.draft : (state.committed === null ? "" : String(state.committed)),
  };
}

export function onQtyInputChange(state: QtyInputState, raw: string): QtyInputState {
  if (raw.trim() === "") {
    return { committed: null, draft: raw, error: true };
  }
  const parsed = parseIntegerQty(raw);
  if (parsed === null) {
    return { committed: null, draft: raw, error: true };
  }
  return {
    committed: parsed,
    draft: raw,
    error: parsePositiveIntQty(raw) === null,
  };
}

export function onQtyInputBlur(state: QtyInputState): QtyInputState {
  if (state.draft === undefined) {
    return { ...state, error: parsePositiveIntQty(state.committed) === null };
  }
  return {
    committed: state.committed,
    draft: state.draft,
    error: parsePositiveIntQty(state.draft) === null,
  };
}

export function simulateQtyReplace(committed: number, nextRaw: string) {
  const focused = onQtyInputFocus(qtyInputFromCommitted(committed));
  const typed = onQtyInputChange(focused, nextRaw);
  const blurred = onQtyInputBlur(typed);
  return {
    duringEdit: qtyInputDisplay(typed),
    committed: blurred.committed,
    display: qtyInputDisplay(blurred),
    error: blurred.error,
  };
}

export function simulateQtyClearThenType(committed: number, nextRaw: string) {
  const focused = onQtyInputFocus(qtyInputFromCommitted(committed));
  const cleared = onQtyInputChange(focused, "");
  const typed = onQtyInputChange(cleared, nextRaw);
  const blurred = onQtyInputBlur(typed);
  return {
    blank: qtyInputDisplay(cleared),
    duringEdit: qtyInputDisplay(typed),
    committed: blurred.committed,
    display: qtyInputDisplay(blurred),
    error: blurred.error,
  };
}
