/**
 * Device identity (foundation for tasks Phase 3).
 *
 * Phase 1 provides only the local, non-secret persistent `deviceId` and the
 * terminal identity shape. Cloud registration/activation/revocation is Phase 3
 * and is intentionally NOT implemented here. No secret, token, password, or
 * credential is stored.
 */

import { newOperationId } from "./operations/envelope";
import type { StoreNamespace } from "./types";

/** localStorage key for the persistent, non-secret device id. */
export const DEVICE_ID_STORAGE_KEY = "egopos.offline.deviceId";

export interface DeviceIdentity {
  deviceId: string;
  terminalId: string;
  companyId: string;
  branchId: string;
}

/** Create a fresh non-secret device id (UUID). */
export function createDeviceId(): string {
  return newOperationId();
}

function safeLocalStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    // Private mode / disabled storage.
    return null;
  }
}

/**
 * Get the persistent device id, creating and storing one on first use.
 * Returns a fresh (non-persisted) id if storage is unavailable, so callers
 * still function; persistence limitations are surfaced by `deviceIdIsPersistent`.
 */
export function getOrCreateDeviceId(): string {
  const storage = safeLocalStorage();
  if (!storage) {
    return createDeviceId();
  }
  const existing = storage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existing && existing.length > 0) {
    return existing;
  }
  const created = createDeviceId();
  try {
    storage.setItem(DEVICE_ID_STORAGE_KEY, created);
  } catch {
    // Ignore write failure; id is still usable for this session.
  }
  return created;
}

export function deviceIdIsPersistent(): boolean {
  return safeLocalStorage() !== null;
}

/** Build the offline store namespace from tenant + terminal identity. */
export function namespaceFromIdentity(identity: DeviceIdentity): StoreNamespace {
  return {
    companyId: identity.companyId,
    branchId: identity.branchId,
    terminalId: identity.terminalId,
  };
}
