import assert from "node:assert/strict";
import { test } from "node:test";

import { MemoryOfflineBackend } from "../local-db/memory-backend";
import { OfflineDatabase } from "../local-db/database";
import { LocalDbMigrationError, type Migration } from "../local-db/migrations";
import { MetaKey, OfflineStore } from "../local-db/schema";
import type { StoreNamespace } from "../types";

const NS: StoreNamespace = { companyId: "co-1", branchId: "br-1", terminalId: "POS-01" };
const NS_B: StoreNamespace = { companyId: "co-2", branchId: "br-9", terminalId: "POS-02" };

test("open creates stores and records schema version", async () => {
  const backend = new MemoryOfflineBackend();
  const db = await OfflineDatabase.open({ namespace: NS, backend });
  assert.equal(await db.getSchemaVersion(), 1);
  assert.ok(db.stores.includes(OfflineStore.outbox));
  assert.ok(db.stores.includes(OfflineStore.sales));
  db.close();
});

test("migration runner advances to target version", async () => {
  const backend = new MemoryOfflineBackend();
  let ran = 0;
  const migrations: Migration[] = [
    { toVersion: 1, description: "v1", migrate: async () => { ran += 1; } },
    { toVersion: 2, description: "v2", migrate: async () => { ran += 1; } },
  ];
  const db = await OfflineDatabase.open({ namespace: NS, backend, migrations, schemaVersion: 2 });
  assert.equal(await db.getSchemaVersion(), 2);
  assert.equal(ran, 2);
  db.close();
});

test("failed migration preserves old database and version (no partial writes)", async () => {
  const backend = new MemoryOfflineBackend();

  // Step 1: open at v1 and write a domain record.
  const dbV1 = await OfflineDatabase.open({
    namespace: NS,
    backend,
    migrations: [{ toVersion: 1, description: "v1", migrate: async () => {} }],
    schemaVersion: 1,
  });
  await dbV1.transaction([OfflineStore.products], "readwrite", async (tx) => {
    await tx.put(OfflineStore.products, { id: "p1", name: "Water" });
  });
  dbV1.close();

  // Step 2: attempt an upgrade to v2 whose migration writes then throws.
  const throwingMigrations: Migration[] = [
    { toVersion: 1, description: "v1", migrate: async () => {} },
    {
      toVersion: 2,
      description: "v2 (fails)",
      migrate: async (tx) => {
        await tx.put(OfflineStore.products, { id: "p2-partial", name: "Should roll back" });
        throw new Error("boom during migration");
      },
    },
  ];
  await assert.rejects(
    OfflineDatabase.open({ namespace: NS, backend, migrations: throwingMigrations, schemaVersion: 2 }),
    LocalDbMigrationError,
  );

  // Step 3: reopen at v1 — old data intact, version unchanged, partial write gone.
  const reopened = await OfflineDatabase.open({
    namespace: NS,
    backend,
    migrations: [{ toVersion: 1, description: "v1", migrate: async () => {} }],
    schemaVersion: 1,
  });
  assert.equal(await reopened.getSchemaVersion(), 1);
  const original = await reopened.read(OfflineStore.products, "p1");
  assert.ok(original, "original record must survive failed migration");
  const partial = await reopened.read(OfflineStore.products, "p2-partial");
  assert.equal(partial, undefined, "partial migration write must be rolled back");
  reopened.close();
});

test("databases are isolated per company+branch+terminal", async () => {
  const backend = new MemoryOfflineBackend();
  const dbA = await OfflineDatabase.open({ namespace: NS, backend });
  await dbA.transaction([OfflineStore.customers], "readwrite", async (tx) => {
    await tx.put(OfflineStore.customers, { id: "c1", name: "A store customer" });
  });

  const dbB = await OfflineDatabase.open({ namespace: NS_B, backend });
  const leaked = await dbB.read(OfflineStore.customers, "c1");
  assert.equal(leaked, undefined, "store B must not read store A's cache");
  assert.notEqual(dbA.name, dbB.name);
  dbA.close();
  dbB.close();
});

test("reload persistence: data survives close and reopen", async () => {
  const backend = new MemoryOfflineBackend();
  const db = await OfflineDatabase.open({ namespace: NS, backend });
  await db.transaction([OfflineStore.sales], "readwrite", async (tx) => {
    await tx.put(OfflineStore.sales, { id: "s1", total: 42 });
  });
  db.close();

  const reopened = await OfflineDatabase.open({ namespace: NS, backend });
  const record = await reopened.read<{ id: string; total: number }>(OfflineStore.sales, "s1");
  assert.ok(record);
  assert.equal(record?.total, 42);
  reopened.close();
});

test("transaction is atomic: throw rolls back all writes and sequence", async () => {
  const backend = new MemoryOfflineBackend();
  const db = await OfflineDatabase.open({ namespace: NS, backend });

  await assert.rejects(
    db.transaction([OfflineStore.sales, OfflineStore.meta], "readwrite", async (tx) => {
      await tx.put(OfflineStore.sales, { id: "sx", total: 1 });
      await OfflineDatabase.nextSequence(tx);
      throw new Error("boom");
    }),
    /boom/,
  );

  const record = await db.read(OfflineStore.sales, "sx");
  assert.equal(record, undefined, "entity write must roll back");
  const seq = await db.read<{ id: string; value: number }>(OfflineStore.meta, MetaKey.sequence);
  assert.equal(seq, undefined, "sequence allocation must roll back");
  db.close();
});
