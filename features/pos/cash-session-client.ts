import type { CashSessionSummary } from "@/features/cash-sessions/types";
import type { PosCashSessionContext } from "@/features/pos/types";

function mapToPosContext(session: CashSessionSummary): PosCashSessionContext {
  return {
    cashInLak: session.cashInLak,
    cashOutLak: session.cashOutLak,
    cashSalesLak: session.cashSalesLak,
    expectedCashLak: session.expectedCashLak,
    nonCashSalesLak: session.nonCashSalesLak,
    openedAt: session.openedAt,
    openingCashLak: session.openingCashLak,
    sessionId: session.status === "closed" ? null : session.id,
    status: session.status === "closed" ? "closed" : "open",
  };
}

export async function fetchCurrentCashSession(): Promise<PosCashSessionContext> {
  const response = await fetch("/api/pos/cash-sessions/current");
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(cashSessionRequestError(payload));
  }
  if (!payload.data) {
    return {
      cashInLak: 0,
      cashOutLak: 0,
      cashSalesLak: 0,
      expectedCashLak: 0,
      nonCashSalesLak: 0,
      openedAt: null,
      openingCashLak: 0,
      sessionId: null,
      status: "not_started",
    };
  }
  return mapToPosContext(payload.data as CashSessionSummary);
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
  return mapToPosContext(await readJson(response));
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
    ...mapToPosContext(summary),
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
  return mapToPosContext(await readJson(response));
}

export async function cashOutRequest(sessionId: string, amountLak: number, reason: string) {
  const response = await fetch("/api/pos/cash-sessions/cash-out", {
    body: JSON.stringify({ amountLak, reason, sessionId }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return mapToPosContext(await readJson(response));
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
