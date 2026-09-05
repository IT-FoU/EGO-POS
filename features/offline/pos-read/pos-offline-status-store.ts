/**
 * Shared POS offline status store (Phase 6).
 *
 * A tiny `useSyncExternalStore`-compatible singleton the POS sync component
 * publishes to and the status indicator reads, so the header can show the
 * current POS offline state without prop drilling.
 */

import type { PosOfflineState } from "./pos-offline-gate";

export interface PosOfflineStatus {
  active: boolean; // true when the offline feature is engaged on this device
  state: PosOfflineState;
  source: "online" | "offline" | "blocked";
  syncing: boolean;
  lastSyncAt: string | null;
  reason: string | null;
}

const INITIAL: PosOfflineStatus = {
  active: false,
  state: "online",
  source: "online",
  syncing: false,
  lastSyncAt: null,
  reason: null,
};

type Listener = () => void;

class PosOfflineStatusStore {
  private snapshot: PosOfflineStatus = INITIAL;
  private listeners = new Set<Listener>();
  /** Set by the sync component so the Sync Center can trigger a manual sync. */
  private manualSync: (() => void) | null = null;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): PosOfflineStatus => this.snapshot;

  getServerSnapshot = (): PosOfflineStatus => INITIAL;

  set(patch: Partial<PosOfflineStatus>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  reset(): void {
    this.set(INITIAL);
  }

  registerManualSync(fn: (() => void) | null): void {
    this.manualSync = fn;
  }

  triggerManualSync(): void {
    this.manualSync?.();
  }
}

let store: PosOfflineStatusStore | null = null;

export function getPosOfflineStatusStore(): PosOfflineStatusStore {
  if (!store) store = new PosOfflineStatusStore();
  return store;
}
