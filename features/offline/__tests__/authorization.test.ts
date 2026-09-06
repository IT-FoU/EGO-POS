import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertOperationScope,
  daysSincePolicySync,
  evaluateOfflineWriteAuthorization,
  isWithinGrace,
  OfflineScopeError,
  type DeviceAuthzView,
  type ScopeContext,
  type ScopedEnvelope,
} from "../server/authorization";
import { OfflineDenyReason } from "../server/types";

const NOW = new Date("2026-09-05T00:00:00.000Z");

function activeDevice(overrides: Partial<DeviceAuthzView> = {}): DeviceAuthzView {
  return {
    status: "active",
    policyVersion: 3,
    offlineGraceDays: 7,
    lastPolicySyncAt: "2026-09-04T00:00:00.000Z",
    ...overrides,
  };
}

function evalWith(overrides: Partial<Parameters<typeof evaluateOfflineWriteAuthorization>[0]> = {}) {
  return evaluateOfflineWriteAuthorization({
    device: activeDevice(),
    cachedPolicyVersion: 3,
    permissionGranted: true,
    userEnabled: true,
    now: NOW,
    ...overrides,
  });
}

test("first-use (no registered device) denies offline writes", () => {
  const result = evalWith({ device: null });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, OfflineDenyReason.deviceNotFound);
});

test("pending device is not authorized until activated", () => {
  const result = evalWith({ device: activeDevice({ status: "pending" }) });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, OfflineDenyReason.deviceNotActivated);
  assert.equal(result.readOnly, true);
});

test("revoked device is blocked but remains readable", () => {
  const result = evalWith({ device: activeDevice({ status: "revoked" }) });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, OfflineDenyReason.deviceRevoked);
  assert.equal(result.readOnly, true);
});

test("disabled user is blocked", () => {
  const result = evalWith({ userEnabled: false });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, OfflineDenyReason.userDisabled);
});

test("missing permission is blocked", () => {
  const result = evalWith({ permissionGranted: false });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, OfflineDenyReason.permissionDenied);
});

test("stale cached policy version forces refresh before writes", () => {
  const result = evalWith({ cachedPolicyVersion: 2, device: activeDevice({ policyVersion: 3 }) });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, OfflineDenyReason.policyStale);
});

test("expired grace blocks writes but preserves read access", () => {
  const result = evalWith({
    device: activeDevice({ lastPolicySyncAt: "2026-08-20T00:00:00.000Z", offlineGraceDays: 7 }),
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, OfflineDenyReason.graceExpired);
  assert.equal(result.readOnly, true);
});

test("active, permitted, within grace is authorized", () => {
  const result = evalWith();
  assert.equal(result.allowed, true);
  assert.equal(result.reason, OfflineDenyReason.ok);
});

test("grace helpers compute elapsed days and window", () => {
  assert.equal(daysSincePolicySync(null, NOW), Number.POSITIVE_INFINITY);
  assert.equal(Math.round(daysSincePolicySync("2026-09-04T00:00:00.000Z", NOW)), 1);
  assert.equal(isWithinGrace("2026-09-04T00:00:00.000Z", 7, NOW), true);
  assert.equal(isWithinGrace("2026-08-20T00:00:00.000Z", 7, NOW), false);
});

// ---- scope enforcement ----

const SCOPE: ScopeContext = {
  companyId: "co-1",
  branchIds: ["br-1", "br-2"],
  warehouseIds: ["wh-1"],
  terminalId: "POS-01",
  deviceId: "dev-1",
  userId: "user-1",
};

function envelope(overrides: Partial<ScopedEnvelope> = {}): ScopedEnvelope {
  return {
    companyId: "co-1",
    branchId: "br-1",
    warehouseId: "wh-1",
    terminalId: "POS-01",
    deviceId: "dev-1",
    actorUserId: "user-1",
    ...overrides,
  };
}

test("assertOperationScope accepts an in-scope envelope", () => {
  assert.doesNotThrow(() => assertOperationScope(envelope(), SCOPE));
});

test("assertOperationScope rejects cross-tenant injection", () => {
  try {
    assertOperationScope(envelope({ companyId: "co-2" }), SCOPE);
    assert.fail("expected throw");
  } catch (error) {
    assert.ok(error instanceof OfflineScopeError);
    assert.equal((error as OfflineScopeError).reason, OfflineDenyReason.tenantMismatch);
  }
});

test("assertOperationScope rejects an invalid terminal/device", () => {
  assert.throws(() => assertOperationScope(envelope({ deviceId: "dev-x" }), SCOPE), OfflineScopeError);
  assert.throws(() => assertOperationScope(envelope({ terminalId: "POS-99" }), SCOPE), OfflineScopeError);
});

test("assertOperationScope rejects out-of-scope branch and warehouse", () => {
  assert.throws(() => assertOperationScope(envelope({ branchId: "br-9" }), SCOPE), OfflineScopeError);
  assert.throws(() => assertOperationScope(envelope({ warehouseId: "wh-9" }), SCOPE), OfflineScopeError);
});

test("assertOperationScope rejects a mismatched actor", () => {
  assert.throws(() => assertOperationScope(envelope({ actorUserId: "user-2" }), SCOPE), OfflineScopeError);
});
