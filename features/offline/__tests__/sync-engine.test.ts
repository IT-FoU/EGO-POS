import assert from "node:assert/strict";
import { test } from "node:test";

import { buildOperationEnvelope, type OfflineOperationEnvelope } from "../operations/envelope";
import { OperationType } from "../types";
import { InMemorySyncStore } from "../server/sync-store";
import {
  bootstrap,
  processPush,
  pullDelta,
  type PushContext,
} from "../server/sync-engine";
import { SyncErrorCode } from "../server/sync-contract";
import type { DeviceAuthzView, ScopeContext } from "../server/authorization";

const NOW = new Date("2026-09-05T00:00:00.000Z");

const SCOPE: ScopeContext = {
  companyId: "co-1",
  branchIds: ["br-1"],
  warehouseIds: ["wh-1"],
  terminalId: "POS-01",
  deviceId: "dev-1",
  userId: "user-1",
};

function device(overrides: Partial<DeviceAuthzView> = {}): DeviceAuthzView {
  return {
    status: "active",
    policyVersion: 1,
    offlineGraceDays: 7,
    lastPolicySyncAt: "2026-09-04T12:00:00.000Z",
    ...overrides,
  };
}

function ctx(overrides: Partial<PushContext> = {}): PushContext {
  return {
    companyId: "co-1",
    deviceId: "dev-1",
    scope: SCOPE,
    device: device(),
    cachedPolicyVersion: 1,
    now: NOW,
    ...overrides,
  };
}

function env(
  operationId: string,
  overrides: Partial<Parameters<typeof buildOperationEnvelope>[0]> = {},
): OfflineOperationEnvelope {
  return buildOperationEnvelope({
    operationId,
    deviceId: "dev-1",
    terminalId: "POS-01",
    companyId: "co-1",
    branchId: "br-1",
    warehouseId: "wh-1",
    actorUserId: "user-1",
    sequence: 1,
    operationType: OperationType.posSaleComplete,
    payload: { total: 100 },
    ...overrides,
  });
}

test("valid batch is accepted and recorded in the ledger", async () => {
  const store = new InMemorySyncStore();
  const res = await processPush(store, ctx(), [env("op-1"), env("op-2", { sequence: 2 })]);
  assert.equal(res.results.length, 2);
  assert.ok(res.results.every((r) => r.status === "accepted"));
  const counts = await store.countOperations("co-1");
  assert.equal(counts.accepted, 2);
});

test("idempotent retry / duplicate delivery returns stored result without re-running", async () => {
  const store = new InMemorySyncStore();
  let applyCalls = 0;
  const context = ctx({
    applyCommand: async () => {
      applyCalls += 1;
      return { status: "accepted", code: SyncErrorCode.ok, detail: null };
    },
  });
  const batch = [env("op-1"), env("op-2", { sequence: 2 })];

  const first = await processPush(store, context, batch);
  assert.ok(first.results.every((r) => r.status === "accepted" && !r.duplicate));
  assert.equal(applyCalls, 2);

  const second = await processPush(store, context, batch);
  assert.ok(second.results.every((r) => r.status === "accepted" && r.duplicate));
  assert.equal(applyCalls, 2, "applyCommand must not run again for duplicates");
  const counts = await store.countOperations("co-1");
  assert.equal(counts.total, 2, "no duplicate ledger rows");
});

test("dependencies are processed in order (dependency before dependent)", async () => {
  const store = new InMemorySyncStore();
  const order: string[] = [];
  const context = ctx({
    applyCommand: async (e) => {
      order.push(e.operationId);
      return { status: "accepted", code: SyncErrorCode.ok, detail: null };
    },
  });
  // Provided out of order: dependent first.
  const res = await processPush(store, context, [
    env("sale", { sequence: 5, dependencies: ["session"] }),
    env("session", { sequence: 9 }),
  ]);
  assert.deepEqual(order, ["session", "sale"]);
  assert.ok(res.results.every((r) => r.status === "accepted"));
});

test("missing dependency blocks (not persisted); a later push with the dependency accepts", async () => {
  const store = new InMemorySyncStore();
  const blocked = await processPush(store, ctx(), [env("sale", { dependencies: ["session"] })]);
  assert.equal(blocked.results[0].status, "blocked");
  assert.equal(blocked.results[0].code, SyncErrorCode.dependencyBlocked);
  assert.equal((await store.countOperations("co-1")).total, 0, "blocked is not persisted");

  const ok = await processPush(store, ctx(), [
    env("session"),
    env("sale", { dependencies: ["session"], sequence: 2 }),
  ]);
  assert.ok(ok.results.every((r) => r.status === "accepted"));
});

