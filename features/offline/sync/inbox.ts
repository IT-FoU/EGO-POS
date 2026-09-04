/**
 * Inbox — applied server changes (foundation for tasks Phase 4/5).
 *
 * Phase 1 defines the types and a safe recorder only. The actual delta-pull and
 * transactional apply-to-local logic is implemented in Phase 4/5. Nothing here
 * mutates domain data yet.
 */

import type { OfflineBackendTransaction } from "../local-db/backend";
import { OfflineStore } from "../local-db/schema";

export interface InboxRecord {
  /** Server change id / cursor token (primary key). */
  id: string;
  store: string;
  entityId: string;
  serverVersion: number | null;
  receivedAt: string;
  applied: boolean;
  payload: unknown;
}

/** Record a received server change (not yet applied). Phase 4/5 applies it. */
export async function recordInboxChange(
  tx: OfflineBackendTransaction,
  record: InboxRecord,
): Promise<void> {
  await tx.put(OfflineStore.inbox, record);
}

export async function listInbox(
  tx: OfflineBackendTransaction,
): Promise<InboxRecord[]> {
  return tx.getAll<InboxRecord>(OfflineStore.inbox);
}
