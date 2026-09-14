/** Draft-string helpers for LAK money fields. Do not reformat every keystroke. */

export type MoneyInputState = {
  committed: number;
  draft: string | undefined;
};

export function parseMoneyDigits(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const digits = String(value ?? "").replace(/[^\d.]/g, "");
  if (!digits) return 0;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatMoneyDigits(value: unknown) {
  return parseMoneyDigits(value).toLocaleString("en-US");
}

export function moneyInputFromCommitted(committed: number): MoneyInputState {
  return { committed: parseMoneyDigits(committed), draft: undefined };
}

export function moneyInputDisplay(state: MoneyInputState) {
  return state.draft !== undefined ? state.draft : formatMoneyDigits(state.committed);
}

export function onMoneyInputFocus(state: MoneyInputState): MoneyInputState {
  const seed = state.committed === 0 ? "" : String(Math.trunc(state.committed));
  return {
    committed: state.committed,
    draft: state.draft !== undefined ? state.draft : seed,
  };
}

export function onMoneyInputChange(state: MoneyInputState, raw: string): MoneyInputState {
  const draft = raw.replace(/[^\d]/g, "");
  if (draft === "") {
    return { committed: 0, draft: "" };
  }
  return {
    committed: parseMoneyDigits(draft),
    draft,
  };
}

export function onMoneyInputBlur(state: MoneyInputState): MoneyInputState {
  return {
    committed: parseMoneyDigits(state.draft !== undefined ? state.draft : state.committed),
    draft: undefined,
  };
}

export function simulateMoneyClearThenType(committed: number, nextRaw: string) {
  const focused = onMoneyInputFocus(moneyInputFromCommitted(committed));
  const cleared = onMoneyInputChange(focused, "");
  const typed = onMoneyInputChange(cleared, nextRaw);
  const blurred = onMoneyInputBlur(typed);
  return {
    blank: moneyInputDisplay(cleared),
    duringEdit: moneyInputDisplay(typed),
    committed: blurred.committed,
    display: moneyInputDisplay(blurred),
  };
}

export function simulateMoneyReplace(committed: number, nextRaw: string) {
  const focused = onMoneyInputFocus(moneyInputFromCommitted(committed));
  const typed = onMoneyInputChange(focused, nextRaw);
  const blurred = onMoneyInputBlur(typed);
  return {
    duringEdit: moneyInputDisplay(typed),
    committed: blurred.committed,
    display: moneyInputDisplay(blurred),
  };
}
