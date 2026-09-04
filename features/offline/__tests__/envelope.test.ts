import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildOperationEnvelope,
  canonicalHash,
  canonicalStringify,
  DuplicateOperationError,
  newOperationId,
  OperationDependencyError,
  topologicalOrder,
} from "../operations/envelope";
import { OperationType } from "../types";

function envInput(overrides: Record<string, unknown> = {}) {
  return {
    deviceId: "dev-1",
    terminalId: "POS-01",
    companyId: "co-1",
    actorUserId: "user-1",
    sequence: 1,
    operationType: OperationType.posSaleComplete,
    payload: { total: 100 },
    ...overrides,
  };
}

test("newOperationId returns unique ids", () => {
  const ids = new Set<string>();
  for (let i = 0; i < 1000; i += 1) {
    ids.add(newOperationId());
  }
  assert.equal(ids.size, 1000);
});

test("canonical stringify is key-order independent", () => {
  const a = canonicalStringify({ b: 1, a: { d: 4, c: 3 } });
  const b = canonicalStringify({ a: { c: 3, d: 4 }, b: 1 });
  assert.equal(a, b);
});

test("canonicalHash is stable for equal payloads regardless of key order", () => {
  const h1 = canonicalHash({ x: 1, y: [1, 2, { m: 1, n: 2 }] });
  const h2 = canonicalHash({ y: [1, 2, { n: 2, m: 1 }], x: 1 });
  assert.equal(h1, h2);
  const h3 = canonicalHash({ x: 1, y: [1, 2, { m: 1, n: 3 }] });
  assert.notEqual(h1, h3);
});

test("buildOperationEnvelope fills defaults and hashes payload", () => {
  const env = buildOperationEnvelope(envInput());
  assert.ok(env.operationId.length > 0);
  assert.equal(env.payloadSchemaVersion, 1);
  assert.deepEqual(env.dependencies, []);
  assert.equal(env.branchId, null);
  assert.equal(env.payloadHash, canonicalHash({ total: 100 }));
  assert.ok(env.createdAt);
});

test("topologicalOrder sorts by sequence when no dependencies", () => {
  const ops = [
    { operationId: "c", sequence: 3, dependencies: [] },
    { operationId: "a", sequence: 1, dependencies: [] },
    { operationId: "b", sequence: 2, dependencies: [] },
  ];
  const ordered = topologicalOrder(ops).map((o) => o.operationId);
  assert.deepEqual(ordered, ["a", "b", "c"]);
});

test("topologicalOrder places dependencies before dependents", () => {
  const ops = [
    { operationId: "sale", sequence: 5, dependencies: ["session"] },
    { operationId: "session", sequence: 9, dependencies: [] },
  ];
  const ordered = topologicalOrder(ops).map((o) => o.operationId);
  assert.deepEqual(ordered, ["session", "sale"]);
});

test("topologicalOrder detects duplicate operationId", () => {
  const ops = [
    { operationId: "dup", sequence: 1, dependencies: [] },
    { operationId: "dup", sequence: 2, dependencies: [] },
  ];
  assert.throws(() => topologicalOrder(ops), DuplicateOperationError);
});

test("topologicalOrder rejects unknown dependency", () => {
  const ops = [{ operationId: "a", sequence: 1, dependencies: ["missing"] }];
  assert.throws(() => topologicalOrder(ops), OperationDependencyError);
});

test("topologicalOrder rejects dependency cycles", () => {
  const ops = [
    { operationId: "a", sequence: 1, dependencies: ["b"] },
    { operationId: "b", sequence: 2, dependencies: ["a"] },
  ];
  assert.throws(() => topologicalOrder(ops), OperationDependencyError);
});

test("topologicalOrder is deterministic across input orderings", () => {
  const base = [
    { operationId: "a", sequence: 1, dependencies: [] },
    { operationId: "b", sequence: 2, dependencies: ["a"] },
    { operationId: "c", sequence: 3, dependencies: ["a"] },
    { operationId: "d", sequence: 4, dependencies: ["b", "c"] },
  ];
  const forward = topologicalOrder([...base]).map((o) => o.operationId);
  const reversed = topologicalOrder([...base].reverse()).map((o) => o.operationId);
  assert.deepEqual(forward, reversed);
  assert.deepEqual(forward, ["a", "b", "c", "d"]);
});