test("cross-tenant operation injection is rejected and retained", async () => {
  const store = new InMemorySyncStore();
  const res = await processPush(store, ctx(), [env("op-x", { companyId: "co-2" })]);
  assert.equal(res.results[0].status, "rejected");
  assert.equal(res.results[0].code, SyncErrorCode.tenantMismatch);
  // Rejected result is retained (idempotent); a retry returns the stored result.
  const retry = await processPush(store, ctx(), [env("op-x", { companyId: "co-2" })]);
  assert.equal(retry.results[0].status, "rejected");
  assert.equal(retry.results[0].duplicate, true);
});

test("invalid terminal is rejected", async () => {
  const store = new InMemorySyncStore();
  const res = await processPush(store, ctx(), [env("op-y", { terminalId: "POS-99" })]);
  assert.equal(res.results[0].status, "rejected");
  assert.equal(res.results[0].code, SyncErrorCode.invalidTerminal);
});

test("stale cached policy blocks the whole batch until refreshed", async () => {
  const store = new InMemorySyncStore();
  const staleCtx = ctx({ cachedPolicyVersion: 1, device: device({ policyVersion: 2 }) });
  const blocked = await processPush(store, staleCtx, [env("op-1")]);
  assert.equal(blocked.results[0].status, "blocked");
  assert.equal(blocked.results[0].code, SyncErrorCode.stalePolicy);
  assert.equal((await store.countOperations("co-1")).total, 0);

  const fresh = ctx({ cachedPolicyVersion: 2, device: device({ policyVersion: 2 }) });
  const ok = await processPush(store, fresh, [env("op-1")]);
  assert.equal(ok.results[0].status, "accepted");
});

test("tenant isolation: another company cannot see stored operations", async () => {
  const store = new InMemorySyncStore();
  await processPush(store, ctx(), [env("op-1")]);
  assert.equal(await store.getOperationResult("co-2", "op-1"), null);
  assert.equal((await store.countOperations("co-2")).total, 0);
  assert.equal((await store.countOperations("co-1")).total, 1);
});

test("duplicate operationId within a single batch rejects the later copy", async () => {
  const store = new InMemorySyncStore();
  const res = await processPush(store, ctx(), [env("dup"), env("dup", { sequence: 2 })]);
  const statuses = res.results.map((r) => r.status);
  assert.equal(statuses.filter((s) => s === "accepted").length, 1);
  assert.equal(statuses.filter((s) => s === "rejected").length, 1);
});

test("cursor-based delta pull is deterministic, paginates, and never seeds when empty", async () => {
  const store = new InMemorySyncStore();
  // Empty feed: empty result, cursor unchanged, no seeding.
  const empty = await pullDelta(store, "co-1", "dev-1", { schemaVersion: 1, cursor: 0, limit: 10 });
  assert.deepEqual(empty.changes, []);
  assert.equal(empty.hasMore, false);
  assert.equal(empty.nextCursor, 0);

  store.seedChange("co-1", { entityType: "product", entityId: "p1", version: 1, deleted: false, payload: {} });
  store.seedChange("co-1", { entityType: "product", entityId: "p2", version: 1, deleted: false, payload: {} });
  store.seedChange("co-1", { entityType: "product", entityId: "p1", version: 2, deleted: true, payload: null });
  store.seedChange("co-2", { entityType: "product", entityId: "x", version: 1, deleted: false, payload: {} });

  const page1 = await pullDelta(store, "co-1", "dev-1", { schemaVersion: 1, cursor: 0, limit: 2 });
  assert.equal(page1.changes.length, 2);
  assert.equal(page1.hasMore, true);
  assert.equal(page1.nextCursor, 2);

  const page2 = await pullDelta(store, "co-1", "dev-1", { schemaVersion: 1, cursor: page1.nextCursor, limit: 2 });
  assert.equal(page2.changes.length, 1);
  assert.equal(page2.hasMore, false);
  assert.equal(page2.changes[0].deleted, true, "tombstone is delivered");
  // co-2 change never leaks into co-1 pulls.
  assert.ok(page1.changes.concat(page2.changes).every((c) => c.entityId !== "x"));
});

test("bootstrap paginates and reports completion; empty is complete (no seed)", async () => {
  const store = new InMemorySyncStore();
  const emptyBoot = await bootstrap(store, "co-1", { schemaVersion: 1, cursor: 0, limit: 10 });
  assert.deepEqual(emptyBoot.entities, []);
  assert.equal(emptyBoot.complete, true);

  store.seedBootstrapEntity({ companyId: "co-1", entityType: "product", entityId: "p1", version: 1, payload: {} });
  store.seedBootstrapEntity({ companyId: "co-1", entityType: "product", entityId: "p2", version: 1, payload: {} });
  const b1 = await bootstrap(store, "co-1", { schemaVersion: 1, cursor: 0, limit: 1 });
  assert.equal(b1.entities.length, 1);
  assert.equal(b1.hasMore, true);
  assert.equal(b1.complete, false);
  const b2 = await bootstrap(store, "co-1", { schemaVersion: 1, cursor: b1.nextCursor, limit: 1 });
  assert.equal(b2.complete, true);
});
