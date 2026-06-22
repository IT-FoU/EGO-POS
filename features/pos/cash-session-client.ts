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
    throw new Error(payload.error?.message ?? payload.message ?? "Cash session request failed.");
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

async function readJson(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error?.message ?? payload.message ?? "Cash session request failed.");
  }
  return payload.data as CashSessionSummary;
}

export async function openCashSessionRequest(openingCashLak: number, note?: string) {
  const response = await fetch("/api/pos/cash-sessions/open", {
    body: JSON.stringify({ note, openingCashLak }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return mapToPosContext(await readJson(response));
}

export async function closeCashSessionRequest(sessionId: string, countedCashLak: number, note?: string) {
  const response = await fetch("/api/pos/cash-sessions/close", {
    body: JSON.stringify({ countedCashLak, note, sessionId }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return mapToPosContext(await readJson(response));
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
