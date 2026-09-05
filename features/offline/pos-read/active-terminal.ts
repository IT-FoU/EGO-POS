/**
 * Active terminal pointer (Phase 6.1).
 *
 * Persists ONLY the non-secret tenant/terminal identifiers needed for the public
 * offline shell to reopen the correct device-local replica after an offline
 * reload. No secrets, tokens, passwords, or store data are stored here — just the
 * ids required to namespace the IndexedDB database.
 */

import type { StoreNamespace } from "../types";

export const ACTIVE_TERMINAL_STORAGE_KEY = "egopos.offline.activeTerminal";

export interface ActiveTerminal {
  companyId: string;
  branchId: string;
  terminalId: string;
  warehouseId: string | null;
}

function safeLocalStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export function saveActiveTerminal(terminal: ActiveTerminal): void {
  const storage = safeLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(ACTIVE_TERMINAL_STORAGE_KEY, JSON.stringify(terminal));
  } catch {
    // Ignore quota/private-mode failures.
  }
}

export function readActiveTerminal(): ActiveTerminal | null {
  const storage = safeLocalStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(ACTIVE_TERMINAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveTerminal>;
    if (!parsed.companyId || !parsed.branchId || !parsed.terminalId) return null;
    return {
      companyId: parsed.companyId,
      branchId: parsed.branchId,
      terminalId: parsed.terminalId,
      warehouseId: parsed.warehouseId ?? null,
    };
  } catch {
    return null;
  }
}

export function namespaceFromActiveTerminal(terminal: ActiveTerminal): StoreNamespace {
  return {
    companyId: terminal.companyId,
    branchId: terminal.branchId,
    terminalId: terminal.terminalId,
  };
}
