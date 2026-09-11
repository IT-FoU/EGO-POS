import { parsePositiveIntQty } from "@/features/products/unit-hierarchy";

export type QtyInputState = {
  committed: number;
  draft: string | undefined;
  error: boolean;
};

export function qtyInputFromCommitted(committed: number): QtyInputState {
  return {
    committed,
    draft: undefined,
    error: false,
  };
}

export function qtyInputDisplay(state: QtyInputState) {
  return state.draft !== undefined ? state.draft : String(state.committed);
}

export function onQtyInputFocus(state: QtyInputState): QtyInputState {
  return {
    ...state,
    draft: state.draft !== undefined ? state.draft : String(state.committed),
  };
}

export function onQtyInputChange(state: QtyInputState, raw: string): QtyInputState {
  return {
    committed: state.committed,
    draft: raw,
    error: parsePositiveIntQty(raw) === null,
  };
}

export function onQtyInputBlur(state: QtyInputState): QtyInputState {
  if (state.draft === undefined) {
    return { ...state, error: false };
  }
  const parsed = parsePositiveIntQty(state.draft);
  if (parsed === null) {
    return {
      committed: state.committed,
      draft: undefined,
      error: true,
    };
  }
  return {
    committed: parsed,
    draft: undefined,
    error: false,
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
