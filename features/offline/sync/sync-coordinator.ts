/**
 * Sync coordinator interface + no-op (foundation for tasks Phase 4/11).
 *
 * Phase 1 defines the contract and a safe no-op implementation so UI (Phase 2
 * Sync Center) can depend on a stable interface. The real coordinator (single
 * run per terminal, topological push, pull-after-push, backoff, conflict
 * handling) is implemented in Phase 11 against the Phase 4 sync API.
 */

export type SyncTrigger =
  | "app_start"
  | "unlock"
  | "reconnect"
  | "focus"
  | "manual"
  | "interval";

export interface SyncResult {
  ranAt: string;
  trigger: SyncTrigger;
  pushed: number;
  pulled: number;
  ok: boolean;
  /** Machine-readable reason when a run is skipped or fails. */
  reason?: string;
}

export interface SyncCoordinator {
  /** Run a sync cycle. Implementations must ensure only one runs per terminal. */
  sync(trigger: SyncTrigger): Promise<SyncResult>;
  /** Whether a sync is currently in progress. */
  isSyncing(): boolean;
}

/**
 * No-op coordinator used until Phase 4/11. It never claims success and never
 * mutates data; `sync()` reports `ok:false` with reason `not_implemented`.
 */
export class NoopSyncCoordinator implements SyncCoordinator {
  async sync(trigger: SyncTrigger): Promise<SyncResult> {
    return {
      ranAt: new Date().toISOString(),
      trigger,
      pushed: 0,
      pulled: 0,
      ok: false,
      reason: "not_implemented",
    };
  }

  isSyncing(): boolean {
    return false;
  }
}
