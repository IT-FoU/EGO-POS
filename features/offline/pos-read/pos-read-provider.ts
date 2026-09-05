/**
 * Feature-flagged POS read provider (Phase 6).
 *
 * Selects the POS read source from the gate result:
 * - flag OFF or online  → the online (SSR) repository (behavior unchanged);
 * - offline + permitted → the offline replica repository;
 * - offline + blocked   → no repository (offline POS not permitted).
 *
 * Pure selection; the caller supplies the already-constructed repositories.
 */

import type { PosReadRepository } from "./pos-read-repository";
import type { PosGateResult, PosOfflineState } from "./pos-offline-gate";

export interface ResolvePosReadInput {
  gate: PosGateResult;
  /** Online SSR-backed repository, when the page rendered online. */
  online: PosReadRepository | null;
  /** Offline replica-backed repository, when loaded + scope-valid. */
  offline: PosReadRepository | null;
}

export interface ResolvedPosRead {
  repository: PosReadRepository | null;
  source: "online" | "offline" | "blocked";
  state: PosOfflineState;
}

export function resolvePosReadRepository(input: ResolvePosReadInput): ResolvedPosRead {
  const { gate, online, offline } = input;

  switch (gate.state) {
    case "online":
    case "syncing": {
      if (online) return { repository: online, source: "online", state: gate.state };
      if (gate.offlineReadsPermitted && offline) {
        return { repository: offline, source: "offline", state: gate.state };
      }
      return { repository: null, source: "blocked", state: gate.state };
    }
    case "read_only":
    case "stale": {
      if (gate.offlineReadsPermitted && offline) {
        return { repository: offline, source: "offline", state: gate.state };
      }
      if (online) return { repository: online, source: "online", state: "online" };
      return { repository: null, source: "blocked", state: "blocked" };
    }
    case "blocked":
    default: {
      // Offline is blocked. Online still works if the page is connected.
      if (online) return { repository: online, source: "online", state: "online" };
      return { repository: null, source: "blocked", state: "blocked" };
    }
  }
}
