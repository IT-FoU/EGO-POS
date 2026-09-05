/**
 * POS sync controller (Phase 6) — controlled client bootstrap/delta.
 *
 * Bootstraps the local replica when needed and pulls/applies deltas. Invoked on
 * startup, reconnect, focus, and explicit Sync Now. Ensures only one run at a
 * time. The fetchers are injected (network client in production, fakes in tests),
 * so it is fully deterministic to test.
 */

import type {
  BootstrapFetcher,
  DeltaFetcher,
  StoreSnapshotRepository,
} from "../replica/store-snapshot-repository";

export type PosSyncTrigger = "startup" | "reconnect" | "focus" | "manual" | "interval";

export interface PosSyncFetchers {
  bootstrap: BootstrapFetcher;
  delta: DeltaFetcher;
}

export interface PosSyncResult {
  ok: boolean;
  trigger: PosSyncTrigger;
  bootstrapped: number;
  pulled: number;
  ranAt: string;
  reason?: string;
}

export class PosSyncController {
  private running = false;

  constructor(
    private readonly replica: StoreSnapshotRepository,
    private readonly fetchers: PosSyncFetchers,
    private readonly limit = 200,
  ) {}

  isSyncing(): boolean {
    return this.running;
  }

  /**
   * Run a sync cycle: bootstrap if not yet complete, then pull deltas. Concurrent
   * calls short-circuit (single run per controller).
   */
  async sync(trigger: PosSyncTrigger): Promise<PosSyncResult> {
    const ranAt = new Date().toISOString();
    if (this.running) {
      return { ok: false, trigger, bootstrapped: 0, pulled: 0, ranAt, reason: "already_syncing" };
    }
    this.running = true;
    try {
      const snapshot = await this.replica.readLocalSnapshot();
      let bootstrapped = 0;
      if (!snapshot.meta.bootstrapComplete) {
        const result = await this.replica.bootstrap(this.fetchers.bootstrap, this.limit);
        bootstrapped = result.stats.applied + result.stats.tombstoned;
      }
      const delta = await this.replica.pullDelta(this.fetchers.delta, this.limit);
      return {
        ok: true,
        trigger,
        bootstrapped,
        pulled: delta.stats.applied + delta.stats.tombstoned,
        ranAt,
      };
    } catch (error) {
      return {
        ok: false,
        trigger,
        bootstrapped: 0,
        pulled: 0,
        ranAt,
        reason: error instanceof Error ? error.message : "sync_failed",
      };
    } finally {
      this.running = false;
    }
  }
}
