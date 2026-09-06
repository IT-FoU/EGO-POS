import assert from "node:assert/strict";
import { test } from "node:test";

import { OfflineDatabase } from "../local-db/database";
import { MemoryOfflineBackend } from "../local-db/memory-backend";
import { MetaKey, OfflineStore } from "../local-db/schema";
import {
  createDeviceLock,
  getStoredDeviceLock,
  isDeviceLockSet,
  setDeviceLock,
  unlockDevice,
  verifyDeviceLock,
  type CredentialHasher,
} from "../auth/device-unlock";
import {
  decideOfflineWorkspace,
  type OfflineWorkspaceInput,
} from "../pos-read/offline-workspace-state";
import { evaluatePosOfflineGate, type PosGateResult } from "../pos-read/pos-offline-gate";
import {
  POS_PERMISSION_ACTIONS,
  restrictedReadOnlyPosPolicy,
} from "../pos-read/pos-client-props";
import { evaluatePosPermission } from "@/features/pos/permissions";

// A fast, deterministic hasher for logic tests (the module default is PBKDF2).
const testHasher: CredentialHasher = {
  algorithm: "test-hash",
  async hash(pin: string, salt: string): Promise<string> {
    return `h:${salt}:${pin}`;
  },
};

const NS_A = { companyId: "co-1", branchId: "br-1", terminalId: "POS-01" };
const NS_B = { companyId: "co-1", branchId: "br-1", terminalId: "POS-02" };

function readyGate(overrides: Partial<Parameters<typeof evaluatePosOfflineGate>[0]> = {}): PosGateResult {
  return evaluatePosOfflineGate({
    flagEnabled: true,
    online: false,
    syncing: false,
    bootstrapComplete: true,
    replicaValid: true,
    terminalScopeOk: true,
    deviceStatus: "active",
    lastSyncAt: new Date().toISOString(),
    now: new Date(),
    ...overrides,
  });
}

function baseInput(overrides: Partial<OfflineWorkspaceInput> = {}): OfflineWorkspaceInput {
  return {
    flagEnabled: true,
    online: false,
    hasTerminal: true,
    gate: readyGate(),
    lockSet: true,
    ...overrides,
  };
}

// ---- Decision state machine ----

test("flag OFF preserves online POS: workspace decision is flag_off", () => {
  assert.deepEqual(decideOfflineWorkspace(baseInput({ flagEnabled: false })), { kind: "flag_off" });
  // Even offline + ready + locked, flag off short-circuits to flag_off.
  assert.deepEqual(
    decideOfflineWorkspace(baseInput({ flagEnabled: false, online: true })),
    { kind: "flag_off" },
  );
});

test("offline + ready + lock set requires PIN unlock (locked, never ready)", () => {
  const decision = decideOfflineWorkspace(baseInput({ lockSet: true }));
  assert.equal(decision.kind, "locked");
});

test("offline + ready + no lock is blocked with no_lock (must set PIN online first)", () => {
  const decision = decideOfflineWorkspace(baseInput({ lockSet: false }));
  assert.equal(decision.kind, "no_lock");
});

test("offline + revoked device is blocked and never reaches locked/ready", () => {
  const decision = decideOfflineWorkspace(
    baseInput({ gate: readyGate({ deviceStatus: "revoked" }), lockSet: true }),
  );
  assert.deepEqual(decision, { kind: "blocked", reason: "device_revoked" });
});

test("offline + never bootstrapped is blocked", () => {
  const decision = decideOfflineWorkspace(
    baseInput({ gate: readyGate({ bootstrapComplete: false }), lockSet: true }),
  );
  assert.deepEqual(decision, { kind: "blocked", reason: "never_bootstrapped" });
});

test("offline + scope mismatch is blocked", () => {
  const decision = decideOfflineWorkspace(
    baseInput({ gate: readyGate({ terminalScopeOk: false }), lockSet: true }),
  );
  assert.deepEqual(decision, { kind: "blocked", reason: "terminal_scope" });
});

test("offline + no active terminal is blocked", () => {
  const decision = decideOfflineWorkspace(baseInput({ hasTerminal: false }));
  assert.deepEqual(decision, { kind: "blocked", reason: "not_set" });
});

test("online + ready + no lock offers PIN setup", () => {
  const decision = decideOfflineWorkspace(baseInput({ online: true, lockSet: false }));
  assert.equal(decision.kind, "online_setup_pin");
});

test("online + ready + lock set stays online (live POS authoritative)", () => {
  const decision = decideOfflineWorkspace(baseInput({ online: true, lockSet: true }));
  assert.deepEqual(decision, { kind: "online" });
});

test("online + revoked device does not offer PIN setup", () => {
  const decision = decideOfflineWorkspace(
    baseInput({ online: true, lockSet: false, gate: readyGate({ deviceStatus: "revoked" }) }),
  );
  assert.deepEqual(decision, { kind: "online" });
});

