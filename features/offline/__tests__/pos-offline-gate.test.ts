import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluatePosOfflineGate, type PosGateInput } from "../pos-read/pos-offline-gate";

const NOW = new Date("2026-09-05T12:00:00.000Z");

function input(overrides: Partial<PosGateInput> = {}): PosGateInput {
  return {
    flagEnabled: true,
    online: false,
    syncing: false,
    bootstrapComplete: true,
    replicaValid: true,
    terminalScopeOk: true,
    deviceStatus: "active",
    lastSyncAt: "2026-09-05T11:00:00.000Z", // 1h ago
    now: NOW,
    gracePeriodDays: 7,
    softStaleHours: 24,
    ...overrides,
  };
}

test("flag off keeps the online path and never permits offline reads", () => {
  const r = evaluatePosOfflineGate(input({ flagEnabled: false, online: true }));
  assert.equal(r.state, "online");
  assert.equal(r.offlineReadsPermitted, false);
  assert.equal(r.reason, "offline_disabled");
});

test("online + ready is online with offline fallback permitted", () => {
  const r = evaluatePosOfflineGate(input({ online: true }));
  assert.equal(r.state, "online");
  assert.equal(r.offlineReadsPermitted, true);
});

test("offline + ready + fresh is read_only and permitted", () => {
  const r = evaluatePosOfflineGate(input());
  assert.equal(r.state, "read_only");
  assert.equal(r.offlineReadsPermitted, true);
});

test("offline + soft-stale is stale and still permitted", () => {
  const r = evaluatePosOfflineGate(input({ lastSyncAt: "2026-09-03T00:00:00.000Z" })); // ~2.5d ago
  assert.equal(r.state, "stale");
  assert.equal(r.offlineReadsPermitted, true);
});

test("offline + stale beyond policy is blocked", () => {
  const r = evaluatePosOfflineGate(input({ lastSyncAt: "2026-08-01T00:00:00.000Z" }));
  assert.equal(r.state, "blocked");
  assert.equal(r.offlineReadsPermitted, false);
  assert.equal(r.reason, "stale_beyond_policy");
});

test("offline + revoked device is blocked", () => {
  const r = evaluatePosOfflineGate(input({ deviceStatus: "revoked" }));
  assert.equal(r.state, "blocked");
  assert.equal(r.reason, "device_revoked");
});

test("offline + never bootstrapped is blocked", () => {
  const r = evaluatePosOfflineGate(input({ bootstrapComplete: false }));
  assert.equal(r.state, "blocked");
  assert.equal(r.reason, "never_bootstrapped");
});

test("offline + terminal scope mismatch is blocked", () => {
  const r = evaluatePosOfflineGate(input({ terminalScopeOk: false }));
  assert.equal(r.state, "blocked");
  assert.equal(r.reason, "terminal_scope");
});

test("offline + invalid replica is blocked", () => {
  const r = evaluatePosOfflineGate(input({ replicaValid: false }));
  assert.equal(r.state, "blocked");
  assert.equal(r.reason, "invalid_replica");
});

test("syncing surfaces the syncing state", () => {
  const r = evaluatePosOfflineGate(input({ syncing: true, online: true }));
  assert.equal(r.state, "syncing");
});
