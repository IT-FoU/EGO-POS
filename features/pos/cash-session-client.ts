import type { CashSessionSummary } from "@/features/cash-sessions/types";
import type { PosCashSessionContext } from "@/features/pos/types";

type CurrentCashSessionPayload = {
  attendanceCashSessionId: string | null;
  attendanceOpen: boolean;
  requireCashShiftBeforeSale: boolean;
  session: CashSessionSummary | null;
};

function emptyPosContext(
  extras?: Partial<Pick<PosCashSessionContext, "attendanceCashSessionId" | "attendanceOpen" | "requireCashShiftBeforeSale" | "status">>,
): PosCashSessionContext {
  return {
    attendanceCashSessionId: extras?.attendanceCashSessionId ?? null,
    attendanceOpen: extras?.attendanceOpen ?? false,
    cashInLak: 0,
    cashOutLak: 0,
    cashSalesLak: 0,
    expectedCashLak: 0,
    nonCashSalesLak: 0,
    openedAt: null,
    openingCashLak: 0,
    requireCashShiftBeforeSale: extras?.requireCashShiftBeforeSale !== false,
    sessionId: null,
    status: extras?.status ?? "not_started",
  };
}

function mapToPosContext(
  session: CashSessionSummary,
  extras: {
    attendanceCashSessionId: string | null;
    attendanceOpen: boolean;
    requireCashShiftBeforeSale: boolean;
  },
): PosCashSessionContext {
  return {
    attendanceCashSessionId: extras.attendanceCashSessionId,
    attendanceOpen: extras.attendanceOpen,
    cashInLak: session.cashInLak,
    cashOutLak: session.cashOutLak,
    cashSalesLak: session.cashSalesLak,
    expectedCashLak: session.expectedCashLak,
    nonCashSalesLak: session.nonCashSalesLak,
    openedAt: session.openedAt,
    openingCashLak: session.openingCashLak,
    requireCashShiftBeforeSale: extras.requireCashShiftBeforeSale,
    sessionId: session.status === "closed" ? null : session.id,
    status: session.status === "closed" ? "closed" : "open",
  };
}

function preserveShiftFlags(prev: PosCashSessionContext | undefined, next: PosCashSessionContext): PosCashSessionContext {
  if (!prev) return next;
  return {
    ...next,
    attendanceCashSessionId: next.attendanceCashSessionId ?? prev.attendanceCashSessionId,
    attendanceOpen: next.attendanceOpen,
    requireCashShiftBeforeSale: next.requireCashShiftBeforeSale,
  };
}

export async function fetchCurrentCashSession(): Promise<PosCashSessionContext> {
  const response = await fetch("/api/pos/cash-sessions/current");
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(cashSessionRequestError(payload));
  }
  const data = payload.data as CurrentCashSessionPayload | CashSessionSummary | null;
  // Backward-compatible: older payloads were the session object directly.
  if (data && "session" in (data as CurrentCashSessionPayload)) {
    const wrapped = data as CurrentCashSessionPayload;
    const extras = {
      attendanceCashSessionId: wrapped.attendanceCashSessionId,
      attendanceOpen: wrapped.attendanceOpen,
      requireCashShiftBeforeSale: wrapped.requireCashShiftBeforeSale !== false,
    };
    if (!wrapped.session) {
      return emptyPosContext({ ...extras, status: "not_started" });
    }
    return mapToPosContext(wrapped.session, extras);
  }
  if (!data) {
    return emptyPosContext();
  }
  return mapToPosContext(data as CashSessionSummary, {
    attendanceCashSessionId: null,
    attendanceOpen: false,
    requireCashShiftBeforeSale: true,
  });
}

function cashSessionRequestError(payload: Record<string, any>) {
  if (typeof payload.error === "string" && payload.error.trim()) {
    return payload.error;
  }
  if (typeof payload.error?.message === "string" && payload.error.message.trim()) {
    return payload.error.message;
  }
  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message;
  }
  return "Cash session request failed.";
}

async function readJson(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(cashSessionRequestError(payload));
  }
  return payload.data as CashSessionSummary;
}

export async function openCashSessionRequest(
  openingCashLak: number,
  options?: { countBreakdown?: { opening: Record<string, number> }; note?: string },
) {
  const response = await fetch("/api/pos/cash-sessions/open", {
    body: JSON.stringify({
      countBreakdown: options?.countBreakdown,
      note: options?.note,
      openingCashLak,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const summary = await readJson(response);
  return mapToPosContext(summary, {
    attendanceCashSessionId: summary.id,
    attendanceOpen: true,
    requireCashShiftBeforeSale: true,
  });
}

export type CloseCashSessionResult = PosCashSessionContext & {
  countBreakdown: CashSessionSummary["countBreakdown"];
  countedCashLak: number;
  varianceLak: number;
};

export async function closeCashSessionRequest(
  sessionId: string,
  countedCashLak: number,
  options?: { countBreakdown?: { closing: Record<string, number> }; note?: string },
): Promise<CloseCashSessionResult> {
  const response = await fetch("/api/pos/cash-sessions/close", {
    body: JSON.stringify({
      countBreakdown: options?.countBreakdown,
      countedCashLak,
      note: options?.note,
      sessionId,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const summary = await readJson(response);
  return {
    ...mapToPosContext(summary, {
      attendanceCashSessionId: null,
      attendanceOpen: false,
      requireCashShiftBeforeSale: true,
    }),
    countBreakdown: summary.countBreakdown ?? null,
    countedCashLak: Number(summary.countedCashLak ?? countedCashLak),
    expectedCashLak: Number(summary.expectedCashLak ?? 0),
    varianceLak: Number(summary.varianceLak ?? 0),
  };
}

export async function cashInRequest(sessionId: string, amountLak: number, reason?: string) {
  const response = await fetch("/api/pos/cash-sessions/cash-in", {
    body: JSON.stringify({ amountLak, reason, sessionId }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const summary = await readJson(response);
  return mapToPosContext(summary, {
    attendanceCashSessionId: null,
    attendanceOpen: true,
    requireCashShiftBeforeSale: true,
  });
}

export async function cashOutRequest(sessionId: string, amountLak: number, reason: string) {
  const response = await fetch("/api/pos/cash-sessions/cash-out", {
    body: JSON.stringify({ amountLak, reason, sessionId }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const summary = await readJson(response);
  return mapToPosContext(summary, {
    attendanceCashSessionId: null,
    attendanceOpen: true,
    requireCashShiftBeforeSale: true,
  });
}

/** R9A End Work — closes attendance only; does not close cash session. */
export async function endAttendanceWorkRequest(note?: string) {
  const response = await fetch("/api/pos/attendance/end-work", {
    body: JSON.stringify({ note }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(cashSessionRequestError(payload));
  }
  return payload.data as {
    endedAt: string;
    id: string;
    regularMinutes: number | null;
    status: string;
  };
}

export { preserveShiftFlags };
