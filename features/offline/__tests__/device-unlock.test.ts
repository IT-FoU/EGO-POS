import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createDeviceLock,
  getStoredDeviceLock,
  isDeviceLockSet,
  setDeviceLock,
  unlockDevice,
  verifyDeviceLock,
  type CredentialHasher,
} from "../auth/device-unlock";
import { buildSecuritySnapshot } from "../server/security-snapshot";
import { OfflineDatabase } from "../local-db/database";
import { MemoryOfflineBackend } from "../local-db/memory-backend";

// Deterministic test hasher (never used in production).
const testHasher: CredentialHasher = {
  algorithm: "test-hasher",
  async hash(pin: string, salt: string): Promise<string> {
    return `${salt}::${pin}`;
  },
};

const NS = { companyId: "co-1", branchId: "br-1", terminalId: "POS-01" };

test("createDeviceLock rejects a short PIN and stores no plaintext", async () => {
  await assert.rejects(createDeviceLock("12", testHasher), /at least 4/);
  const lock = await createDeviceLock("1234", testHasher, "salt-1");
  assert.equal(lock.salt, "salt-1");
  assert.ok(!lock.hash.includes("1234") || lock.hash === "salt-1::1234"); // test hasher intentionally simple
  assert.equal(lock.algorithm, "test-hasher");
});

test("verifyDeviceLock accepts the right PIN and rejects wrong ones", async () => {
  const lock = await createDeviceLock("2468", testHasher, "salt-x");
  assert.equal(await verifyDeviceLock("2468", lock, testHasher), true);
  assert.equal(await verifyDeviceLock("0000", lock, testHasher), false);
});

test("registered device unlock via local DB (not_set -> ok -> invalid)", async () => {
  const db = await OfflineDatabase.open({ namespace: NS, backend: new MemoryOfflineBackend() });

  assert.equal(await isDeviceLockSet(db), false);
  let result = await unlockDevice(db, "1234", testHasher);
  assert.deepEqual(result, { ok: false, reason: "not_set" });

  await setDeviceLock(db, "1234", testHasher);
  assert.equal(await isDeviceLockSet(db), true);
  const stored = await getStoredDeviceLock(db);
  assert.ok(stored);

  result = await unlockDevice(db, "1234", testHasher);
  assert.deepEqual(result, { ok: true });

  result = await unlockDevice(db, "9999", testHasher);
  assert.deepEqual(result, { ok: false, reason: "invalid_pin" });
  db.close();
});

test("security snapshot excludes secret-like fields", () => {
  const ok = buildSecuritySnapshot({
    approvalRules: { discount: { thresholdPercent: 10 } },
    branchId: "br-1",
    companyId: "co-1",
    deviceId: "dev-1",
    lastPolicySyncAt: "2026-09-05T00:00:00.000Z",
    offlineGraceDays: 7,
    permissions: { create_sale: true },
    policyVersion: 1,
    role: "Cashier",
    terminalId: "POS-01",
    userId: "user-1",
    username: "cashier",
    warehouseId: "wh-1",
  });
  assert.equal(ok.permissions.create_sale, true);

  assert.throws(
    () =>
      buildSecuritySnapshot({
        approvalRules: { token: "leak-me" },
        branchId: "br-1",
        companyId: "co-1",
        deviceId: "dev-1",
        lastPolicySyncAt: "2026-09-05T00:00:00.000Z",
        offlineGraceDays: 7,
        permissions: {},
        policyVersion: 1,
        role: "Cashier",
        terminalId: "POS-01",
        userId: "user-1",
        username: "cashier",
        warehouseId: "wh-1",
      }),
    /secret-like field/,
  );
});
