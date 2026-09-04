/**
 * Connectivity detection (tasks Phase 2).
 *
 * `navigator.onLine` alone is unreliable (it only reflects a network interface,
 * not real reachability), so this store combines the browser online/offline
 * events with an optional health signal that the sync engine can update after a
 * real request succeeds/fails (later phase). Exposed as a `useSyncExternalStore`
 * source for React 19.
 */

export type ConnectivityState = "online" | "offline";

export interface ConnectivitySnapshot {
  state: ConnectivityState;
  /** navigator.onLine at last check. */
  navigatorOnline: boolean;
  /** Last time the sync engine confirmed a successful round-trip (ISO), if any. */
  lastHealthyAt: string | null;
  updatedAt: string;
}

type Listener = () => void;

function readNavigatorOnline(): boolean {
  try {
    if (typeof navigator === "undefined") return true;
    return navigator.onLine !== false;
  } catch {
    return true;
  }
}

class ConnectivityStore {
  private listeners = new Set<Listener>();
  private snapshot: ConnectivitySnapshot;
  private started = false;

  constructor() {
    const online = readNavigatorOnline();
    this.snapshot = {
      state: online ? "online" : "offline",
      navigatorOnline: online,
      lastHealthyAt: null,
      updatedAt: new Date().toISOString(),
    };
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private setSnapshot(next: Partial<ConnectivitySnapshot>): void {
    const merged: ConnectivitySnapshot = {
      ...this.snapshot,
      ...next,
      updatedAt: new Date().toISOString(),
    };
    // Avoid emitting when nothing meaningful changed (stable snapshot identity).
    if (
      merged.state === this.snapshot.state &&
      merged.navigatorOnline === this.snapshot.navigatorOnline &&
      merged.lastHealthyAt === this.snapshot.lastHealthyAt
    ) {
      return;
    }
    this.snapshot = merged;
    this.emit();
  }

  private handleOnline = (): void => {
    this.setSnapshot({ state: "online", navigatorOnline: true });
  };

  private handleOffline = (): void => {
    this.setSnapshot({ state: "offline", navigatorOnline: false });
  };

  private ensureStarted(): void {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    window.addEventListener("online", this.handleOnline);
    window.addEventListener("offline", this.handleOffline);
    // Re-read on focus in case events were missed while backgrounded.
    window.addEventListener("focus", this.handleFocus);
  }

  private handleFocus = (): void => {
    const online = readNavigatorOnline();
    this.setSnapshot({ state: online ? "online" : "offline", navigatorOnline: online });
  };

  subscribe = (listener: Listener): (() => void) => {
    this.ensureStarted();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): ConnectivitySnapshot => this.snapshot;

  getServerSnapshot = (): ConnectivitySnapshot => ({
    state: "online",
    navigatorOnline: true,
    lastHealthyAt: null,
    updatedAt: "1970-01-01T00:00:00.000Z",
  });

  /** Sync engine hook: report a confirmed healthy/unhealthy round-trip. */
  reportHealth(healthy: boolean): void {
    if (healthy) {
      this.setSnapshot({ state: "online", navigatorOnline: true, lastHealthyAt: new Date().toISOString() });
    } else if (readNavigatorOnline() === false) {
      this.setSnapshot({ state: "offline", navigatorOnline: false });
    }
  }
}

let store: ConnectivityStore | null = null;

export function getConnectivityStore(): ConnectivityStore {
  if (!store) store = new ConnectivityStore();
  return store;
}
