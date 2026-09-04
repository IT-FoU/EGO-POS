import assert from "node:assert/strict";
import { test } from "node:test";

import { MemoryOfflineBackend } from "../local-db/memory-backend";
import { OfflineDatabase } from "../local-db/database";
import { OfflineStore } from "../local-db/schema";
import { commitLocalAndQueue } from "../commit";
import { DuplicateOperationError } from "../operations/envelope";
import {
  canTransition,
  getOutboxRecord,
  listOutbox,
  listPendingOutbox,
  updateOutboxStatus,
  InvalidOperationTransitionError,
} from "../outbox/outbox";
import { OperationType, type BaseLocalEntity } from "../types";

const NS = { companyId: "co-1", branchId: "br-1", terminalId: "POS-01" };
const CTX = { deviceId: "dev-1", terminalId: "POS-01" };

async function openDb() {
  return OfflineDatabase.open({ namespace: NS, backend: new MemoryOfflineBackend() });
}

function saleWrite(id: string) {
  return {
    store: OfflineStore.sales,
    entity: { id, companyId: "co-1", branchId: "br-1", total: 100 },
  } as const;
}

function saleEnvelope(operationId?: string) {
  return {
    operationId,
    companyId: "co-1",
    branchId: "br-1",
    actorUserId: "user-1",
    operationType: OperationType.posSaleComplete,
    payload: { total: 100 },
  };
}

test("commitLocalAndQueue writes entity and outbox atomically", async () => {
  const db = await openDb();
  const result = await commitLocalAndQueue(db, {
    writes: [saleWrite("s1")],
    envelope: saleEnvelope(),
    context: CTX,
  });

  const entity = await db.read<BaseLocalEntity & { total: number }>(OfflineStore.sales, "s1");
  assert.ok(entity);
  assert.equal(entity?.total, 100);
  assert.equal(entity?.syncStatus, "pending_create");
  assert.equal(entity?.localVersion, 1);
  assert.equal(entity?.source.deviceId, "dev-1");
  assert.equal(entity?.source.fromServer, false);

  const outbox = await db.read(OfflineStore.outbox, result.envelope.operationId);
  assert.ok(outbox, "outbox record must exist");
  assert.equal(result.outbox.status, "pending");
  assert.equal(result.envelope.sequence, 1);
  db.close();
});

test("sequence is monotonic and outbox is ordered by sequence", async () => {
  const db = await openDb();
  const r1 = await commitLocalAndQueue(db, { writes: [saleWrite("s1")], envelope: saleEnvelope(), context: CTX });
  const r2 = await commitLocalAndQueue(db, { writes: [saleWrite("s2")], envelope: saleEnvelope(), context: CTX });
  const r3 = await commitLocalAndQueue(db, { writes: [saleWrite("s3")], envelope: saleEnvelope(), context: CTX });

  assert.deepEqual(
    [r1.envelope.sequence, r2.envelope.sequence, r3.envelope.sequence],
    [1, 2, 3],
  );

  const ordered = await db.transaction([OfflineStore.outbox], "readonly", (tx) => listOutbox(tx));
  assert.deepEqual(ordered.map((o) => o.sequence), [1, 2, 3]);
  db.close();
});

test("duplicate operationId is rejected and does not double-apply", async () => {
  const db = await openDb();
  const fixedId = "fixed-op-1";
  await commitLocalAndQueue(db, {
    writes: [saleWrite("s1")],
    envelope: saleEnvelope(fixedId),
    context: CTX,
  });

  await assert.rejects(
    commitLocalAndQueue(db, {
      writes: [saleWrite("s1")],
      envelope: saleEnvelope(fixedId),
      context: CTX,
    }),
    DuplicateOperationError,
  );

  // Entity not double-applied (localVersion still 1) and only one outbox record.
  const entity = await db.read<BaseLocalEntity>(OfflineStore.sales, "s1");
  assert.equal(entity?.localVersion, 1);
  const all = await db.transaction([OfflineStore.outbox], "readonly", (tx) => listOutbox(tx));
  assert.equal(all.length, 1);
  db.close();
});

test("second commit with same operationId does not advance sequence (rolled back)", async () => {
  const db = await openDb();
  const fixedId = "fixed-op-2";
  await commitLocalAndQueue(db, { writes: [saleWrite("s1")], envelope: saleEnvelope(fixedId), context: CTX });
  await assert.rejects(
    commitLocalAndQueue(db, { writes: [saleWrite("s2")], envelope: saleEnvelope(fixedId), context: CTX }),
    DuplicateOperationError,
  );
  // A fresh op should get sequence 2 (the failed attempt's allocation rolled back).
  const r = await commitLocalAndQueue(db, { writes: [saleWrite("s3")], envelope: saleEnvelope(), context: CTX });
  assert.equal(r.envelope.sequence, 2);
  db.close();
});

test("pending list reflects status transitions", async () => {
  const db = await openDb();
  const { envelope } = await commitLocalAndQueue(db, {
    writes: [saleWrite("s1")],
    envelope: saleEnvelope(),
    context: CTX,
  });

  let pending = await db.transaction([OfflineStore.outbox], "readonly", (tx) => listPendingOutbox(tx));
  assert.equal(pending.length, 1);

  await db.transaction([OfflineStore.outbox], "readwrite", (tx) =>
    updateOutboxStatus(tx, envelope.operationId, { status: "syncing" }),
  );
  await db.transaction([OfflineStore.outbox], "readwrite", (tx) =>
    updateOutboxStatus(tx, envelope.operationId, { status: "synced" }),
  );

  pending = await db.transaction([OfflineStore.outbox], "readonly", (tx) => listPendingOutbox(tx));
  assert.equal(pending.length, 0);
  const record = await db.transaction([OfflineStore.outbox], "readonly", (tx) =>
    getOutboxRecord(tx, envelope.operationId),
  );
  assert.equal(record?.status, "synced");
  db.close();
});

test("invalid status transition is rejected (terminal states are final)", async () => {
  const db = await openDb();
  const { envelope } = await commitLocalAndQueue(db, {
    writes: [saleWrite("s1")],
    envelope: saleEnvelope(),
    context: CTX,
  });
  await db.transaction([OfflineStore.outbox], "readwrite", (tx) =>
    updateOutboxStatus(tx, envelope.operationId, { status: "syncing" }),
  );
  await db.transaction([OfflineStore.outbox], "readwrite", (tx) =>
    updateOutboxStatus(tx, envelope.operationId, { status: "rejected", errorCode: "E_TEST" }),
  );
  await assert.rejects(
    db.transaction([OfflineStore.outbox], "readwrite", (tx) =>
      updateOutboxStatus(tx, envelope.operationId, { status: "syncing" }),
    ),
    InvalidOperationTransitionError,
  );
  db.close();
});

test("status transition matrix guards", () => {
  assert.equal(canTransition("pending", "syncing"), true);
  assert.equal(canTransition("syncing", "synced"), true);
  assert.equal(canTransition("synced", "pending"), false);
  assert.equal(canTransition("rejected", "syncing"), false);
  assert.equal(canTransition("retryable", "syncing"), true);
});
