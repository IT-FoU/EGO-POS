import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SYNC_SCHEMA_VERSION,
  validateBootstrapRequest,
  validatePullRequest,
  validatePushRequest,
} from "../server/sync-contract";
import { buildOperationEnvelope } from "../operations/envelope";
import { OperationType } from "../types";

function goodEnvelope() {
  return buildOperationEnvelope({
    operationId: "op-1",
    deviceId: "dev-1",
    terminalId: "POS-01",
    companyId: "co-1",
    actorUserId: "user-1",
    sequence: 1,
    operationType: OperationType.posSaleComplete,
    payload: {},
  });
}

test("push validation accepts a well-formed request", () => {
  const result = validatePushRequest({
    schemaVersion: SYNC_SCHEMA_VERSION,
    deviceId: "dev-1",
    operations: [goodEnvelope()],
  });
  assert.equal(result.ok, true);
});

test("push validation rejects an unsupported schema version", () => {
  const result = validatePushRequest({ schemaVersion: 999, deviceId: "dev-1", operations: [] });
  assert.equal(result.ok, false);
});

test("push validation rejects a missing deviceId and malformed operations", () => {
  assert.equal(validatePushRequest({ operations: [] }).ok, false);
  const bad = validatePushRequest({ deviceId: "dev-1", operations: [{ nope: true }] });
  assert.equal(bad.ok, false);
});

test("pull validation clamps cursor and limit", () => {
  const result = validatePullRequest({ cursor: "-5", limit: "999999" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.cursor, 0);
    assert.equal(result.value.limit, 1000);
    assert.equal(result.value.schemaVersion, SYNC_SCHEMA_VERSION);
  }
});

test("bootstrap validation defaults are sane", () => {
  const result = validateBootstrapRequest({});
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.cursor, 0);
    assert.ok(result.value.limit > 0);
  }
});

test("pull validation rejects an unsupported schema version", () => {
  assert.equal(validatePullRequest({ schemaVersion: 2 }).ok, false);
});