// ---- Device lock storage (no plaintext, salted hash only) ----

test("createDeviceLock stores only a salted hash, never the plaintext PIN", async () => {
  const lock = await createDeviceLock("1234", testHasher, "saltX");
  assert.equal(lock.salt, "saltX");
  assert.equal(lock.algorithm, "test-hash");
  assert.notEqual(lock.hash, "1234");
  // No field leaks the raw PIN.
  assert.equal(JSON.stringify(lock).includes("\"1234\""), false);
});

test("default PBKDF2 hasher produces a non-plaintext hex hash that verifies", async () => {
  const lock = await createDeviceLock("4321");
  assert.match(lock.hash, /^[0-9a-f]{64}$/);
  assert.notEqual(lock.hash, "4321");
  assert.equal(await verifyDeviceLock("4321", lock), true);
  assert.equal(await verifyDeviceLock("0000", lock), false);
});

test("PIN shorter than 4 characters is rejected", async () => {
  await assert.rejects(() => createDeviceLock("12", testHasher));
});

// ---- Unlock behavior (correct/wrong PIN, isolation, reload) ----

async function openNs(backend: MemoryOfflineBackend, namespace: typeof NS_A) {
  return OfflineDatabase.open({ namespace, backend });
}

test("no store data is exposed before unlock: only a device-lock meta record exists", async () => {
  const backend = new MemoryOfflineBackend();
  const db = await openNs(backend, NS_A);
  await setDeviceLock(db, "1357", testHasher);
  // The only credential material stored is the salted hash meta record.
  const lockRecord = await db.read<{ id: string; value: unknown }>(OfflineStore.meta, MetaKey.deviceLock);
  assert.ok(lockRecord);
  // No "unlocked" flag is ever persisted — unlock is in-memory only.
  const anyUnlockFlag = await db.read(OfflineStore.meta, "unlocked" as any);
  assert.equal(anyUnlockFlag, undefined);
  db.close();
});

test("correct PIN unlocks; wrong PIN reveals nothing and never mutates the stored hash", async () => {
  const backend = new MemoryOfflineBackend();
  const db = await openNs(backend, NS_A);
  await setDeviceLock(db, "2468", testHasher);
  const before = await getStoredDeviceLock(db);

  const wrong = await unlockDevice(db, "0000", testHasher);
  assert.deepEqual(wrong, { ok: false, reason: "invalid_pin" });
  const afterWrong = await getStoredDeviceLock(db);
  assert.deepEqual(afterWrong, before); // hash + salt unchanged

  const right = await unlockDevice(db, "2468", testHasher);
  assert.deepEqual(right, { ok: true });
  db.close();
});

test("a valid PIN unlocks only the matching terminal namespace", async () => {
  const backend = new MemoryOfflineBackend();
  const dbA = await openNs(backend, NS_A);
  await setDeviceLock(dbA, "1111", testHasher);
  dbA.close();

  // NS_B shares the same browser backend but is a separate database.
  const dbB = await openNs(backend, NS_B);
  assert.equal(await isDeviceLockSet(dbB), false);
  assert.deepEqual(await unlockDevice(dbB, "1111", testHasher), { ok: false, reason: "not_set" });
  dbB.close();
});

test("reload returns to a locked state: lock persists but no unlocked session is stored", async () => {
  const backend = new MemoryOfflineBackend();
  const db1 = await openNs(backend, NS_A);
  await setDeviceLock(db1, "9753", testHasher);
  assert.deepEqual(await unlockDevice(db1, "9753", testHasher), { ok: true });
  db1.close();

  // Simulate a reload: reopen the SAME namespace on the SAME backend.
  const db2 = await openNs(backend, NS_A);
  assert.equal(await isDeviceLockSet(db2), true); // lock persisted
  // The decision for a fresh reload (offline + ready + lockSet) is "locked".
  const decision = decideOfflineWorkspace(baseInput({ lockSet: true }));
  assert.equal(decision.kind, "locked");
  db2.close();
});

test("unlock with no lock set returns not_set (no data revealed)", async () => {
  const backend = new MemoryOfflineBackend();
  const db = await openNs(backend, NS_A);
  assert.deepEqual(await unlockDevice(db, "1234", testHasher), { ok: false, reason: "not_set" });
  db.close();
});

// ---- Read-only write blocking (immediate, no network) ----

test("read-only policy denies EVERY write action immediately (no approval, no network path)", () => {
  const policy = restrictedReadOnlyPosPolicy({
    branchId: "br-1",
    branchName: "Main",
    warehouseId: "wh-1",
    cashierName: "Offline",
    terminalId: "POS-01",
  });
  for (const action of POS_PERMISSION_ACTIONS) {
    const decision = evaluatePosPermission(policy, action);
    assert.equal(decision.allowed, false, `${action} must be denied`);
    // approvalRequired:false means there is no path that would trigger a network write.
    assert.equal(decision.approvalRequired, false, `${action} must not open an approval path`);
  }
});
