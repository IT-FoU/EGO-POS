/**
 * Cash Shift Count UI state — derived from open cash session + open attendance.
 * Does not mutate sessions; recovery reuses End Work / Confirm Closing / Start Work.
 */
export type CashShiftUiState = "not_started" | "open" | "needs_closing" | "recovery_required";

export type CashShiftUiInput = {
  attendanceCashSessionId: string | null;
  attendanceOpen: boolean;
  cashSessionId: string | null;
  cashStatus: "closed" | "not_started" | "open";
};

export function deriveCashShiftUiState(input: CashShiftUiInput): CashShiftUiState {
  const cashOpen = input.cashStatus === "open" && Boolean(input.cashSessionId);
  const attOpen = Boolean(input.attendanceOpen);

  if (cashOpen && attOpen) {
    if (
      input.attendanceCashSessionId &&
      input.cashSessionId &&
      input.attendanceCashSessionId !== input.cashSessionId
    ) {
      return "recovery_required";
    }
    return "open";
  }

  // Cash closed/missing but attendance still open (stale after close or orphan).
  if (!cashOpen && attOpen) {
    return "recovery_required";
  }

  // Cash still open after End Work — Owner must Confirm Closing Summary.
  if (cashOpen && !attOpen) {
    return "needs_closing";
  }

  return "not_started";
}

export function canStartWork(state: CashShiftUiState) {
  return state === "not_started";
}

export function startWorkBlockedReasonKey(state: CashShiftUiState): string | null {
  if (state === "recovery_required") return "ui.shift.recovery.end.work.first";
  if (state === "needs_closing" || state === "open") return "ui.shift.start.unavailable.session.open";
  return null;
}
