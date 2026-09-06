/**
 * Device-local offline unlock (Phase 3, requirements §5.3).
 *
 * A previously authorized user may unlock an already-initialized device offline
 * using a device-local lock credential (PIN). We store ONLY a salted hash of the
 * PIN — never the plaintext PIN, password, access token, or any cloud credential.
 * Unlock is meaningful only after the device is activated and a security snapshot
 * has been cached; this module provides the credential + storage foundation.
 *
 * The hasher is pluggable so it is deterministic in tests; the default uses Web
 * Crypto PBKDF2-SHA256 (available in browsers, Workers, and Node 22).
 */

import { OfflineDatabase } from "../local-db/database";
import { MetaKey, OfflineStore } from "../local-db/schema";

export interface StoredDeviceLock {
  hash: string;
  salt: string;
  createdAt: string;
  algorithm: string;
}

export interface CredentialHasher {
  algorithm: string;
  hash(pin: string, salt: string): Promise<string>;
}

function toHex(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let out = "";
  for (const byte of view) out += byte.toString(16).padStart(2, "0");
  return out;
}

/** Default PBKDF2-SHA256 hasher (100k iterations). */
export const defaultCredentialHasher: CredentialHasher = {
  algorithm: "PBKDF2-SHA256-100000",
  async hash(pin: string, salt: string): Promise<string> {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) {
      throw new Error("Web Crypto subtle is unavailable; cannot hash device lock");
    }
    const enc = new TextEncoder();
    const keyMaterial = await subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, [
      "deriveBits",
    ]);
    const bits = await subtle.deriveBits(
      { name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" },
      keyMaterial,
      256,
    );
    return toHex(bits);
  },
};

export function generateSalt(): string {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    return toHex(bytes.buffer);
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Constant-time-ish string comparison for hashes. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function createDeviceLock(
  pin: string,
  hasher: CredentialHasher = defaultCredentialHasher,
  salt: string = generateSalt(),
  now: Date = new Date(),
): Promise<StoredDeviceLock> {
  if (!pin || pin.length < 4) {
    throw new Error("Device lock PIN must be at least 4 characters");
  }
  const hash = await hasher.hash(pin, salt);
  return { hash, salt, createdAt: now.toISOString(), algorithm: hasher.algorithm };
}

export async function verifyDeviceLock(
  pin: string,
  stored: StoredDeviceLock,
  hasher: CredentialHasher = defaultCredentialHasher,
): Promise<boolean> {
  const candidate = await hasher.hash(pin, stored.salt);
  return safeEqual(candidate, stored.hash);
}

// ---- Local DB persistence (meta store) ----

export async function setDeviceLock(
  db: OfflineDatabase,
  pin: string,
  hasher: CredentialHasher = defaultCredentialHasher,
): Promise<void> {
  const lock = await createDeviceLock(pin, hasher);
  await db.transaction([OfflineStore.meta], "readwrite", async (tx) => {
    await tx.put(OfflineStore.meta, { id: MetaKey.deviceLock, value: lock });
  });
}

export async function getStoredDeviceLock(db: OfflineDatabase): Promise<StoredDeviceLock | null> {
  const record = await db.read<{ id: string; value: StoredDeviceLock }>(
    OfflineStore.meta,
    MetaKey.deviceLock,
  );
  return record?.value ?? null;
}

export async function isDeviceLockSet(db: OfflineDatabase): Promise<boolean> {
  return (await getStoredDeviceLock(db)) !== null;
}

export type UnlockResult =
  | { ok: true }
  | { ok: false; reason: "not_set" | "invalid_pin" };

export async function unlockDevice(
  db: OfflineDatabase,
  pin: string,
  hasher: CredentialHasher = defaultCredentialHasher,
): Promise<UnlockResult> {
  const stored = await getStoredDeviceLock(db);
  if (!stored) return { ok: false, reason: "not_set" };
  const valid = await verifyDeviceLock(pin, stored, hasher);
  return valid ? { ok: true } : { ok: false, reason: "invalid_pin" };
}
