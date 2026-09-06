/**
 * Local cash-session precondition (Phase 6A).
 *
 * A local sale may only be accepted when a locally-open, compatible cash session
 * exists for this company/branch/terminal. Mirrors the existing online rule:
 * no sale without an open shift.
 */

import { OfflineDatabase } from "../local-db/database";
import { OfflineStore } from "../local-db/schema";
import type { OfflineBackendTransaction } from "../local-db/backend";

export interface LocalCashSessionRecord {
  id: string;
  companyId: string;
  branchId: string;
  terminalId: string;
  status: "open" | "closed";
  openedAt: string | null;
  openingFloatLak: number;
  /** Originating cash.session.open operationId, if the session was opened offline. */
  operationId?: string | null;
}

export interface CashSessionScope {
  companyId: string;
  branchId: string;
  terminalId: string;
}

export class NoOpenCashSessionError extends Error {
  constructor(message = "No open compatible cash session for this terminal") {
    super(message);
    this.name = "NoOpenCashSessionError";
  }
}

/** Pure: is this session open and compatible with the terminal scope? */
export function isCompatibleOpenSession(
  session: LocalCashSessionRecord | null | undefined,
  scope: CashSessionScope,
): session is LocalCashSessionRecord {
  return (
    !!session &&
    session.status === "open" &&
    session.companyId === scope.companyId &&
    session.branchId === scope.branchId &&
    session.terminalId === scope.terminalId
  );
}

export async function saveLocalCashSession(
  db: OfflineDatabase,
  record: LocalCashSessionRecord,
): Promise<void> {
  await db.transaction([OfflineStore.cashSessions], "readwrite", async (tx) => {
    await tx.put(OfflineStore.cashSessions, record);
  });
}

export async function txReadCashSession(
  tx: OfflineBackendTransaction,
  sessionId: string,
): Promise<LocalCashSessionRecord | undefined> {
  return tx.get<LocalCashSessionRecord>(OfflineStore.cashSessions, sessionId);
}
